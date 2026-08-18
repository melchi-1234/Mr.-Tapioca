-- ════════════════════════════════════════════════════════════════════════════
-- Mr. Tapioca — REWARD V2 (run ONCE in the SQL Editor, AFTER supabase-setup.sql)
--
-- This is the "FUTURE HARDENING" note at the bottom of supabase-setup.sql, built.
-- That note said, correctly, that `profiles.focus_minutes` is a soft client-pushed
-- number and must never be wired to a real discount. Reward V2 does not harden
-- that column. It leaves it alone as the vanity leaderboard stat it is, and adds a
-- SEPARATE, append-only, server-clock ledger that merchant rewards hang off.
--
-- Two ledgers, on purpose:
--   profiles.focus_minutes  → leaderboard, cosmetics, streaks. Client-pushed, soft.
--   reward_sessions         → merchant reward eligibility ONLY. Server clock.
-- Pearls and cosmetics never read the second one, and a real discount never reads
-- the first one.
--
-- WHAT THIS CAN AND CANNOT PROVE. Read this before repeating any of it to a shop.
--   CAN: that a session was opened and closed against the SERVER's clock, with the
--        elapsed wall-clock time between them; that a reward was issued exactly
--        once per completed threshold; that a reward was redeemed exactly once,
--        even under simultaneous requests.
--   CANNOT: that a human was studying, that a phone was face-down, or that Screen
--        Time was actually shielding anything. `platform` and `shield_claimed` are
--        CLIENT ASSERTIONS. A scripted client can open a session claiming ios and
--        wait four hours of real time. Device attestation (App Attest) is the fix
--        and is specified in §9 but NOT implemented. Nobody may describe this
--        system as fraud-proof or as "verified study time".
--
-- Everything here follows supabase-setup.sql's model: tables are RLS-on with no
-- policies (RPC-only), every RPC is security definer, execute is revoked from
-- public/anon and granted to authenticated.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. REWARD POLICIES ---------------------------------------------------------
-- The explicit answer to "how much focus buys a reward, and is that bar shared
-- across shops or owned by one shop?"
--
-- The v1 client answered this implicitly, by taking the MINIMUM minMinutes across
-- every live partner and applying it globally (perkMinMinutes() in app.js). That
-- is fine while every shop happens to agree on 240, and silently wrong the moment
-- one does not: sign a shop at 120 and every OTHER shop's bar drops to 120 too,
-- for everyone, without anyone deciding that. This table forces the decision to be
-- written down instead of emerging from a Math.min.
--
--   kind='global_passport'   one shared bar; a reward earned anywhere is spendable
--                            at any partner on this policy. (What v1 behaved like.)
--   kind='partner_specific'  the bar belongs to ONE shop; the reward it issues is
--                            only redeemable there.
create table if not exists public.reward_policies (
  id               text        primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind             text        not null check (kind in ('global_passport','partner_specific')),
  required_minutes integer     not null check (required_minutes between 15 and 1440),
  -- partner_specific policies name their shop; global ones must not.
  partner_id       text,
  -- Rewards issued under this policy expire this many days after issuance.
  -- NULL = no expiry. A shop that wants "use it within the month" gets 30.
  expires_days     integer     check (expires_days is null or expires_days between 1 and 3650),
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  check ((kind = 'partner_specific') = (partner_id is not null))
);
alter table public.reward_policies enable row level security;

-- 2. PARTNERS ----------------------------------------------------------------
-- The server's authoritative copy of what a shop agreed to. partners.json stays
-- the human-edited source of truth and the map's display list; tools/partners-to-sql.mjs
-- regenerates the seed below from it, so the two cannot drift by hand.
--
-- offer_version is the load-bearing column. A reward is issued against the offer
-- that was live when it was earned, and redemption checks that the offer has not
-- changed underneath it. Bump offer_version whenever offer_text changes, and a
-- student holding a reward for the old wording is told the offer changed rather
-- than being handed something the shop never agreed to.
create table if not exists public.partners (
  id                 text        primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name               text        not null check (char_length(name) between 1 and 80),
  address            text        not null default '' check (char_length(address) <= 200),
  market             text        not null default '' check (char_length(market) <= 60),
  active             boolean     not null default true,   -- false = paused, redemptions refused
  offer_text         text        not null check (char_length(offer_text) between 1 and 200),
  offer_version      integer     not null default 1 check (offer_version >= 1),
  policy_id          text        not null references public.reward_policies (id),
  -- Optional caps. NULL means the shop set no limit.
  per_user_limit     integer     check (per_user_limit is null or per_user_limit between 1 and 1000),
  pilot_cap          integer     check (pilot_cap is null or pilot_cap between 1 and 1000000),
  -- Optional redemption window, local to the shop. NULL/empty = any time they are open.
  valid_days         smallint[]  ,   -- 0=Sunday … 6=Saturday
  valid_from_minute  smallint    check (valid_from_minute is null or valid_from_minute between 0 and 1439),
  valid_to_minute    smallint    check (valid_to_minute   is null or valid_to_minute   between 0 and 1439),
  cashier_note       text        not null default '' check (char_length(cashier_note) <= 300),
  updated_at         timestamptz not null default now()
);
alter table public.partners enable row level security;

-- Partners and policies are the one thing here a client is allowed to READ, so the
-- app can show a bar and an offer without a round trip through an RPC per shop.
-- They contain nothing private: it is the same data already public in partners.json.
drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners for select to anon, authenticated using (true);
grant select on public.partners to anon, authenticated;

drop policy if exists reward_policies_read on public.reward_policies;
create policy reward_policies_read on public.reward_policies for select to anon, authenticated using (true);
grant select on public.reward_policies to anon, authenticated;

-- 3. REWARD SESSIONS (append-only, SERVER clock) ------------------------------
-- One row per focus session that is allowed to count toward a merchant reward.
--
-- id is supplied by the CLIENT and is the idempotency key. A retried start (flaky
-- network, app relaunch, double tap) reuses the same uuid and gets the same row
-- back instead of opening a second session. That is also why start/complete can be
-- called any number of times safely.
create table if not exists public.reward_sessions (
  id               uuid        primary key,
  user_id          uuid        not null references auth.users (id) on delete cascade,
  started_at       timestamptz not null default now(),   -- SERVER clock, never the client's
  ended_at         timestamptz,                          -- SERVER clock
  planned_minutes  integer     not null check (planned_minutes between 5 and 480),
  -- Set only on completion. least(planned, actual wall-clock elapsed), so a session
  -- can never credit more time than really passed, nor more than it asked for.
  credited_minutes integer     check (credited_minutes is null or credited_minutes between 0 and 480),
  -- CLIENT ASSERTIONS. Recorded as evidence, never as proof. See the header.
  platform         text        not null check (platform in ('ios','web')),
  shield_claimed   boolean     not null default false,
  state            text        not null default 'active'
                               check (state in ('active','completed','abandoned')),
  created_at       timestamptz not null default now()
);

