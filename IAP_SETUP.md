# Real In-App Purchases — your App Store Connect checklist

The app code is DONE: premium skins/backgrounds are real StoreKit purchases on
iPhone (localized prices, purchase sheet, restore on reinstall, a Restore
button in Settings). What the code can't do is create the products in Apple's
system — that's a one-time job in App Store Connect, about 15 minutes.

## 1. Create the 6 products

App Store Connect → My Apps → **Mr. Tapioca** → Monetization → **In-App
Purchases** → **+**. For each row below create a purchase with:

- Type: **Non-Consumable**
- Price: **$1.99** (Tier 2) — or whatever you want, the app shows the real price
- Cleared for Sale: **on**

| Reference Name (for you) | Product ID (EXACT — copy-paste)            |
|--------------------------|--------------------------------------------|
| Ninja Skin               | `com.melchior.mrtapioca.skin.ninja`        |
| Wizard Skin              | `com.melchior.mrtapioca.skin.wizard`       |
| Angel Skin               | `com.melchior.mrtapioca.skin.angel`        |
| Devil Skin               | `com.melchior.mrtapioca.skin.devil`        |
| Winter Cocoa Background  | `com.melchior.mrtapioca.theme.winter`      |
| Galaxy Dream Background  | `com.melchior.mrtapioca.theme.galaxy`      |

The Product IDs must match EXACTLY (the app derives them from the shop item
ids). Localization: give each an English display name (e.g. "Ninja Skin") and
a one-line description (e.g. "Dress Mr. Tapioca as a silent ninja.").

Each product also wants a **review screenshot** — a screenshot of the Shop
sheet showing that item is fine (same one works for all six).

## 2. Sign the Paid Applications agreement

App Store Connect → Business (or Agreements, Tax, and Banking) → **Paid Apps**
agreement → accept + fill in banking + tax forms. **Purchases fail silently
until this is Active** — do it first, approval can take a day.

## 3. Test WITHOUT spending money (before Build 4 even)

In Xcode you can fake the store locally:

1. File → New → File… → search "StoreKit Configuration File" → create
   `Products.storekit` (no target membership needed).
2. In it, + → Add Non-Consumable → recreate the 6 products above (same IDs).
3. Product → Scheme → Edit Scheme… → Run → Options → **StoreKit
   Configuration: Products.storekit**.
4. Run on your iPhone → Shop → tap ✦ $1.99 → Apple's purchase sheet appears →
   buy with the fake store. Delete + reinstall the app → Settings → Restore →
   your purchases come back.

When you upload Build 4+ to TestFlight, testers automatically get **sandbox**
purchases (real sheet, no charge) — Dasha can buy everything for free.

## 4. When you submit for review

- Submit the 6 IAPs **together with the app version** (they appear on the
  version page under In-App Purchases — add them there).
- In App Review notes mention: "Premium cosmetics are non-consumable IAPs;
  Restore Purchases is in Settings."

## How it behaves in the app (already built)

- iPhone: ✦ buttons show the REAL localized price once products load; tapping
  opens Apple's native purchase sheet; success unlocks + equips availability
  instantly and survives reinstall (entitlements re-checked at every launch).
- "Ask to Buy" kids' accounts: purchase shows "pending" toast, unlocks
  automatically once a parent approves.
- Web: unchanged — premium items show the preview dialog pointing at the
  iPhone app (no fake purchases shown to Apple, no broken buttons on web).
