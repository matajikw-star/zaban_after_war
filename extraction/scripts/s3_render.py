"""S3 - Render. Turns a paper's English pages into PNGs for the model to read.

This is the only stage whose output a model ever looks at, so it is also the
only place where token cost is decided. A page is capped at MAX_EDGE pixels:
large enough that 9pt exam print stays legible, small enough that a page costs
roughly 1.2k image tokens instead of 3.4k.

Renders only the vocabulary and cloze span (the agreed scope), never the
reading-comprehension pages that make up most of the English section.

--reading is the escape hatch for later. S1 records where every booklet's
reading passages sit (ADR-0008) but nothing transcribes them; when a reading
feature arrives, this turns that address into images without anyone reopening
the corpus by hand. It is not part of the extraction batch.

    python extraction/scripts/s3_render.py --paper arshad-1403-p01
    python extraction/scripts/s3_render.py --year 1404     # a whole year's pending
    python extraction/scripts/s3_render.py --next 4        # next pending papers
    python extraction/scripts/s3_render.py --booklet 1103-1405 --reading
"""
from __future__ import annotations
import argparse

import fitz

from common import PAGE_CACHE, RAW, STATE, read_jsonl, reading_pages, scope_pages

MAX_EDGE = 1400   # px on the long edge
BASE_DPI = 150    # rendered then downscaled, which is sharper than a low-DPI render


def render_paper(paper: dict, force: bool = False) -> list[str]:
    rep = paper["representative"]
    return render_pages(rep["file"], sorted(scope_pages(rep)),
                        PAGE_CACHE / paper["paperId"], force)


def render_pages(file: str, pages: list[int], out_dir, force: bool = False) -> list[str]:
    """Render an explicit page list of one PDF. The size policy is the same one
    S4 pays for, so a page rendered here costs what an exam page costs."""
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    with fitz.open(RAW / file) as doc:
        for pno in pages:
            dest = out_dir / f"p{pno:03d}.png"
            if not dest.exists() or force:
                pm = doc[pno - 1].get_pixmap(dpi=BASE_DPI)
                scale = MAX_EDGE / max(pm.width, pm.height)
                if scale < 1:
                    pm = doc[pno - 1].get_pixmap(dpi=int(BASE_DPI * scale))
                pm.save(dest)
            written.append(str(dest))
    return written


def render_reading(booklet_id: str, force: bool = False) -> int:
    routes = {r["bookletId"]: r for r in read_jsonl(STATE / "routes.jsonl")}
    route = routes.get(booklet_id)
    if route is None:
        print(f"Unknown bookletId {booklet_id}")
        return 1
    pages = reading_pages(route)
    if not pages:
        print(f"{booklet_id}: no reading pages recorded "
              f"(sectionScan={route.get('sectionScan') or 'not scanned'}). "
              f"Run: python extraction/scripts/s1_route.py --years {route['year']} --sections")
        return 1
    files = render_pages(route["file"], pages,
                         PAGE_CACHE / "reading" / booklet_id, force)
    print(f"{booklet_id}  {route['file']}  reading pages {pages}")
    for f in files:
        print(f"  {f}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", help="a paperId, e.g. arshad-1403-p01")
    ap.add_argument("--booklet", help="a bookletId, e.g. 1103-1405; use with --reading")
    ap.add_argument("--reading", action="store_true",
                    help="render the booklet's reading pages instead of the exam scope")
    ap.add_argument("--next", type=int, default=0, help="render the N next pending papers")
    ap.add_argument("--year", type=int, default=0,
                    help="render every pending paper of one year (the /complete-year unit)")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    if a.reading:
        if not a.booklet:
            print("--reading needs --booklet <bookletId>.")
            return 1
        return render_reading(a.booklet, a.force)

    papers = read_jsonl(STATE / "papers.jsonl")
    if not papers:
        print("No state/papers.jsonl - run s2_cluster.py first.")
        return 1

    if a.paper:
        sel = [p for p in papers if p["paperId"] == a.paper]
        if not sel:
            print(f"Unknown paperId {a.paper}")
            return 1
    elif a.year:
        sel = [p for p in papers
               if p["year"] == a.year and p.get("extraction") == "pending"]
        if not sel:
            done = [p for p in papers if p["year"] == a.year]
            print(f"Nothing pending for {a.year}"
                  + (f" - all {len(done)} papers are done." if done else
                     " - no papers clustered for that year yet."))
            return 0
    elif a.next:
        sel = [p for p in papers if p.get("extraction") == "pending"][:a.next]
    else:
        print("Pass --paper <id>, --year <year>, --next <n>, "
              "or --booklet <id> --reading.")
        return 1

    for p in sel:
        files = render_paper(p, a.force)
        print(f"{p['paperId']}  year={p['year']}  covers {p['bookletCount']} booklets "
              f"({len(p['groupCodes'])} field codes)")
        for f in files:
            print(f"  {f}")
    if not sel:
        print("Nothing pending.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