-- Every abandonment path writes an explicit zero, never NULL. Repair rows made
-- by older versions before installing the invariant. The catalog guard keeps
-- this bootstrap safe to rerun, while IS NOT DISTINCT FROM makes NULL fail the
-- abandoned branch of the CHECK (plain `credited_minutes = 0` would allow it).
update public.reward_sessions s
  set credited_minutes = 0
  where s.state = 'abandoned' and s.credited_minutes is null;

do $reward_sessions_abandoned_zero$
begin
  if not exists (
    select 1
      from pg_constraint
      where conrelid = 'public.reward_sessions'::regclass
        and conname = 'reward_sessions_abandoned_zero'
  ) then
    alter table public.reward_sessions
      add constraint reward_sessions_abandoned_zero
      check (state <> 'abandoned' or credited_minutes is not distinct from 0);
  end if;
end
$reward_sessions_abandoned_zero$;

alter table public.reward_sessions enable row level security;
create index if not exists reward_sessions_user_idx on public.reward_sessions (user_id, state);
-- ONE active session per user. This is the overlap rule, enforced by the database
-- rather than by a check in the RPC, so two simultaneous starts cannot both win.
create unique index if not exists reward_sessions_one_active
  on public.reward_sessions (user_id) where (state = 'active');

-- 4. REWARD INSTANCES ---------------------------------------------------------
-- A reward the user actually holds. Issued by the server, never by the client.
--
-- `seq` is the nth reward this user has earned under this policy. Combined with the
-- unique index it is what makes issuance idempotent under concurrency: two racing
-- issue calls both try to insert seq=3 and exactly one succeeds.
create table if not exists public.reward_instances (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  policy_id      text        not null references public.reward_policies (id),
  -- Set for partner_specific policies; NULL for a global passport, which is
  -- spendable at any active partner on that policy.
  partner_id     text        references public.partners (id),
  seq            integer     not null check (seq >= 1),
  minutes_basis  integer     not null check (minutes_basis >= 0),   -- eligible minutes at issuance
  -- The bar THIS reward was bought at. Load-bearing, and the reason issuance is
  -- not recomputed from scratch: see the comment on issue_my_rewards.
  bar_minutes    integer     not null check (bar_minutes between 15 and 1440),
  offer_version  integer,    -- the version live when earned (partner_specific only)
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz,
  status         text        not null default 'issued'
                             check (status in ('issued','redeemed','void')),
  redeemed_at    timestamptz,
  redeemed_partner_id text   references public.partners (id),
  redeemed_offer_version integer,
  -- The offer WORDING, snapshotted at the moment it was honoured.
  --
  -- The version integer alone cannot answer the question a shop actually asks
  -- six weeks later, which is "what was I giving away in September?". partners
  -- .offer_text is mutable and holds only the CURRENT wording, so a report built
  -- from a join would silently relabel every historical redemption with today's
  -- offer. Storing the string costs a few bytes per redemption and is the only
  -- way the pilot report can print what was really honoured.
  redeemed_offer_text text
);
alter table public.reward_instances enable row level security;
create unique index if not exists reward_instances_seq
  on public.reward_instances (user_id, policy_id, seq);
create index if not exists reward_instances_user_idx
  on public.reward_instances (user_id, status);
create index if not exists reward_instances_partner_idx
  on public.reward_instances (redeemed_partner_id, redeemed_at);

