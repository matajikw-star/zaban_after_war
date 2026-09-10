"""S3 - Render. Turns a paper's English pages into PNGs for the model to read.

This is the only stage whose output a model ever looks at, so it is also the
only place where token cost is decided. A page is capped at MAX_EDGE pixels:
large enough that 9pt exam print stays legible, small enough that a page costs
roughly 1.2k image tokens instead of 3.4k.

Renders only the vocabulary and cloze span (the agreed scope), never the
reading-comprehension pages that make up most of the English section.

    python extraction/scripts/s3_render.py --paper arshad-1403-p01
    python extraction/scripts/s3_render.py --next 4        # next pending papers
"""
from __future__ import annotations
import argparse

import fitz

from common import PAGE_CACHE, RAW, STATE, read_jsonl, scope_pages

MAX_EDGE = 1400   # px on the long edge
BASE_DPI = 150    # rendered then downscaled, which is sharper than a low-DPI render


def render_paper(paper: dict, force: bool = False) -> list[str]:
    rep = paper["representative"]
    wanted = set(scope_pages(rep))

    out_dir = PAGE_CACHE / paper["paperId"]
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    with fitz.open(RAW / rep["file"]) as doc:
        for pno in sorted(wanted):
            dest = out_dir / f"p{pno:03d}.png"
            if dest.exists() and not force:
                written.append(str(dest))
                continue
            pm = doc[pno - 1].get_pixmap(dpi=BASE_DPI)
            scale = MAX_EDGE / max(pm.width, pm.height)
            if scale < 1:
                pm = doc[pno - 1].get_pixmap(dpi=int(BASE_DPI * scale))
            pm.save(dest)
            written.append(str(dest))
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", help="a paperId, e.g. arshad-1403-p01")
    ap.add_argument("--next", type=int, default=0, help="render the N next pending papers")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    papers = read_jsonl(STATE / "papers.jsonl")
    if not papers:
        print("No state/papers.jsonl - run s2_cluster.py first.")
        return 1

    if a.paper:
        sel = [p for p in papers if p["paperId"] == a.paper]
        if not sel:
            print(f"Unknown paperId {a.paper}")
            return 1
    elif a.next:
        sel = [p for p in papers if p.get("extraction") == "pending"][:a.next]
    else:
        print("Pass --paper <id> or --next <n>.")
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
