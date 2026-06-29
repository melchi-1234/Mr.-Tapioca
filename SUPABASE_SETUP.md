# Turning on the live Study Squad (backend setup)

Right now the app works 100% offline — friends are added by sharing a code, and
their stats are a snapshot. Follow these steps to switch on a **real backend** so
accounts are live and friends' stats sync automatically. It's **free** (Supabase
free tier) and takes about 10 minutes. You only do this once.

You don't need to understand any of the code — just follow along.

---

## Part A — Create the free project
1. Go to **supabase.com** → **Start your project** → sign in (GitHub or email).
2. Click **New project**.
3. Name it `mr-tapioca`. Click **Generate a password** and save it somewhere.
4. Pick the region closest to you. Plan: **Free**. Click **Create new project**.
5. Wait ~2 minutes while it sets up.

## Part B — Turn on anonymous accounts
1. Left sidebar → **Authentication** → **Sign In / Providers**.
2. Find **Anonymous sign-ins** → toggle it **ON** → **Save**.
   (This gives each person an account with no email/password needed.)

## Part C — (Recommended) anti-spam
- Still in **Authentication → Rate limits**, leave the anonymous limit at its
  default. If you ever get a flood of junk accounts, come back here and turn on
  **CAPTCHA** for anonymous sign-ins.

## Part D — Turn on the auto-cleanup scheduler
1. Left sidebar → **Database** → **Extensions**.
2. Search **`pg_cron`** → enable it.
   (This runs the automatic cleanup that keeps you on the free tier. If you can't
   find it, skip — the app still works; you'd just clean up manually someday.)

## Part E — Create the database (one paste)
1. Left sidebar → **SQL Editor** → **New query**.
2. Open the file **`supabase-setup.sql`** (in the app folder), copy **everything**,
   paste it into the editor, and click **Run**.
3. You should see **Success**. (That created all the tables, security rules, and
   functions in one go.)

## Part F — Connect the app (paste 2 values)
1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open **`config.js`** in the app folder and fill them in:
   ```js
   window.MRTAP_CLOUD = {
     url: "https://YOURPROJECT.supabase.co",
     anonKey: "paste-the-anon-public-key-here"
   };
   ```
4. Save. **That's it** — the app is now live. (Leave these blank anytime to go
   back to the offline version.)

> ⚠️ These two values are **public** and safe to ship in the app. **Never** paste
> the **`service_role`** key here — that one is secret.

---

## Part G — Before submitting to the App Store
Because the app now has accounts, Apple needs two things (both already built/handled):

1. **In-app account deletion** — already added: **Settings → Delete my account**.
   (Apple requires this whenever an app creates accounts, even anonymous ones.)
2. **A privacy policy URL + privacy labels.** Put the text below on a free page
   (GitHub Pages, Notion, or carrd.co), then add the link in App Store Connect.
   - In **App Store Connect → App Privacy**, declare you collect: a **display
     name**, **focus stats** (minutes, drinks, streak, skin), a random **friend
     code**, and an **anonymous account id** — *Linked to the user*, **Not used
     for tracking**, purpose **App Functionality**. Nothing else. (No tracking =
     no "ask to track" popup.)

### Drop-in privacy policy (fill the brackets)
> **Mr. Tapioca Privacy Policy.** Mr. Tapioca collects a display name you choose,
> your focus stats (minutes focused, drinks finished, streak, equipped skin), a
> random friend code, and an anonymous account identifier. We do **not** collect
> your email, real name, location, or contacts, and we use **no** advertising or
> analytics trackers. This data powers the friends leaderboard ("Study Squad"):
> anyone you give your friend code to can see your display name and stats. Data is
> stored with our backend provider (Supabase). You can delete all of it anytime
> from **Settings → Delete my account**. The app is not directed at children under
> 13. Questions: [your email].

---

## How it behaves once live
- First launch creates an anonymous account + a 6-character friend code.
- **Invite a friend** shares that code; a friend pastes it in **Squad → Add** and
  now sees your live stats. (One-directional — adding them doesn't reveal you to
  them unless they add your code too.)
- The leaderboard refreshes when you open the Squad tab and after focus sessions.

## A note on "real boba discounts" (future)
For the vanity leaderboard, focus minutes are a soft stat. **Before** you ever tie
focus minutes to *real* partner discounts, harden them so they can't be faked —
see the **FUTURE HARDENING** note at the bottom of `supabase-setup.sql`.
