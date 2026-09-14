"""Where the corpus stands, and what to run next.

The first thing every session runs, and the only piece of pipeline state a
session needs in its context. Also owns the extraction status field, so no other
script has to rewrite papers.jsonl.

    python extraction/scripts/status.py
    python extraction/scripts/status.py --mark arshad-1403-p01 extracted
"""
from __future__ import annotations
import argparse
import json
from collections import Counter, defaultdict

from common import CONTENT, STATE, read_jsonl, write_jsonl

STATUSES = ("pending", "extracted", "needs-owner-review")


def mark(paper_id: str, status: str) -> int:
    if status not in STATUSES:
        print(f"status must be one of {STATUSES}")
        return 1
    papers = read_jsonl(STATE / "papers.jsonl")
    hit = False
    for p in papers:
        if p["paperId"] == paper_id:
            p["extraction"] = status
            hit = True
    if not hit:
        print(f"unknown paperId {paper_id}")
        return 1
    write_jsonl(STATE / "papers.jsonl", papers)
    print(f"{paper_id} -> {status}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mark", nargs=2, metavar=("PAPER_ID", "STATUS"))
    a = ap.parse_args()
    if a.mark:
        return mark(a.mark[0], a.mark[1])

    booklets = read_jsonl(STATE / "booklets.jsonl")
    routes = read_jsonl(STATE / "routes.jsonl")
    papers = read_jsonl(STATE / "papers.jsonl")
    checks = {c["paperId"]: c for c in read_jsonl(STATE / "crosscheck.jsonl")}
    exams = sorted((CONTENT / "exams").glob("*.json"))
    words = sorted((CONTENT / "lexicon").glob("*.json"))

    all_years = sorted({b["year"] for b in booklets}, reverse=True)
    routed_years = {r["year"] for r in routes}

    print(f"corpus      {len(booklets)} booklets, "
          f"{sum(b.get('pages') or 0 for b in booklets)} pages, "
          f"years {all_years[-1] if all_years else '-'}..{all_years[0] if all_years else '-'}")
    print(f"routed      {len(routes)}/{len(booklets)} booklets  "
          f"({len(routed_years)} years)   " + ("" if len(routes) else "<- start here"))
    if routes:
        bad = Counter(r["status"] for r in routes if r["status"] != "ok")
        if bad:
            print(f"            route problems: {dict(bad)}")
        # Located, never transcribed (ADR-0008). Nothing downstream waits on
        # this, so it is reported, not enforced.
        scanned = [r for r in routes if r.get("sectionScan")]
        located = [r for r in scanned if r.get("readingPages")]
        pages = sum(len(r["readingPages"]) for r in located)
        print(f"sections    {len(scanned)}/{len(routes)} booklets scanned  "
              f"({len(located)} with reading located, {pages} pages addressed)"
              + ("" if len(scanned) == len(routes) else
                 "   <- backfill: s1_route.py --sections"))

    by_year: dict[int, Counter] = defaultdict(Counter)
    for p in papers:
        by_year[p["year"]][p.get("extraction", "pending")] += 1
    done = sum(1 for p in papers if p.get("extraction") == "extracted")
    print(f"papers      {done}/{len(papers)} extracted "
          f"(from {sum(p['bookletCount'] for p in papers)} booklets)")
    for y in sorted(by_year, reverse=True):
        c = by_year[y]
        bar = " ".join(f"{k}={v}" for k, v in sorted(c.items()))
        print(f"   {y}     {bar}")

    flagged = [p for p, c in checks.items() if c["status"] != "ok"]
    if checks:
        print(f"crosscheck  {len(checks) - len(flagged)}/{len(checks)} clean"
              + (f"   flagged: {flagged[:6]}" if flagged else ""))

    n_q = 0
    for f in exams:
        try:
            n_q += len(json.loads(f.read_text(encoding="utf-8")).get("questions", []))
        except Exception:
            pass
    print(f"content     {len(exams)} exam files, {n_q} questions, {len(words)} lexicon words")

    # --- what to run next -------------------------------------------------
    print("\nnext:")
    unrouted_years = [y for y in all_years if y not in routed_years]
    if not booklets:
        print("  python extraction/scripts/s0_survey.py")
    elif not routes:
        print("  python extraction/scripts/s1_route.py --years 1401-1405 --workers 12")
    elif len(papers) == 0:
        print("  python extraction/scripts/s2_cluster.py")
    elif any(c.get("pending") for c in by_year.values()):
        pend = sum(c.get("pending", 0) for c in by_year.values())
        # A year is the unit the owner works in: one command finishes one year
        # and leaves the corpus in a state a cold session can read off disk.
        nxt = max(y for y, c in by_year.items() if c.get("pending"))
        print(f"  /complete-year {nxt}   "
              f"({by_year[nxt]['pending']} papers pending in {nxt}, "
              f"{pend} in all)")
    elif unrouted_years:
        print(f"  /complete-year {unrouted_years[0]}   "
              f"(not routed yet - the command runs S1 and S2 for it first)")
        nxt = unrouted_years[:5]
        print("  or route a whole block yourself, then come back:")
        print(f"    python extraction/scripts/s1_route.py --years {min(nxt)}-{max(nxt)} --workers 12")
        print("    python extraction/scripts/s2_cluster.py")
    else:
        print("  nothing pending - the whole corpus is extracted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
