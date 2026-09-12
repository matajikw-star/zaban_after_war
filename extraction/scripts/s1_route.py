"""S1 - Route. Finds which pages of each booklet hold the English section.

Runs a local English-only OCR model. It reads Latin script well and turns
Persian into noise, so "how much real English is on this page" cleanly separates
the English section from the other ~90% of the booklet. Costs CPU, zero tokens.

Every OCR'd page is cached under extraction/cache/ocr/, which later stages reuse
for fingerprinting (S2) and the free cross-check (S5). Re-running is cheap.

S1 also runs the section scan: it carries on past the Part C marker to the end of
the English run and records where reading comprehension and any standalone
grammar block sit, in readingPages / grammarPages. Those pages are never
transcribed and never reach a model - the point is only that a later reading or
grammar feature can find them without re-opening 7.7 GB of scans (ADR-0008).

    python extraction/scripts/s1_route.py --years 1401-1405 --workers 6
"""
from __future__ import annotations
import argparse
import os

# Each worker process gets one OCR thread. Without this, every worker's ONNX
# runtime spawns a full thread pool and 12 workers thrash a 16-core box - it
# measured ~7x slower than one thread each.
for _v in ("OMP_NUM_THREADS", "ORT_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import sys
import time
from collections import Counter
from multiprocessing import Pool

import fitz
import numpy as np

from common import (GRAMMAR_BLOCK, OCR_CACHE, PART_A, PART_B, PART_C, RAW, STATE,
                    english_score, keep_awake, read_jsonl, write_jsonl)

PROBE_UNTIL = 8    # English sits near the front of every booklet seen so far
SECTION_CAP = 24   # how deep the section scan will chase the end of the reading
DEEP_STEP = 3      # coarse sweep stride when the front probe finds nothing
DPI = 100          # readable for OCR without wasting CPU

_ocr = None


def _get_ocr():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
    return _ocr


def page_text(doc, pno: int, booklet: str) -> str:
    """OCR one page, memoised on disk. pno is 1-based."""
    cf = OCR_CACHE / booklet / f"p{pno:03d}.txt"
    if cf.exists():
        return cf.read_text(encoding="utf-8")
    pm = doc[pno - 1].get_pixmap(dpi=DPI)
    arr = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, pm.n)
    if pm.n == 4:
        arr = arr[:, :, :3]
    res, _ = _get_ocr()(arr)
    txt = " ".join(r[1] for r in res) if res else ""
    cf.parent.mkdir(parents=True, exist_ok=True)
    cf.write_text(txt, encoding="utf-8")
    return txt


def score_page(doc, pno: int, booklet: str) -> dict:
    """english_score of one page, plus whether it opens a standalone grammar
    block. Cached, so a page any earlier run touched is free."""
    txt = page_text(doc, pno, booklet)
    s = english_score(txt)
    s["grammar"] = bool(GRAMMAR_BLOCK.search(txt))
    return s


def route_one(rec: dict) -> dict:
    name, booklet = rec["file"], rec["bookletId"]
    out = {
        "bookletId": booklet, "file": name, "year": rec["year"], "code": rec["code"],
        "englishPages": [], "partA": [], "partB": [], "partC": [],
        "readingPages": [], "grammarPages": [], "sectionScan": "",
        "status": "ok", "note": "",
    }
    try:
        with fitz.open(RAW / name) as doc:
            n = doc.page_count
            scores: dict[int, dict] = {}
            seen_english, misses = False, 0

            for pno in range(2, min(n, PROBE_UNTIL) + 1):
                s = score_page(doc, pno, booklet)
                scores[pno] = s
                if s["isEnglish"]:
                    seen_english, misses = True, 0
                elif seen_english:
                    misses += 1
                    if misses >= 2:
                        break
                # Reading comprehension is out of scope, and it is always last.
                # Stopping here saves OCR on the longest pages in the booklet.
                if PART_C.search(" ".join(s["markers"])):
                    break

            if not seen_english:  # rare: the English section sits deeper
                for pno in range(PROBE_UNTIL + 1, n + 1, DEEP_STEP):
                    s = score_page(doc, pno, booklet)
                    scores[pno] = s
                    if s["isEnglish"]:
                        seen_english = True
                        lo, hi = max(2, pno - DEEP_STEP), min(n, pno + 8)
                        for q in range(lo, hi + 1):
                            if q not in scores:
                                scores[q] = score_page(doc, q, booklet)
                        break

            eng = sorted(p for p, s in scores.items() if s["isEnglish"])
            out["englishPages"] = eng
            for pno in eng:
                blob = " ".join(scores[pno]["markers"])
                if PART_A.search(blob):
                    out["partA"].append(pno)
                if PART_B.search(blob):
                    out["partB"].append(pno)
                if PART_C.search(blob):
                    out["partC"].append(pno)

            # The section scan. The loop above stops at the Part C marker
            # because nothing the lexicon needs lives past it. Carry on now and
            # record how far the English section actually runs, so that the
            # address of every reading passage in the corpus is on disk once and
            # for all. OCR only - no page here is ever rendered or transcribed.
            if not eng:
                out["sectionScan"] = "no-english"
            elif not out["partC"]:
                out["sectionScan"] = "no-part-c"
            else:
                start = out["partC"][0]
                last, misses = start, 0
                for pno in range(start + 1, min(n, SECTION_CAP) + 1):
                    sc = scores.get(pno) or score_page(doc, pno, booklet)
                    scores[pno] = sc
                    if sc["isEnglish"]:
                        last, misses = pno, 0
                    else:
                        misses += 1
                        if misses >= 2:
                            break
                # A contiguous span, not a filter: a page the OCR misjudged in
                # the middle of a passage is still part of the reading, and an
                # address that skips it would send a future feature to the wrong
                # page.
                out["readingPages"] = list(range(start, last + 1))
                out["sectionScan"] = "capped" if last >= min(n, SECTION_CAP) else "ok"

            out["grammarPages"] = sorted(p for p, sc in scores.items()
                                         if sc.get("grammar"))

            if not eng:
                out["status"] = "no-english"
                out["note"] = f"scanned {len(scores)} of {n} pages"
            elif not out["partA"]:
                out["status"] = "needs-review"
                out["note"] = "English found but no PART A marker"
    except Exception as e:
        out["status"], out["note"] = "error", str(e)[:160]
    return out


