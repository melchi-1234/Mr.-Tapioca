-- ════════════════════════════════════════════════════════════════════════════
-- Mr. Tapioca — PRODUCT ANALYTICS (run in the SQL Editor, after supabase-setup.sql)
--
-- Backs analytics.js. Extracted verbatim from docs/network-v1/METRICS-SPEC.md so
-- tools/check-sql.py actually parses it: SQL that lives only inside a markdown
-- fence is never syntax-checked, and the first person to run it is the person who
-- finds out. That spec stays the prose home; this file is the thing you paste.
--
-- DO NOT RUN THIS until privacy.html describes what is collected and the App
-- Store privacy answers declare Usage Data (not linked to identity). analytics.js
-- is flagged OFF in config.js for exactly that reason.
--
-- Insert-only for anon and authenticated, same shape as drink_events in
-- supabase-setup.sql section 18: clients may add rows, never read or change them.
-- ════════════════════════════════════════════════════════════════════════════

-- 19. PRODUCT ANALYTICS — app_events (analytics.js) --------------------------
--   Activation, focus, retention, reward and growth events, so the funnel
--   questions §18's drink counter cannot answer have an answer. Clients may
--   only INSERT; read the numbers in the dashboard with your owner login.
--
--   PRIVACY: no name, email, location, Screen Time app identity, or advertising
--   identifier is collectable here. `device` is the same random per-install id
--   metrics.js mints (bobaMetricsDevice) and links to nothing. There is no
--   free-text column: every string is an enum or a slug. `props` is a bounded
--   jsonb for the low-cardinality extras. No price or amount column exists, on
--   purpose — this table must never become a revenue ledger.
--
--   Best-effort and client-forgeable, exactly like drink_events: fine for
--   product decisions, NEVER for money or partner discounts (see the FUTURE
--   HARDENING note above §18).
create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  -- Client-generated, unique. This is what makes a retried flush idempotent:
  -- a batch that committed but whose response was lost is re-sent and lands as
  -- ON CONFLICT DO NOTHING instead of double-counting the funnel.
  event_id    uuid        not null unique,
  created_at  timestamptz not null default now(),
  -- ts is the CLIENT's event time; created_at is the server's receive time. They
  -- differ by however long the device was offline. Every query in METRICS-SPEC.md
  -- uses ts (or cohort_day) for behaviour and created_at only for plumbing.
  ts          timestamptz not null check (ts >= timestamptz '2026-01-01 00:00:00+00'
                                      and ts <  timestamptz '2100-01-01 00:00:00+00'),
  device      text not null check (char_length(device) between 8 and 64),
  -- Closed list. A migration is the price of a new event name, and it buys
  -- immunity from a buggy client polluting every GROUP BY with typos.
  name        text not null check (name in (
                'first_open','onboarding_started','onboarding_completed',
                'screentime_explainer_viewed','permission_granted','permission_denied',
                'apps_selected','first_focus_started','first_focus_completed',
                'session_started','session_completed','session_abandoned',
                'daily_goal_completed','streak_continued','return_day','quest_completed',
                'partner_discovered','offer_viewed','progress_viewed','reward_issued',
                'redemption_started','redemption_completed','redemption_failed',
                'focus_card_shared','reward_card_shared','squad_invite_shared',
                'install_link_opened',
                'cosmetic_viewed','purchase_initiated','purchase_completed','restore_completed'
              )),
  -- Days since install, computed on the device in LOCAL time and stamped at
  -- track() time. Retention must not be derived from created_at: a row queued
  -- offline and flushed three days later would otherwise change cohorts.
  cohort_day  int  not null check (cohort_day between 0 and 3650),
  platform    text not null check (platform in ('ios','web')),
  -- The default is only for a row inserted by hand. analytics.js always sends a
  -- value: the build from window.MRTAP_VERSION (§5 step 2), or its own
  -- MODULE_VERSION ('analytics-1') when that line was never added.
  app_version text not null default 'unknown' check (char_length(app_version) between 1 and 24),
  -- The four fields the founder metrics actually SUM and GROUP BY get real typed
  -- columns with real bounds, so one bad client cannot poison a total. Everything
  -- else rides in props.
  planned_minutes int     check (planned_minutes between 1 and 1440),
  actual_minutes  int     check (actual_minutes  between 0 and 1440),
  blocking        boolean,
  partner_id      text    check (partner_id ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  -- Bounded on purpose. length(props::text) is immutable (jsonb_out then length),
  -- unlike pg_column_size, which is not allowed in a CHECK.
  props       jsonb not null default '{}'::jsonb check (length(props::text) <= 1024)
);

alter table public.app_events enable row level security;
revoke all on public.app_events from public, anon, authenticated;
grant insert on public.app_events to anon, authenticated;
-- Insert-only by design: no select/update/delete policy exists, so the public key
-- can add rows but never read, change or remove them. RLS is enabled but NOT
-- forced, same as drink_events — forcing it would lock the table owner out of the
-- dashboard reads that are the entire point of collecting this.
--
-- The drop is what makes a second paste safe. Postgres has no CREATE POLICY IF
-- NOT EXISTS at any version, so a bare create fails with 42710 the second time,
-- and the second time is likely: whoever runs this first is exactly the person
-- who will hit an unrelated error and paste the block again. Same shape as the
-- policies in supabase-setup.sql:117-138.
drop policy if exists app_events_insert on public.app_events;
create policy app_events_insert on public.app_events
  for insert to anon, authenticated with check (true);

-- Two indexes because every query in METRICS-SPEC.md §6 filters on name and time,
-- or groups by device and cohort day. Without them the retention query is a full
-- scan per cohort.
create index if not exists app_events_name_ts_idx    on public.app_events (name, ts);
create index if not exists app_events_device_day_idx on public.app_events (device, cohort_day);
create index if not exists app_events_partner_idx    on public.app_events (partner_id, ts)
  where partner_id is not null;

-- Retention: 400 days is D365 plus slack, and it bounds how long an anonymous
-- per-install id lives on the server. Keyed on created_at, NOT ts — ts is a client
-- assertion and a device with a far-future clock would otherwise never be pruned.
--
-- NEEDS pg_cron, which is off by default. Enable it at Dashboard > Database >
-- Extensions (supabase-setup.sql:16 says the same for §17's jobs). Without it
-- this one statement errors and everything above it is already committed, which
-- is fine: the table works, but nothing prunes it, so the "400 days" promise in
-- §2 does not exist until you either enable pg_cron and re-run this line or run
-- the delete by hand. Skipping it is safe at this data volume; forgetting you
-- skipped it is not, so it is written down in §8.
select cron.schedule('prune_app_events', '41 4 * * *', $cron$
  delete from public.app_events where created_at < now() - interval '400 days';
$cron$);

-- Quick totals for your dashboard:
--   select count(*) as events, count(distinct device) as devices,
--          min(ts)::date as first_event, max(ts)::date as last_event
--   from public.app_events;
