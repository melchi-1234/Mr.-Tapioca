#!/usr/bin/env python3
"""Parse-check every .sql file with the REAL Postgres parser.

There is no Postgres on this machine, so a migration cannot be executed before it
is pasted into the Supabase SQL editor. This is the next best thing and it is not
a toy: pglast wraps libpg_query, which is Postgres's own grammar compiled as a
library, so a file that passes here will not fail on a syntax error in the
dashboard. It checks the plpgsql function BODIES too, which the plain statement
parse skips (to the outer grammar a $$...$$ body is just a string, so a typo in
one is invisible until you run it).

What this DOES catch: syntax, malformed DDL, a broken plpgsql body.
What it CANNOT catch: a missing table, a wrong column name, a bad type, an RLS
mistake, or anything else that needs a live catalog. Those still need the run.

    python3 -m venv .sqlvenv && .sqlvenv/bin/pip install pglast
    .sqlvenv/bin/python tools/check-sql.py            # all *.sql in the repo root
    .sqlvenv/bin/python tools/check-sql.py foo.sql
"""
import re
import sys
from pathlib import Path

try:
    from pglast.parser import ParseError, parse_plpgsql_json, parse_sql, split
except ImportError:
    sys.exit("pglast not installed:  python3 -m venv .sqlvenv && "
             ".sqlvenv/bin/pip install pglast")

ROOT = Path(__file__).resolve().parent.parent


def check(path: Path) -> int:
    sql = path.read_text()
    try:
        stmts = parse_sql(sql)
    except ParseError as e:
        pos = getattr(e, "location", 0) or 0
        print(f"FAIL {path.name}: {e}  (near line {sql.count(chr(10), 0, pos) + 1})")
        return 1

    fails = 0
    bodies = 0
    for s in split(sql):
        if not re.match(r"\s*create\s+(or\s+replace\s+)?function", s, re.I):
            continue
        if not re.search(r"language\s+plpgsql", s, re.I):
            continue
        bodies += 1
        name = re.search(r"function\s+([\w.]+)", s, re.I)
        name = name.group(1) if name else "?"
        try:
            parse_plpgsql_json(s if s.rstrip().endswith(";") else s + ";")
        except ParseError as e:
            print(f"FAIL {path.name}: plpgsql {name}: {e}")
            fails += 1

    if not fails:
        print(f"OK   {path.name}: {len(stmts)} statements, {bodies} plpgsql bodies")
    return fails


def main() -> int:
    args = sys.argv[1:]
    files = [Path(a) for a in args] if args else sorted(ROOT.glob("*.sql"))
    if not files:
        print("no .sql files found")
        return 0
    bad = sum(check(f) for f in files)
    print(f"\n{len(files)} file(s), {bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
