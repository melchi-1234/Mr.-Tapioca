-- ════════════════════════════════════════════════════════════════════════════
-- Mr. Tapioca — Supabase setup (run ONCE in the SQL Editor).
-- Creates the live Study Squad backend: profiles, follows, add-by-code,
-- a friends leaderboard, account deletion, and automatic cleanup.
-- Security model was adversarially reviewed: the public anon key can do NOTHING
-- beyond what these Row-Level Security rules + RPCs allow.
--
-- NOTE ON focus_minutes (v1): it's a soft, server-clamped stat (vanity leaderboard
-- only). Before you ever wire focus minutes to REAL partner discounts, replace it
-- with an append-only, server-clock-validated `focus_sessions` table so minutes
-- can't be forged. See the "FUTURE HARDENING" note at the bottom.
-- ════════════════════════════════════════════════════════════════════════════

-- 0. EXTENSIONS ---------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;   -- gen_random_bytes
-- pg_cron: enable via Dashboard → Database → Extensions (Setup guide Part D).

-- 1. PROFILES ----------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid        primary key references auth.users (id) on delete cascade,
  display_name  text        not null default 'Boba Friend'
                            check (char_length(display_name) between 1 and 24),
  skin          text        not null default '' check (char_length(skin) <= 40),
  focus_minutes integer     not null default 0  check (focus_minutes between 0 and 100000000),
  drinks        integer     not null default 0  check (drinks between 0 and 100000),
  streak        integer     not null default 0  check (streak between 0 and 100000),
  status        text        not null default 'idle' check (status in ('idle','focusing','break')),
  friend_code   text        not null unique     check (friend_code ~ '^[A-Z2-9]{6}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. FRIENDSHIPS (directed follow: follower sees friend's stats) --------------
create table if not exists public.friendships (
  follower_id uuid        not null references public.profiles (id) on delete cascade,
  friend_id   uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, friend_id),
  check (follower_id <> friend_id)
);
create index if not exists friendships_friend_id_idx on public.friendships (friend_id);

-- 3. ADD-FRIEND RATE LIMIT (one counter row per user, window-reset) ----------
create table if not exists public.add_rate (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  count        integer     not null default 0
);
alter table public.add_rate enable row level security;   -- no policies → RPC-only

-- 4. FRIEND-CODE GENERATOR (rejection sampling → no modulo bias) --------------
create or replace function public.gen_friend_code()
returns text language plpgsql set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 31 chars, no 0/O/1/I
  n        constant int  := 31;
  maxfair  constant int  := (256 / 31) * 31;   -- 248: reject bytes >= this
  code text; b int;
begin
  loop
    code := '';
    while char_length(code) < 6 loop
      b := get_byte(extensions.gen_random_bytes(1), 0);
      if b < maxfair then code := code || substr(alphabet, 1 + (b % n), 1); end if;
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end; $$;

-- 5. NEW-USER TRIGGER — make a profile + code when an account is created ------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare attempts int := 0;
begin
  loop
    begin
      insert into public.profiles (id, friend_code) values (new.id, public.gen_friend_code());
      return new;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = new.id) then return new; end if;
      attempts := attempts + 1; if attempts >= 5 then raise; end if;
    end;
  end loop;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 6. updated_at touch ---------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles for each row execute function public.touch_updated_at();

-- 7. ENABLE + FORCE RLS -------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.profiles    force  row level security;
alter table public.friendships enable row level security;
alter table public.friendships force  row level security;

-- 8. is_following helper ------------------------------------------------------
create or replace function public.is_following(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.friendships f
                 where f.follower_id = auth.uid() and f.friend_id = target);
$$;
revoke all on function public.is_following(uuid) from public, anon;
grant execute on function public.is_following(uuid) to authenticated;

-- 9. PROFILES policies + COLUMN GRANTS ---------------------------------------
--   friend_code is NEVER SELECTable for other rows (excluded from the grant) —
--   it's the access token. focus_minutes is excluded from the UPDATE grant, so it
--   can only move through the clamped set_my_profile() RPC, never a direct write.
drop policy if exists "profiles_select_self_or_followed" on public.profiles;
create policy "profiles_select_self_or_followed" on public.profiles
  for select to authenticated using ( id = auth.uid() or public.is_following(id) );
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated using ( id = auth.uid() ) with check ( id = auth.uid() );
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check ( id = auth.uid() );