-- 5. REDEMPTION HANDOFFS ------------------------------------------------------
-- The cashier-facing half. A student about to pay opens a handoff, which mints a
-- short code that lives for a few minutes. The code is what makes the screen hard
-- to fake with a screenshot: it is issued by the server, it is different every
-- time, and it stops working on its own.
--
-- A handoff is NOT a redemption. Redemption happens when the code is spent, which
-- is a single atomic statement in §8.
create table if not exists public.redemption_handoffs (
  code        text        primary key check (code ~ '^[A-Z2-9]{6}$'),
  reward_id   uuid        not null references public.reward_instances (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- CASCADE, because a handoff lives five minutes and must never be the reason a
  -- shop cannot be pulled. Without it this FK silently made DELETE FROM partners
  -- fail the moment anyone had opened a card there, and deletion is what CLAUDE.md
  -- documents as the kill switch.
  --
  -- reward_instances.redeemed_partner_id is deliberately NOT cascaded: a shop with
  -- redemption history cannot be deleted, and should not be, because deleting it
  -- would erase the merchant report that proves what was honoured. Pausing
  -- (active = false) is the correct pull for a shop that has traded, and it is
  -- also the reversible one.
  partner_id  text        not null references public.partners (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  -- The shop's offer version AT THE MOMENT THE CARD WAS OPENED.
  --
  -- reward_instances.offer_version is only set for partner_specific policies, so
  -- under a global_passport it is NULL and every `offer_version is not null` guard
  -- was dead code: a shop could change its offer between a student opening the card
  -- and paying, and the spend went through against the NEW wording. A passport
  -- reward is not tied to a shop until the shop is chosen, which is exactly here,
  -- so this is where its version has to be captured.
  offer_version integer
);
alter table public.redemption_handoffs enable row level security;
create index if not exists redemption_handoffs_reward_idx on public.redemption_handoffs (reward_id);

-- 6. REDEMPTION ATTEMPT LOG (what the merchant report is built from) ----------
-- Every outcome, including the failures. A pilot report that only counts successes
-- cannot answer "did anything go wrong at the counter", which is the first thing a
-- shop asks. user_id is kept so unique/repeat redeemers are countable; nothing here
-- carries a name, an email, or a location.
create table if not exists public.redemption_events (
  id          bigint      generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  partner_id  text,
  reward_id   uuid,
  offer_version integer,
  outcome     text        not null check (outcome in
                ('opened','completed','failed_not_found','failed_already_redeemed',
                 'failed_expired','failed_wrong_partner','failed_partner_paused',
                 'failed_offer_changed','failed_code_expired','failed_capped',
                 'failed_outside_window','failed_code_unavailable')),
  platform    text        check (platform is null or platform in ('ios','web'))
);
alter table public.redemption_events enable row level security;
create index if not exists redemption_events_partner_idx on public.redemption_events (partner_id, created_at);

-- 7. ELIGIBILITY + ISSUANCE ---------------------------------------------------

-- Minutes that may count toward a merchant reward. Native only, by policy:
-- a browser tab cannot block anything, so a web session is honest in-app progress
-- and is deliberately not redeemable. (`platform` is still a client assertion; see
-- the header. This rule removes the easy case, not the determined one.)
create or replace function public.reward_eligible_minutes(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(credited_minutes), 0)::int
  from public.reward_sessions
  where user_id = p_user and state = 'completed' and platform = 'ios';
$$;
-- Internal helper: owner-facing definer RPCs derive their user from auth.uid().
-- Exposing this UUID parameter would let any client query another user's total.
revoke all on function public.reward_eligible_minutes(uuid) from public, anon, authenticated;

-- Issue every reward the user has now earned and does not yet hold, for every
-- active policy. Safe to call as often as you like: it is a no-op once caught up,
-- and the unique (user, policy, seq) index makes a race a lost insert, not a
-- duplicate reward.
create or replace function public.issue_my_rewards()
returns table (id uuid, policy_id text, partner_id text, seq integer,
               offer_version integer, issued_at timestamptz, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public as $$
-- WHEN A NAME COULD MEAN EITHER, IT MEANS THE COLUMN.
--
-- `returns table (id, policy_id, partner_id, seq, ...)` puts variables of those
-- names in scope for the whole body, and `on conflict (user_id, policy_id, seq)`
-- names columns, so Postgres refused the call at RUN time with
--   42702  column reference "policy_id" is ambiguous
-- This is the same failure that hit start_reward_session, in a place a
-- search for `col = ` does not look. Every OUT name here is only ever read back
-- through an alias (`r.id`, `r.policy_id`), so preferring the column is right and
-- covers the whole body rather than one statement at a time.
#variable_conflict use_column
declare
  v_me       uuid := auth.uid();
  v_minutes  int;
  v_pol      record;
  v_entitled int;
  v_held     int;
  v_spent    int;
  v_ver      int;
  v_exp      timestamptz;
  i          int;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;
  v_minutes := public.reward_eligible_minutes(v_me);

  for v_pol in select * from public.reward_policies where active loop
    -- Entitlement is computed from minutes NOT ALREADY CONVERTED, never from the
    -- lifetime total divided by today's bar.
    --
    -- The naive version (entitled = eligible / required, held = count(*)) silently
    -- re-mints history the moment a bar is lowered: 240 minutes that already bought
    -- and spent one reward at a 240 bar produce THREE more the instant the bar
    -- drops to 60, because the same minutes are divided again. That is D6, the
    -- exact defect Reward V2 exists to fix, reappearing one layer up.
    --
    -- Summing bar_minutes spends each minute exactly once, whatever the bar was at
    -- the time. Lowering the bar still rewards genuinely unspent minutes, which is
    -- what a shop lowering its threshold means. Raising it revokes nothing.
    select coalesce(sum(r.bar_minutes), 0), coalesce(max(r.seq), 0)
      into v_spent, v_held
      from public.reward_instances r
      where r.user_id = v_me and r.policy_id = v_pol.id;

    v_entitled := (v_minutes - v_spent) / v_pol.required_minutes;
    if v_entitled < 1 then continue; end if;

    v_ver := null;
    if v_pol.partner_id is not null then
      select p.offer_version into v_ver from public.partners p where p.id = v_pol.partner_id;
    end if;
    v_exp := case when v_pol.expires_days is null then null
                  else now() + (v_pol.expires_days || ' days')::interval end;

    for i in (v_held + 1)..(v_held + v_entitled) loop
      insert into public.reward_instances
        (user_id, policy_id, partner_id, seq, minutes_basis, bar_minutes, offer_version, expires_at)
      values (v_me, v_pol.id, v_pol.partner_id, i, v_minutes, v_pol.required_minutes, v_ver, v_exp)
      on conflict (user_id, policy_id, seq) do nothing;   -- lost race = already issued
    end loop;
  end loop;

  return query
    select r.id, r.policy_id, r.partner_id, r.seq, r.offer_version,
           r.issued_at, r.expires_at, r.status
    from public.reward_instances r
    where r.user_id = v_me
    order by r.issued_at desc;
end; $$;
revoke all on function public.issue_my_rewards() from public, anon;
grant execute on function public.issue_my_rewards() to authenticated;

-- 8. SESSION RPCs -------------------------------------------------------------

-- Idempotent start. Re-calling with the same id returns the existing row rather
-- than opening a second session, so a retry after a dropped response is free.
create or replace function public.start_reward_session(
  p_session_id uuid, p_planned_minutes integer, p_platform text, p_shield boolean default false)
returns table (id uuid, started_at timestamptz, state text, planned_minutes integer)
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_row public.reward_sessions;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;
  if p_platform not in ('ios','web') then raise exception 'bad platform' using errcode='P0001'; end if;
  if p_planned_minutes is null or p_planned_minutes < 5 or p_planned_minutes > 480 then
    raise exception 'planned_minutes out of range' using errcode='P0001';
  end if;

  select * into v_row from public.reward_sessions s where s.id = p_session_id;
  if found then
    -- Someone else's session id is a hard error, not a silent no-op: it means a
    -- client is guessing ids, and it must never leak whose it is.
    if v_row.user_id <> v_me then raise exception 'not your session' using errcode='42501'; end if;
    return query select v_row.id, v_row.started_at, v_row.state, v_row.planned_minutes;
    return;
  end if;

  -- Sweep our own stale active session first. A session abandoned by an app kill
  -- would otherwise block every future one via the one-active index.
  -- ALIASED, and every column qualified. `returns table (id, started_at, state,
  -- planned_minutes)` puts variables of those names in scope, so a bare
  -- `state = 'active'` is ambiguous and Postgres refuses the whole function at
  -- RUN time with 42702. A syntax check cannot see this; only executing it can.
  update public.reward_sessions s
    set state = 'abandoned', ended_at = now(), credited_minutes = 0
    where s.user_id = v_me and s.state = 'active'
      and s.started_at < now() - interval '12 hours';

  begin
    insert into public.reward_sessions (id, user_id, planned_minutes, platform, shield_claimed)
    values (p_session_id, v_me, p_planned_minutes, p_platform, coalesce(p_shield,false));
  exception when unique_violation then
    -- The one-active index fired: a session is already open. Overlapping sessions
    -- are the cheapest way to farm minutes, so this is a refusal, not a merge.
    raise exception 'a focus session is already open' using errcode='P0003';
  end;

  select * into v_row from public.reward_sessions s where s.id = p_session_id;
  return query select v_row.id, v_row.started_at, v_row.state, v_row.planned_minutes;
end; $$;
revoke all on function public.start_reward_session(uuid,integer,text,boolean) from public, anon;
grant execute on function public.start_reward_session(uuid,integer,text,boolean) to authenticated;

-- Explicit zero-credit close for pause, reset and recovery paths. Completion is
-- intentionally the wrong operation for those paths: it converts elapsed server
-- wall time into eligible minutes. This transition never does, however long the
-- active row has existed.
--
-- The row lock serializes abandon against completion. Whichever terminal
-- transition gets the lock first wins; a retry returns that persisted terminal
-- row without erasing legitimate credit or moving ended_at a second time.
create or replace function public.abandon_reward_session(p_session_id uuid)
returns table (id uuid, state text, credited_minutes integer, eligible_minutes integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := auth.uid();
  v_row public.reward_sessions;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;

  -- Filter by owner in the lookup itself. A guessed UUID never exposes whether
  -- another account owns it, and can never lock or update that account's row.
  select * into v_row
    from public.reward_sessions s
    where s.id = p_session_id and s.user_id = v_me
    for update;
  if not found then raise exception 'no such session' using errcode='P0002'; end if;

  if v_row.state = 'active' then
    update public.reward_sessions s
      set state = 'abandoned', ended_at = now(), credited_minutes = 0
      where s.id = p_session_id and s.user_id = v_me and s.state = 'active'
      returning s.* into v_row;
  end if;

  return query select v_row.id, v_row.state, v_row.credited_minutes,
                      public.reward_eligible_minutes(v_me);
end; $$;
revoke all on function public.abandon_reward_session(uuid) from public, anon;
grant execute on function public.abandon_reward_session(uuid) to authenticated;

-- Idempotent completion. Credits the SERVER's elapsed wall clock, capped at what
-- the session asked for, and capped again by a daily ceiling so a scripted client
-- cannot bank an impossible day.
create or replace function public.complete_reward_session(
  p_session_id uuid, p_shield_held boolean default null)
returns table (id uuid, state text, credited_minutes integer, eligible_minutes integer)
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_row      public.reward_sessions;
  v_elapsed  int;
  v_credit   int;
  v_day_used int;
  DAILY_CAP  constant int := 720;   -- 12 h/day. Above this it is not a student studying.
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;
  -- Abandon uses this same row lock. The terminal-state check must happen only
  -- after the lock is held, or completion can read active, wait behind abandon,
  -- then overwrite the abandoned row with credit based on stale state.
  select * into v_row from public.reward_sessions s
    where s.id = p_session_id
    for update;
  if not found then raise exception 'no such session' using errcode='P0002'; end if;
  if v_row.user_id <> v_me then raise exception 'not your session' using errcode='42501'; end if;

  -- Already finished: return the same answer. A double tap, a retry and a replayed
  -- request all land here and none of them credit a second time.
  if v_row.state <> 'active' then
    return query select v_row.id, v_row.state, v_row.credited_minutes,
                        public.reward_eligible_minutes(v_me);
    return;
  end if;

  v_elapsed := floor(extract(epoch from (now() - v_row.started_at)) / 60)::int;

  -- Under 5 real minutes is not a session. Over 12 h means the app was killed and
  -- the row is stale; neither credits anything.
  if v_elapsed < 5 or v_elapsed > 720 then
      update public.reward_sessions s
      set state = 'abandoned', ended_at = now(), credited_minutes = 0
      where s.id = p_session_id and s.user_id = v_me and s.state = 'active';
    return query select p_session_id, 'abandoned'::text, 0, public.reward_eligible_minutes(v_me);
    return;
  end if;

  v_credit := least(v_elapsed, v_row.planned_minutes);

  select coalesce(sum(s.credited_minutes),0)::int into v_day_used
    from public.reward_sessions s
    where s.user_id = v_me and s.state = 'completed'
      and s.ended_at >= date_trunc('day', now());
  v_credit := greatest(0, least(v_credit, DAILY_CAP - v_day_used));

  update public.reward_sessions s
    set state = 'completed', ended_at = now(), credited_minutes = v_credit,
        shield_claimed = coalesce(p_shield_held, s.shield_claimed)
    where s.id = p_session_id and s.user_id = v_me and s.state = 'active';

  return query select p_session_id, 'completed'::text, v_credit, public.reward_eligible_minutes(v_me);
end; $$;
revoke all on function public.complete_reward_session(uuid,boolean) from public, anon;
grant execute on function public.complete_reward_session(uuid,boolean) to authenticated;

-- What the app shows on the progress screen. The client calls issue_my_rewards
-- immediately before this RPC, then consumes these per-policy values directly;
-- it must never apply today's bar to the lifetime eligible-minute total.
--
-- Eligibility, rewards and policy accounting are read by one SELECT, so a call
-- observes one stable MVCC snapshot. Minutes become spent when a reward is
-- issued, not when it is redeemed: every instance status therefore counts, and
-- its issuance-time bar_minutes preserves policy changes exactly.
create or replace function public.my_reward_state()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_state jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;

  with eligible as (
    select public.reward_eligible_minutes(v_me)::int as eligible_minutes
  ),
  included_policies as (
    -- Active policies, PLUS any policy a reward I already hold was issued under.
    -- Pausing stops issuance but not redemption, so a held reward must keep the
    -- policy metadata and its authoritative progress/accounting fields.
    select p.id, p.kind, p.required_minutes, p.partner_id,
           p.expires_days, p.active
      from public.reward_policies p
      where p.active
         or exists (
              select 1
                from public.reward_instances held
                where held.user_id = v_me
                  and held.policy_id = p.id
                  and held.status = 'issued'
            )
  ),
  policy_accounting as (
    select p.id, p.kind, p.required_minutes, p.partner_id,
           p.expires_days, p.active, e.eligible_minutes,
           coalesce((
             select sum(r.bar_minutes)::int
               from public.reward_instances r
               where r.user_id = v_me and r.policy_id = p.id
           ), 0)::int as spent_minutes
      from included_policies p
      cross join eligible e
  ),
  policy_progress as (
    select a.*,
           greatest(a.eligible_minutes - a.spent_minutes, 0)::int as unspent_minutes,
           (greatest(a.eligible_minutes - a.spent_minutes, 0)
             % a.required_minutes)::int as progress_minutes
      from policy_accounting a
  )
  select jsonb_build_object(
    'eligible_minutes', e.eligible_minutes,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'policy_id', r.policy_id, 'partner_id', r.partner_id,
        'seq', r.seq, 'status', r.status, 'issued_at', r.issued_at,
        'expires_at', r.expires_at, 'offer_version', r.offer_version,
        'redeemed_at', r.redeemed_at, 'redeemed_partner_id', r.redeemed_partner_id)
        order by r.issued_at desc)
      from public.reward_instances r where r.user_id = v_me), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'kind', a.kind, 'required_minutes', a.required_minutes,
        'partner_id', a.partner_id, 'expires_days', a.expires_days, 'active', a.active,
        'spent_minutes', a.spent_minutes,
        'unspent_minutes', a.unspent_minutes,
        'progress_minutes', a.progress_minutes)
        order by a.id)
      from policy_progress a), '[]'::jsonb)
  ) into v_state
  from eligible e;

  return v_state;
