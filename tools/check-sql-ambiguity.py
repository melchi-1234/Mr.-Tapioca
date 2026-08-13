#!/usr/bin/env python3
"""Catch the bug class that cost three round-trips on 2026-08-13.

plpgsql resolves a BARE name that is both an in-scope variable (a local, a
parameter, or a RETURNS TABLE output column) and a real table column as
ambiguous, and raises at RUN time with 42702. A grammar check cannot see it;
tools/check-sql.py passed all three times while the live database threw on every
call.

The signal is not "a variable shares a name with a column" (a function returning
rows of a table always will). The signal is a BARE occurrence of such a name in a
place where Postgres has to choose: a WHERE/ON CONFLICT/comparison. A name that
only ever appears qualified (`s.state`), as a SET target (`set state = ...`, which
is always the column), or with a `p_`/`v_` prefix is fine.

    .sqlvenv/bin/python tools/check-sql-ambiguity.py supabase-reward-v2.sql
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def columns(sql: str) -> set:
    cols = set()
    for tbl in re.finditer(r"create table[^(]*\((.*?)\n\);", sql, re.S | re.I):
        for line in tbl.group(1).splitlines():
            m = re.match(r"\s{2,}(\w+)\s+\w", line)
            if m and m.group(1).lower() not in (
                    "primary", "unique", "foreign", "check", "constraint"):
                cols.add(m.group(1))
    return cols


def bare_risky(body: str, name: str) -> bool:
    """Is `name` used bare where Postgres must choose between the variable and a
    column? Only two places carry that danger: a WHERE clause and an ON CONFLICT
    target list. A SET list is ignored on purpose - the left of `col = expr` is
    always the column, and the danger there is nil.
    """
    # strip comments and flatten, so multi-line statements read as one string
    flat = re.sub(r"--[^\n]*", " ", body)
    flat = re.sub(r"\s+", " ", flat)
    bare = re.compile(r"(?<![.\w])" + re.escape(name) + r"\b")

    for stmt in flat.split(";"):
        # ON CONFLICT (a, b, c): every listed name is a bare column reference
        for oc in re.finditer(r"on conflict\s*\(([^)]*)\)", stmt, re.I):
            if name in [x.strip() for x in oc.group(1).split(",")]:
                return True
        # everything from WHERE to the end of the statement (past SET, past
        # RETURNING) is comparison territory
        w = re.search(r"\bwhere\b", stmt, re.I)
        if w and bare.search(stmt[w.end():]):
            return True
    return False


def check(path: Path) -> int:
    sql = path.read_text()
    cols = columns(sql)
    if not cols:
        return 0
    problems = 0
    for fn in re.finditer(
        r"create or replace function\s+([\w.]+)\s*\((.*?)\)\s*\nreturns\s+(.*?)\s+language\s+(\w+)",
        sql, re.S | re.I,
    ):
        name, _args, ret, lang = fn.groups()
        if lang.lower() != "plpgsql":
            continue
        body = sql[fn.start():sql.index("$$;", fn.start())]
        if "#variable_conflict" in body:
            continue

        names = set()
        rt = re.match(r"table\s*\((.*)\)", ret.strip(), re.S | re.I)
        if rt:
            names |= {m.group(1) for m in re.finditer(r"(\w+)\s+\w", rt.group(1))}
        if "declare" in body.lower():
            dec = body[body.lower().index("declare"):body.lower().index("begin")]
            names |= {m.group(1) or m.group(2) for m in re.finditer(
                r"(?:^|\n)\s*(?:(\w+)\s+constant\s|(\w+)\s+(?!constant)\w)", dec)}
        names.discard(None)

        for n in sorted(names & cols):
            if bare_risky(body, n):
                print(f"AMBIGUITY  {path.name}: {name} uses bare `{n}` where a "
                      f"column of that name is in scope -> 42702 at run time. "
                      f"Qualify it (`x.{n}`), rename the variable `v_{n}`, or add "
                      f"`#variable_conflict use_column`.")
                problems += 1
    if not problems:
        print(f"OK   {path.name}: no bare variable/column ambiguities")
    return problems


def main() -> int:
    files = [Path(a) for a in sys.argv[1:]] or sorted(ROOT.glob("*.sql"))
    bad = sum(check(f) for f in files)
    print(f"\n{len(files)} file(s), {bad} ambiguity(ies)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
