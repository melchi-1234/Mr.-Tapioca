#!/usr/bin/env python3
# Verify every path in sw.js's SHELL list actually exists.
#
#   python3 tools/check-shell.py        (exit 1 if anything is missing)
#
# Run this before every release. The service worker's install handler has NO
# catch, which is deliberate and load-bearing: a partial precache would brick
# offline boot, so a failed fetch must fail the whole install and leave the old
# worker in place.
#
# The consequence is that ONE missing file stops updates shipping, silently and
# app-wide. cache.addAll rejects, install fails, the new worker never activates,
# activate never runs, the old cache is never purged, and every installed user
# keeps serving the previous release forever. No error surfaces anywhere in the
# app — it simply looks like your changes did nothing.
#
# This is not hypothetical. assets/Bed.png was deleted during the break-mode
# rebuild and left listed in SHELL. Every CACHE bump after that failed to
# install, so clients kept pre-rebuild art: poses already in their cache stayed
# stale while ones they had never loaded arrived fresh from the network, which
# read as "some poses look wrong and others look fine".
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    sw = os.path.join(REPO, "sw.js")
    src = open(sw).read()

    block = re.search(r"const SHELL = \[(.*?)\];", src, re.S)
    if not block:
        print("could not find the SHELL list in sw.js")
        return 2

    paths = re.findall(r'"([^"]+)"', block.group(1))
    missing = [p for p in paths if p != "./" and
               not os.path.exists(os.path.join(REPO, p))]

    version = re.search(r'const CACHE = "([^"]+)"', src)
    print(f"{version.group(1) if version else '?'}: {len(paths)} precached paths")

    if missing:
        print(f"\nFAIL — {len(missing)} listed but not on disk:")
        for p in missing:
            print(f"  - {p}")
        print("\nEvery installed user would silently keep the previous release.")
        print("Delete these lines from SHELL in sw.js, or restore the files.")
        return 1

    print("PASS — every precached path exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