revoke select, insert, update, delete on public.profiles from authenticated, anon;
grant select (id, display_name, skin, focus_minutes, drinks, streak, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name, skin, drinks, streak) on public.profiles to authenticated;
grant insert (id) on public.profiles to authenticated;

-- 10. FRIENDSHIPS policies + grants ------------------------------------------
drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own" on public.friendships
  for select to authenticated using ( follower_id = auth.uid() );
drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own" on public.friendships
  for delete to authenticated using ( follower_id = auth.uid() );
revoke select, insert, update, delete on public.friendships from authenticated, anon;
grant select, delete on public.friendships to authenticated;

-- 11. RPC: your own friend code ----------------------------------------------
create or replace function public.get_my_friend_code()
returns text language sql security definer stable set search_path = public as $$
  select friend_code from public.profiles where id = auth.uid();
$$;
revoke all on function public.get_my_friend_code() from public, anon;
grant execute on function public.get_my_friend_code() to authenticated;

-- 12. RPC: add a friend by code (rate-limited 10/hr per user) -----------------
create or replace function public.add_friend_by_code(p_code text)
returns table (id uuid, display_name text, skin text,
               focus_minutes integer, drinks integer, streak integer)
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_target uuid; v_cnt int; v_win timestamptz;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;

  insert into public.add_rate (user_id, window_start, count) values (v_me, now(), 0)
    on conflict (user_id) do nothing;
  select window_start, count into v_win, v_cnt from public.add_rate where user_id = v_me for update;
  if v_win < now() - interval '1 hour' then
    update public.add_rate set window_start = now(), count = 1 where user_id = v_me;
  elsif v_cnt >= 10 then
    raise exception 'too many attempts, try later' using errcode='P0001';
  else
    update public.add_rate set count = count + 1 where user_id = v_me;
  end if;

  select pr.id into v_target from public.profiles pr where pr.friend_code = upper(trim(p_code));
  if v_target is null then raise exception 'invalid friend code' using errcode='P0002'; end if;
  if v_target = v_me  then raise exception 'cannot add yourself'  using errcode='P0001'; end if;

  insert into public.friendships (follower_id, friend_id) values (v_me, v_target)
    on conflict do nothing;
  return query select pr.id, pr.display_name, pr.skin, pr.focus_minutes, pr.drinks, pr.streak
               from public.profiles pr where pr.id = v_target;
end; $$;
revoke all on function public.add_friend_by_code(text) from public, anon;
grant execute on function public.add_friend_by_code(text) to authenticated;