def parse_years(spec: str | None, booklets: list[dict]) -> set[int]:
    if not spec:
        return {b["year"] for b in booklets}
    years: set[int] = set()
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            years |= set(range(int(a), int(b) + 1))
        else:
            years.add(int(part))
    return years


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="e.g. 1401-1405 or 1400,1402")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--redo", action="store_true", help="re-route booklets already routed")
    ap.add_argument("--sections", action="store_true",
                    help="also revisit booklets routed before the section scan existed")
    a = ap.parse_args()

    booklets = read_jsonl(STATE / "booklets.jsonl")
    if not booklets:
        print("No state/booklets.jsonl - run s0_survey.py first.")
        return 1

    want = parse_years(a.years, booklets)
    routes = {r["bookletId"]: r for r in read_jsonl(STATE / "routes.jsonl")}
    def needs_work(b: dict) -> bool:
        r = routes.get(b["bookletId"])
        if r is None or a.redo:
            return True
        # Backfill: rows written before the section scan carry no sectionScan.
        # Phase 1 replays off the OCR cache, so this costs only the reading pages.
        return a.sections and not r.get("sectionScan")

    todo = [b for b in booklets if b["year"] in want and needs_work(b)]
    todo.sort(key=lambda b: (-b["year"], b["code"]))
    if a.limit:
        todo = todo[:a.limit]

    print(f"routing {len(todo)} booklets  years={sorted(want)}  workers={a.workers}")
    if not todo:
        return 0

    def flush():
        write_jsonl(STATE / "routes.jsonl",
                    sorted(routes.values(), key=lambda r: (-r["year"], r["code"])))

    # Hours of OCR with no window on screen. Without this the machine can idle
    # into Modern Standby at the screen timeout and quietly stop making
    # progress - see common.keep_awake.
    t0, done = time.time(), 0
    with keep_awake(f"{len(todo)} booklets"), Pool(a.workers) as pool:
        for res in pool.imap_unordered(route_one, todo, chunksize=1):
            routes[res["bookletId"]] = res
            done += 1
            if done % 10 == 0 or done == len(todo):
                rate = done / max(time.time() - t0, 1e-9)
                eta = (len(todo) - done) / max(rate, 1e-9)
                print(f"  {done}/{len(todo)}  {rate * 60:.1f}/min  eta {eta / 60:.0f}m",
                      file=sys.stderr, flush=True)
                flush()
    flush()

    fresh = [routes[b["bookletId"]] for b in todo]
    print("status:", dict(Counter(r["status"] for r in fresh)))
    print(f"mean English pages/booklet: "
          f"{sum(len(r['englishPages']) for r in fresh) / max(len(fresh), 1):.1f}")
    located = [r for r in fresh if r.get("readingPages")]
    print("sectionScan:", dict(Counter(r.get("sectionScan") or "-" for r in fresh)))
    print(f"reading located for {len(located)}/{len(fresh)}, "
          f"mean {sum(len(r['readingPages']) for r in located) / max(len(located), 1):.1f} "
          f"pages/booklet; "
          f"{sum(1 for r in fresh if r.get('grammarPages'))} with a standalone grammar block")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
