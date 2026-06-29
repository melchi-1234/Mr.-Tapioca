# Put Mr. Tapioca online (free, ~2 minutes)

This hosts the app at a public **https** link so you can:
- open it on your **phone** (and "Add to Home Screen" for the real full-screen app + icon),
- test the **live friends Squad** across two phones,
- **share** it so other people can try it.

GitHub Pages serves your repo directly — no server, no cost.

## Steps (one-time)
1. Open your repo: **https://github.com/melchi-1234/Mr.-Tapioca**
2. Click **Settings** (top-right of the repo).
3. Left sidebar → **Pages**.
4. **Build and deployment → Source:** choose **Deploy from a branch**.
5. **Branch:** pick **`feature-work`**, folder **/(root)** → **Save**.
6. Wait ~1–2 min, then refresh that Pages settings page. It'll show:
   **"Your site is live at https://melchi-1234.github.io/Mr.-Tapioca/"**
7. Open that link on your phone → Share → **Add to Home Screen**.

Every time I push updates, just reload the page — the app auto-updates.

## Why this matters (beyond sharing)
- It's **https**, so the boba **map's location** and the **accounts** work properly on your phone. (They don't over a plain `http://192.168…` LAN link — that's why some things felt broken on the phone before.)
- This serves the **offline** Study Squad until you also add Supabase keys
  (see **SUPABASE_SETUP.md**) — then friends sync **live** across devices.

## Testing the friends Squad
**Right now (offline):** Squad → **Invite a friend** copies your code. You and a friend each open the Pages link, swap codes, and paste each other's in **Squad → Add** — you'll each see the other on your leaderboard (a snapshot from when they shared).

**Live (auto-syncing, two phones):** do **SUPABASE_SETUP.md** (free, ~10 min) → both phones open the Pages link → each: **Invite** → swap codes → you now see each other update **live**, with the new **activity statuses** (🟢 Focusing / 🌸 On a break / ⚪ Online).

## Later: a "real" release
You're currently deploying the dev branch (`feature-work`). When you want a stable public version, merge to `main` and switch the Pages branch to `main` in step 5.