-- 13. RPC: leaderboard = self + everyone I follow (single RLS-safe call) ------
create or replace function public.get_my_friends()
returns table (id uuid, display_name text, skin text, focus_minutes integer,
               drinks integer, streak integer, status text, is_me boolean, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select pr.id, pr.display_name, pr.skin, pr.focus_minutes, pr.drinks, pr.streak, pr.status,
         (pr.id = auth.uid()) as is_me, pr.updated_at
  from public.profiles pr
  where pr.id = auth.uid()
     or pr.id in (select f.friend_id from public.friendships f where f.follower_id = auth.uid())
  order by pr.focus_minutes desc, pr.display_name asc;
$$;
revoke all on function public.get_my_friends() from public, anon;
grant execute on function public.get_my_friends() to authenticated;

-- 14. RPC: update my own cosmetic + soft stats -------------------------------
--   focus_minutes: seeds from the device on first sync (when 0), then may only
--   grow by at most one day (1440 min) per call — a sanity clamp, not anti-forgery
--   (see FUTURE HARDENING). drinks/streak are clamped to sane growth too.
create or replace function public.set_my_profile(
  p_display_name text default null, p_skin text default null,
  p_focus_minutes integer default null, p_drinks integer default null, p_streak integer default null,
  p_status text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_fm int; v_dr int; v_st int;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;
  select focus_minutes, drinks, streak into v_fm, v_dr, v_st from public.profiles where id = v_me;
  update public.profiles set
    display_name  = coalesce(nullif(trim(p_display_name), ''), display_name),
    skin          = coalesce(p_skin, skin),
    focus_minutes = coalesce(
                      case when v_fm = 0 then greatest(0, least(p_focus_minutes, 100000000))
                           else least(greatest(p_focus_minutes, v_fm), v_fm + 1440) end,
                      v_fm),
    drinks        = coalesce(least(greatest(p_drinks, v_dr), v_dr + 100), v_dr),
    streak        = coalesce(greatest(0, least(p_streak, 100000)), v_st),
    status        = case when p_status in ('idle','focusing','break') then p_status else status end
  where id = v_me;
end; $$;
revoke all on function public.set_my_profile(text,text,integer,integer,integer,text) from public, anon;
grant execute on function public.set_my_profile(text,text,integer,integer,integer,text) to authenticated;

-- 15. RPC: rotate my friend code / remove a follower -------------------------
create or replace function public.rotate_friend_code()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_code text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;
  v_code := public.gen_friend_code();
  update public.profiles set friend_code = v_code where id = v_me;
  return v_code;
end; $$;
revoke all on function public.rotate_friend_code() from public, anon;
grant execute on function public.rotate_friend_code() to authenticated;

-- 16. RPC: in-app account deletion (Apple-required) --------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;
  delete from auth.users where id = v_me;   -- FK cascade wipes profile/friendships/rate row
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 17. CLEANUP JOBS (pg_cron) — keep the free tier tidy -----------------------
--   Safe to skip if pg_cron isn't available; run these statements manually then.
select cron.schedule('prune_dead_anon', '17 4 * * *', $cron$
  delete from auth.users u
  where u.is_anonymous = true
    and u.created_at < now() - interval '30 days'
    and not exists (select 1 from public.friendships f where f.follower_id = u.id or f.friend_id = u.id)
    and coalesce((select p.focus_minutes from public.profiles p where p.id = u.id), 0) = 0;
$cron$);
select cron.schedule('prune_add_rate', '23 * * * *', $cron$
  delete from public.add_rate where window_start < now() - interval '1 day';
$cron$);

-- ════════════════════════════════════════════════════════════════════════════
-- FUTURE HARDENING (do this BEFORE wiring focus minutes to real money/discounts):
-- replace the soft focus_minutes column with an append-only focus_sessions table
-- written by server-clock-validated open/close RPCs, and remove focus_minutes
-- from set_my_profile. That makes redeemable minutes impossible to forge from the
-- client. Not needed for the vanity leaderboard. Realtime is intentionally OFF
-- (the leaderboard refreshes on open); enable private-channel broadcast only after
-- re-verifying RLS with a second user's token.
-- ════════════════════════════════════════════════════════════════════════════

-- 18. DRINK METRICS — anonymous finished-drink counter (metrics.js) ----------
--   One row per finished drink so Demo Day progress ("N drinks, M focus
--   minutes, K devices") is measurable. Clients may only INSERT; read the
--   numbers in the dashboard (Table Editor or SQL) with your owner login.
--   Best-effort and client-forgeable: fine for a progress counter, never for
--   money or partner discounts (see FUTURE HARDENING above).
create table if not exists public.drink_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device     text not null check (char_length(device) between 8 and 64),
  size       text not null check (char_length(size) between 1 and 24),
  minutes    int  not null check (minutes between 1 and 1440),
  platform   text not null check (platform in ('ios','web'))
);
alter table public.drink_events enable row level security;
revoke all on public.drink_events from public, anon, authenticated;
grant insert on public.drink_events to anon, authenticated;
-- Insert-only by design: no select/update/delete policies exist, so the public
-- key can add rows but never read or change them.
create policy drink_events_insert on public.drink_events
  for insert to anon, authenticated with check (true);

-- Quick totals for your dashboard (run in the SQL editor whenever you want):
--   select count(*) as drinks, count(distinct device) as devices,
--          sum(minutes) as focus_minutes from public.drink_events;
