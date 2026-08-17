#!/usr/bin/env python3
from pathlib import Path


root = Path(__file__).resolve().parent.parent
html = (root / "resources/focus-reset/index.html").read_text()
assert '<meta name="viewport"' in html
assert "<main" in html
assert "https://mrtapioca.me/get?src=" in html
assert "target=\"_blank\"" not in html
assert "20-minute" in html
print("Mr. Tapioca resource page passed")