end; $$;
revoke all on function public.my_reward_state() from public, anon;
grant execute on function public.my_reward_state() to authenticated;

-- 9. REDEMPTION ---------------------------------------------------------------

-- ── THE SHARED GATE ──────────────────────────────────────────────────────────
-- Caps and the agreed redemption window, in ONE function, because they were
-- previously checked only in open_redemption and never in redeem_by_code.
--
-- That gap was exploitable without any tooling. Caps are counted from rows that
-- are already `redeemed`, so opening every card FIRST, while that count is still
-- zero, passed the cap on all of them, and then every one spent. A per_user_limit
-- of 1 delivered two drinks; a pilot_cap of 1 delivered two across two accounts.
-- Tapping "show at the counter" on two rewards before paying for either is a
-- thing a student does by accident, and the cap is the ONLY thing bounding a
-- pilot shop's exposure. Same story for the window: enforced at open only, a 5pm
-- cutoff really meant 5:05.
--
-- p_exclude_reward lets the spend path ask "would this be capped if this reward
-- were not mine?", so a reward does not count itself.
create or replace function public.redemption_gate(
  p_user uuid, p_partner_id text, p_exclude_reward uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_p      public.partners;
  v_used   int;
  v_total  int;
  v_dow    int;
  v_minute int;
  v_from   int;
  v_to     int;
begin
  select * into v_p from public.partners p where p.id = p_partner_id;
  if not found then return 'failed_not_found'; end if;
  if not v_p.active then return 'failed_partner_paused'; end if;

  select count(*) into v_used from public.reward_instances r
    where r.user_id = p_user and r.redeemed_partner_id = v_p.id and r.status = 'redeemed'
      and (p_exclude_reward is null or r.id <> p_exclude_reward);
  select count(*) into v_total from public.reward_instances r
    where r.redeemed_partner_id = v_p.id and r.status = 'redeemed'
      and (p_exclude_reward is null or r.id <> p_exclude_reward);
  if (v_p.per_user_limit is not null and v_used >= v_p.per_user_limit)
     or (v_p.pilot_cap is not null and v_total >= v_p.pilot_cap) then
    return 'failed_capped';
  end if;

  if v_p.valid_days is not null and array_length(v_p.valid_days, 1) is not null then
    v_dow := extract(dow from now())::int;
    if not (v_dow = any(v_p.valid_days)) then return 'failed_outside_window'; end if;
  end if;

  -- A half-set window is NOT a restriction, it is a misconfiguration, and failing
  -- open on it would hand out a discount outside the hours the shop agreed to.
  v_from := v_p.valid_from_minute;
  v_to   := v_p.valid_to_minute;
  if (v_from is null) <> (v_to is null) then return 'failed_outside_window'; end if;
  if v_from is not null then
    v_minute := (extract(hour from now())::int * 60) + extract(minute from now())::int;
    if v_from <= v_to then
      -- Ordinary same-day window, e.g. 14:00 to 17:00.
      if v_minute < v_from or v_minute > v_to then return 'failed_outside_window'; end if;
    else
      -- Window WRAPS past midnight, e.g. 22:00 to 02:00. The old single test
      -- (minute < from OR minute > to) is true at every hour of the day for a
      -- wrapping pair, so an overnight shop was unredeemable around the clock
      -- and was told "failed_capped" for it.
      if v_minute < v_from and v_minute > v_to then return 'failed_outside_window'; end if;
    end if;
  end if;

  return null;
end; $$;
revoke all on function public.redemption_gate(uuid,text,uuid) from public, anon, authenticated;

-- Short code, unbiased, and with no 0/O/1/I to misread across a counter.
--
-- NOTE — this deliberately does NOT copy gen_friend_code()'s arithmetic, because
-- that function has an off-by-one. Its alphabet is 32 characters, not the 31 its
-- comment claims (24 letters after dropping I and O, plus 2-9), so `b % 31`
-- can never reach position 32 and NO FRIEND CODE HAS EVER CONTAINED A '9'.
-- Harmless in practice (it costs 17% of a 1.07-billion keyspace) but it is real;
-- the one-line fix for the live Squad schema is in §13 below, unapplied.
--
-- With the true count of 32 there is also nothing to reject: 256 is exactly
-- divisible by 32, so `b % 32` is already uniform and the rejection-sampling
-- loop that gen_friend_code needs is simply unnecessary here.
create or replace function public.gen_handoff_code()
returns text language plpgsql set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 chars, no 0/O/1/I
  n        constant int  := 32;
  -- v_code, NOT `code`. redemption_handoffs HAS a column called code, and a bare
  -- `code` inside the collision query below is ambiguous between this variable
  -- and that column. plpgsql's default is to RAISE on that ambiguity, so every
  -- single mint attempt threw, the retry loop burned all 60 tries, and the caller
  -- reported "could not mint a code" -- which is a real-looking answer to a
  -- question that was never actually asked.
  v_code text; b int; tries int := 0;
begin
  loop
    v_code := '';
    while char_length(v_code) < 6 loop
      b := get_byte(extensions.gen_random_bytes(1), 0);
      v_code := v_code || substr(alphabet, (b % n) + 1, 1);
    end loop;
    -- Collision must be checked against EVERY row, not just live ones. The code is
    -- the PRIMARY KEY, so one that merely happens to be consumed or expired is
    -- still taken, and re-minting it is an unhandled unique_violation at insert.
    exit when not exists (select 1 from public.redemption_handoffs h where h.code = v_code);
    -- BOUNDED: never reusing a code means an exhausted keyspace has to fail
    -- cleanly rather than loop forever inside a transaction. 60 consecutive
    -- misses over 32^6 codes does not happen with a working RNG.
    tries := tries + 1;
    if tries >= 60 then
      raise exception 'could not mint a handoff code' using errcode='P0004';
    end if;
  end loop;
  return v_code;
end; $$;
-- Internal helper for open_redemption. Direct callers must use the authenticated
-- opener so ownership, partner terms and handoff logging stay in one transaction.
revoke all on function public.gen_handoff_code() from public, anon, authenticated;

-- Step 1 at the counter: the student picks the shop and opens the card. This
-- validates everything it can BEFORE the cashier is involved, so a refusal happens
-- on the student's screen rather than in front of a queue. It does not consume
-- anything: the reward is still redeemable if the student walks away.
create or replace function public.open_redemption(p_reward_id uuid, p_partner_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me     uuid := auth.uid();
  v_r      public.reward_instances;
  v_p      public.partners;
  v_pol    public.reward_policies;
  v_code   text;
  v_fail   text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode='28000'; end if;

  select * into v_r from public.reward_instances r where r.id = p_reward_id;
  if not found or v_r.user_id <> v_me then v_fail := 'failed_not_found';
  else
    select * into v_p from public.partners p where p.id = p_partner_id;
    if not found                              then v_fail := 'failed_not_found';
    elsif not v_p.active                      then v_fail := 'failed_partner_paused';
    elsif v_r.status = 'redeemed'             then v_fail := 'failed_already_redeemed';
    elsif v_r.status <> 'issued'              then v_fail := 'failed_not_found';
    elsif v_r.expires_at is not null
      and v_r.expires_at <= now()             then v_fail := 'failed_expired';
    -- A partner-scoped reward is only good at its own shop; a global passport is
    -- good at any partner sharing its policy.
    elsif v_r.partner_id is not null
      and v_r.partner_id <> v_p.id            then v_fail := 'failed_wrong_partner';
    elsif v_r.partner_id is null
      and v_p.policy_id <> v_r.policy_id      then v_fail := 'failed_wrong_partner';
    -- The offer moved after this reward was earned. Honouring the new wording
    -- would hand the shop a bill it never agreed to, so refuse and explain.
    elsif v_r.offer_version is not null
      and v_r.offer_version <> v_p.offer_version then v_fail := 'failed_offer_changed';
    end if;
  end if;

  -- Caps and window come from the shared gate, so open and spend can never
  -- disagree about them again.
  if v_fail is null then
    v_fail := public.redemption_gate(v_me, p_partner_id, p_reward_id);
  end if;

  if v_fail is not null then
    insert into public.redemption_events (user_id, partner_id, reward_id, offer_version, outcome)
      values (v_me, p_partner_id, p_reward_id, v_r.offer_version, v_fail);
    return jsonb_build_object('ok', false, 'reason', v_fail);
  end if;

  -- Reuse a live handoff rather than minting a new code every time the sheet is
  -- reopened, so the cashier is not looking at a code that changed mid-glance.
  select h.code into v_code from public.redemption_handoffs h
    where h.reward_id = p_reward_id and h.partner_id = p_partner_id
      and h.consumed_at is null and h.expires_at > now() + interval '30 seconds'
    order by h.created_at desc limit 1;

  if v_code is null then
    -- gen_handoff_code raises P0004 if it cannot find a free code in 60 tries.
    -- Caught here so the client gets the same {ok:false, reason} shape the mock
    -- returns, rather than an unhandled exception. Impossible with a working RNG
    -- over 32^6 codes; handled anyway because "impossible" is how the last two
    -- bugs in this file got in.
    -- Catch ONLY the exhaustion case. `when others` was here, and it turned a
    -- plain ambiguity error inside gen_handoff_code into a confident
    -- "failed_code_unavailable", which is a real-looking answer to a question
    -- that was never asked. A defensive handler that swallows the diagnosis is
    -- worse than no handler: it cost a 30-minute test run to find that out.
    begin
      v_code := public.gen_handoff_code();
    exception when sqlstate 'P0004' then
      insert into public.redemption_events (user_id, partner_id, reward_id, outcome)
        values (v_me, p_partner_id, p_reward_id, 'failed_code_unavailable');
      return jsonb_build_object('ok', false, 'reason', 'failed_code_unavailable');
    end;
    insert into public.redemption_handoffs
      (code, reward_id, user_id, partner_id, expires_at, offer_version)
      values (v_code, p_reward_id, v_me, p_partner_id, now() + interval '5 minutes',
              v_p.offer_version);
  end if;

  insert into public.redemption_events (user_id, partner_id, reward_id, offer_version, outcome)
    values (v_me, p_partner_id, p_reward_id, v_p.offer_version, 'opened');

  return jsonb_build_object(
    'ok', true, 'code', v_code,
    'expires_at', (select h.expires_at from public.redemption_handoffs h where h.code = v_code),
    'server_time', now(),
    'bar_minutes', v_r.bar_minutes,
    'partner_name', v_p.name, 'offer_text', v_p.offer_text,
    'offer_version', v_p.offer_version, 'cashier_note', v_p.cashier_note);
end; $$;
revoke all on function public.open_redemption(uuid,text) from public, anon;
grant execute on function public.open_redemption(uuid,text) to authenticated;

-- Step 2: SPEND IT. This is the only function in the system that consumes a
-- reward, and it consumes exactly one.
--
-- The same-reward guarantee lives in the WHERE clause of the UPDATE. Postgres
-- takes a row lock on the matching reward, and `status = 'issued'` is re-checked
-- under that lock, so of two simultaneous requests exactly one updates a row.
--
-- Different rewards need a shared lock too: per-user and pilot caps count rows
-- already redeemed at one partner. Locking that partner before the shared gate
-- serializes the count-and-spend transaction, so two distinct codes cannot both
-- observe the last cap slot as free.
--
-- It is deliberately callable with just the code, so the cashier's own device can
-- spend it from a plain webpage with nothing installed and no account.
create or replace function public.redeem_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_h      public.redemption_handoffs;
  v_p      public.partners;
  v_r      public.reward_instances;
  v_hit    int;
  v_fail   text;
begin
  select * into v_h from public.redemption_handoffs h
    where h.code = upper(trim(coalesce(p_code,'')));
  if not found then
    insert into public.redemption_events (outcome) values ('failed_not_found');
    return jsonb_build_object('ok', false, 'reason', 'failed_not_found');
  end if;

  select * into v_r from public.reward_instances r where r.id = v_h.reward_id;
  select * into v_p from public.partners p where p.id = v_h.partner_id for update;

  if v_h.consumed_at is not null       then v_fail := 'failed_already_redeemed';
  elsif v_h.expires_at <= now()        then v_fail := 'failed_code_expired';
  elsif not v_p.active                 then v_fail := 'failed_partner_paused';
  elsif v_r.status = 'redeemed'        then v_fail := 'failed_already_redeemed';
  elsif v_r.status <> 'issued'         then v_fail := 'failed_not_found';
  elsif v_r.expires_at is not null
    and v_r.expires_at <= now()        then v_fail := 'failed_expired';
  -- Two version checks, not one. The reward's own version covers partner_specific
  -- rewards; the handoff's pinned version covers passport rewards, whose
  -- reward_instances.offer_version is NULL and therefore checked nothing.
  elsif v_r.offer_version is not null
    and v_r.offer_version <> v_p.offer_version then v_fail := 'failed_offer_changed';
  elsif v_h.offer_version is not null
    and v_h.offer_version <> v_p.offer_version then v_fail := 'failed_offer_changed';
  end if;

  -- Caps and the agreed window, re-checked AT SPEND. Checking them only at open
  -- meant opening every card first, while the redeemed count was still zero, beat
  -- the cap on all of them. This is the fix for that.
  if v_fail is null then
    v_fail := public.redemption_gate(v_h.user_id, v_h.partner_id, v_h.reward_id);
  end if;

  if v_fail is not null then
    insert into public.redemption_events (user_id, partner_id, reward_id, offer_version, outcome)
      values (v_h.user_id, v_h.partner_id, v_h.reward_id, v_r.offer_version, v_fail);
    return jsonb_build_object('ok', false, 'reason', v_fail,
      'partner_name', v_p.name, 'offer_text', v_p.offer_text);
  end if;

  -- The atomic step. Nothing between the check and the write.
  update public.reward_instances r
    set status = 'redeemed', redeemed_at = now(),
        redeemed_partner_id = v_h.partner_id, redeemed_offer_version = v_p.offer_version,
        redeemed_offer_text = v_p.offer_text
    where r.id = v_h.reward_id and r.status = 'issued';
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    insert into public.redemption_events (user_id, partner_id, reward_id, offer_version, outcome)
      values (v_h.user_id, v_h.partner_id, v_h.reward_id, v_p.offer_version, 'failed_already_redeemed');
    return jsonb_build_object('ok', false, 'reason', 'failed_already_redeemed',
      'partner_name', v_p.name, 'offer_text', v_p.offer_text);
  end if;

  -- Burn the code too, so the same slip of paper cannot be presented twice even
  -- if a second reward exists on the account.
  update public.redemption_handoffs set consumed_at = now() where code = v_h.code;

  insert into public.redemption_events (user_id, partner_id, reward_id, offer_version, outcome)
    values (v_h.user_id, v_h.partner_id, v_h.reward_id, v_p.offer_version, 'completed');

  return jsonb_build_object('ok', true, 'partner_name', v_p.name,
    'offer_text', v_p.offer_text, 'cashier_note', v_p.cashier_note,
    'redeemed_at', now(), 'server_time', now());
end; $$;
-- anon may execute: the cashier has no account and installs nothing. Holding an
-- unexpired 6-character code IS the credential, which is why codes live 5 minutes
-- and die on first use. Rate limiting is §10.
revoke all on function public.redeem_by_code(text) from public;
grant execute on function public.redeem_by_code(text) to anon, authenticated;

-- Read-only peek for the verification page, so a cashier can see VALID / ALREADY
-- USED before deciding to spend it. Returns no user identity.
create or replace function public.check_code(p_code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_h public.redemption_handoffs; v_p public.partners; v_r public.reward_instances;
        v_gate text; v_reason text;
begin
  select * into v_h from public.redemption_handoffs h where h.code = upper(trim(coalesce(p_code,'')));
  if not found then return jsonb_build_object('ok', false, 'reason', 'failed_not_found'); end if;
  select * into v_p from public.partners p where p.id = v_h.partner_id;
  select * into v_r from public.reward_instances r where r.id = v_h.reward_id;
  -- Every refusal redeem_by_code can raise must be reachable here too, or the
  -- cashier sees VALID, taps Mark as used, and gets a refusal in front of a
  -- queue. The reward's OWN expiry and the offer version are easy to forget:
  -- the handoff code can be perfectly fresh while the reward behind it is not.
  -- The caps and the window, through the SAME gate the spend uses, plus the
  -- handoff's pinned offer version. Leaving these out is how a cashier ends up
  -- reading VALID and then being refused with a queue behind them: exactly the
  -- failure the comment above this function exists to prevent. Adding a refusal
  -- to redeem_by_code and not to check_code is always a bug.
  v_gate := public.redemption_gate(v_h.user_id, v_h.partner_id, v_h.reward_id);

  v_reason := case
    when v_h.consumed_at is not null or v_r.status = 'redeemed' then 'failed_already_redeemed'
    when v_h.expires_at <= now() then 'failed_code_expired'
    when v_r.status <> 'issued' then 'failed_not_found'
    when v_r.expires_at is not null and v_r.expires_at <= now() then 'failed_expired'
    when v_r.offer_version is not null and v_r.offer_version <> v_p.offer_version
         then 'failed_offer_changed'
    when v_h.offer_version is not null and v_h.offer_version <> v_p.offer_version
         then 'failed_offer_changed'
    when v_gate is not null then v_gate
    else null end;

  return jsonb_build_object(
    'ok', v_reason is null,
    'reason', v_reason,
    'partner_name', v_p.name, 'offer_text', v_p.offer_text,
    'cashier_note', v_p.cashier_note, 'server_time', now(),
    'expires_at', v_h.expires_at);
end; $$;
revoke all on function public.check_code(text) from public;
grant execute on function public.check_code(text) to anon, authenticated;

-- 10. RATE LIMIT ON CODE GUESSING --------------------------------------------
-- 31^6 is about 887 million, and a code lives 5 minutes, so guessing is already
-- hopeless. This exists so a script cannot make the attempt cheaply, and so the
-- event log is not flooded.
create table if not exists public.code_rate (
  ip_key       text        primary key,
  window_start timestamptz not null default now(),
  count        integer     not null default 0
);
alter table public.code_rate enable row level security;
-- Supabase does not expose a client IP to SQL by default; enforce this in the
-- verification page's edge function or in the dashboard's API rate limits.
-- Documented rather than faked: see docs/network-v1/REWARD-V2.md.

-- 11. MERCHANT PILOT REPORT ---------------------------------------------------
-- Everything a shop is actually owed an answer to, and nothing it is not. No
-- names, no emails, no locations, no purchase amounts. Unique and repeat
-- redeemers are counted from an opaque account id that links to nothing a shop
-- can see. This CANNOT report revenue, incremental sales, first-time visitors or
-- ROI, because the product has never collected any of that.
create or replace function public.partner_report(p_partner_id text, p_days integer default 30)
returns jsonb language sql security definer stable set search_path = public as $$
  with win as (select now() - (greatest(1, least(coalesce(p_days,30), 365)) || ' days')::interval as since),
  red as (
    select r.user_id, r.redeemed_at, r.redeemed_offer_version, r.redeemed_offer_text
    from public.reward_instances r, win
    where r.redeemed_partner_id = p_partner_id and r.status = 'redeemed' and r.redeemed_at >= win.since
  ),
  per_user as (select user_id, count(*) as n from red group by user_id)
  select jsonb_build_object(
    'partner_id', p_partner_id,
    'partner_name', (select name from public.partners where id = p_partner_id),
    'window_days', greatest(1, least(coalesce(p_days,30), 365)),
    'offer_text', (select offer_text from public.partners where id = p_partner_id),
    'offer_version', (select offer_version from public.partners where id = p_partner_id),
    'active', (select active from public.partners where id = p_partner_id),
    -- What was really honoured, per wording, over the window. A shop that
    -- changed its offer mid-pilot sees both lines with their own counts instead
    -- of one line relabelled with today's wording.
    'offers_honoured', coalesce((select jsonb_agg(jsonb_build_object(
         'offer_text', t.txt, 'offer_version', t.ver, 'n', t.c,
         'first', t.f, 'last', t.l) order by t.f)
       from (select redeemed_offer_text as txt, redeemed_offer_version as ver,
                    count(*) as c, min(redeemed_at) as f, max(redeemed_at) as l
             from red group by 1, 2) t), '[]'::jsonb),
    'redemptions', (select count(*) from red),
    'unique_redeemers', (select count(*) from per_user),
    'repeat_redeemers', (select count(*) from per_user where n > 1),
    'first_redemption', (select min(redeemed_at) from red),
    'last_redemption', (select max(redeemed_at) from red),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', c) order by d)
       from (select date_trunc('day', redeemed_at)::date as d, count(*) as c from red group by 1) t), '[]'::jsonb),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object('reason', outcome, 'n', c) order by c desc)
       from (select e.outcome, count(*) as c from public.redemption_events e, win
             where e.partner_id = p_partner_id and e.created_at >= win.since
               and e.outcome like 'failed_%' group by 1) t), '[]'::jsonb)
  );
