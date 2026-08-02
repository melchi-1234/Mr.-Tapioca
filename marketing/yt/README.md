# YouTube channel art

- `avatar-800.png` — channel profile picture (800x800). YouTube crops it to a
  circle, so the character sits with margin on every side. Matches the app
  icon's cream-and-character identity.
- `banner-2560x1440.png` — channel banner. Everything important (character,
  wordmark, tagline, App Store pill, boba cup) sits inside the 1546x423
  center safe area, so phone, desktop and TV crops all show the full lockup.
  The decorative pearls only show on wider crops.

Built from real app art: `Pose Happy.png`, `Mr. Tapioca.png`, the pearl
currency sprite, and the app's own SVG boba cup from index.html (shown
brimful with classic milk tea). Wordmark is SF Compact Rounded, same as the
promo posters.

Rebuild after tweaking the .html sources (image paths are relative to the
repo, the font loads straight from /System/Library/Fonts):

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor=1 --window-size=2560,1440 \
  --screenshot=banner-2560x1440.png "file://$PWD/banner.html"
```

Same command for the avatar with `--window-size=800,800` and `avatar.html`.