$$;
-- Owner-only. A shop gets a report from the founder, not a login, and this stays
-- unreachable from the public key until there is a merchant account model.
revoke all on function public.partner_report(text,integer) from public, anon, authenticated;

-- 12. CLEANUP ------------------------------------------------------------------
select cron.schedule('prune_handoffs', '41 * * * *', $cron$
  delete from public.redemption_handoffs where expires_at < now() - interval '7 days';
$cron$);
select cron.schedule('sweep_stale_sessions', '7 * * * *', $cron$
  update public.reward_sessions set state = 'abandoned', ended_at = now(), credited_minutes = 0
  where state = 'active' and started_at < now() - interval '12 hours';
$cron$);

-- 13. OPTIONAL, UNRELATED: the friend-code alphabet off-by-one ---------------
-- Found while writing gen_handoff_code. supabase-setup.sql §4 declares
--   alphabet := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 31 chars
-- but that string is 32 characters (24 letters after dropping I and O, plus the
-- digits 2-9). With `n := 31` the generator can never index position 32, so no
-- friend code issued since launch contains a '9', and the keyspace is 31^6
-- (887M) rather than 32^6 (1.07B).
--
-- Nothing is broken: existing codes stay valid, the CHECK regex '^[A-Z2-9]{6}$'
-- already accepts a 9, and collisions were never close. It is left OUT of the
-- migration above on purpose, because it touches a live system for no functional
-- gain. Run it only if you want it. It is safe and backward compatible.
--
--   create or replace function public.gen_friend_code()
--   returns text language plpgsql set search_path = public, extensions as $$
--   declare
--     alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 chars
--     n        constant int  := 32;      -- was 31; 256 % 32 = 0, so no rejection needed
--     code text; b int;
--   begin
--     loop
--       code := '';
--       while char_length(code) < 6 loop
--         b := get_byte(extensions.gen_random_bytes(1), 0);
--         code := code || substr(alphabet, 1 + (b % n), 1);
--       end loop;
--       exit when not exists (select 1 from public.profiles p where p.friend_code = code);
--     end loop;
--     return code;
--   end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STILL FORGEABLE AFTER THIS MIGRATION (say this plainly, never imply otherwise):
--   1. `platform` and `shield_claimed` are client assertions. A script can claim
--      ios. App Attest / DeviceCheck closes it; not implemented.
--   2. Anonymous sign-up is free and unlimited, so one person can farm accounts.
--      Real cost per account (a threshold that takes 4 h of WALL CLOCK) is the
--      only brake today. Per-shop caps in §2 bound the damage.
--   3. Elapsed wall-clock is not attention. Nothing here knows a human was there.
--   4. A screenshot of a code is useless after 5 minutes, but a LIVE screen share
--      to a friend within those 5 minutes would work. The reward is still spent
--      exactly once.
-- ════════════════════════════════════════════════════════════════════════════
