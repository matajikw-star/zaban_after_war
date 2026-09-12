"""S5 - Cross-check. Verifies model-extracted questions against the local OCR.

The safety net, and it costs nothing. The extractor never sees the OCR text
(see extraction/PIPELINE.md -> "Why the extractor is kept blind"), so the two
transcripts are independent: if a hallucinated or misread option appears in the
JSON, it will not have a match in the OCR of the same page.

An option that fails here is not automatically wrong - OCR fails too - it is
flagged for a second, Opus-grade look at just that paper.

    python extraction/scripts/s5_crosscheck.py
    python extraction/scripts/s5_crosscheck.py --paper arshad-1403-p01
"""
from __future__ import annotations
import argparse
import difflib
import json
import re
from collections import Counter

from common import CONTENT, OCR_CACHE, STATE, read_jsonl, scope_pages, write_jsonl

FUZZ = 0.85       # per-word similarity floor
FLAG_RATIO = 0.9  # a paper below this share of matched options gets flagged


def ocr_tokens(booklet_id: str, pages: list[int]) -> set[str]:
    toks: set[str] = set()
    for pno in pages:
        cf = OCR_CACHE / booklet_id / f"p{pno:03d}.txt"
        if cf.exists():
            toks |= {t.lower() for t in re.findall(r"[A-Za-z]{2,}",
                                                   cf.read_text(encoding="utf-8"))}
    return toks


def word_present(word: str, toks: set[str]) -> bool:
    w = word.lower().strip()
    if not w:
        return True
    if w in toks:
        return True
    return bool(difflib.get_close_matches(w, toks, n=1, cutoff=FUZZ))


def check_paper(exam: dict, route: dict) -> dict:
    # Exactly the pages S3 rendered - the check asks whether the local OCR of
    # what the model saw corroborates what it wrote. Widening the pool to the
    # whole English section (which now reaches to the end of the reading) would
    # let a stray word from a passage vouch for a misread option.
    pages = scope_pages(route)
    toks = ocr_tokens(route["bookletId"], pages)
    misses, total = [], 0
    for q in exam.get("questions", []):
        for i, opt in enumerate(q.get("options") or []):
            if opt is None:
                continue
            total += 1
            # An option may be a phrase; every word of it must be traceable.
            words = re.findall(r"[A-Za-z]{3,}", opt)
            if words and not all(word_present(w, toks) for w in words):
                misses.append({"q": q.get("no"), "option": i, "text": opt})
    matched = total - len(misses)
    ratio = matched / total if total else 1.0
    return {
        "paperId": exam["paperId"],
        "options": total,
        "matched": matched,
        "ratio": round(ratio, 3),
        "ocrPages": len(pages),
        "status": "ok" if ratio >= FLAG_RATIO else "flagged",
        "misses": misses[:40],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper")
    a = ap.parse_args()

    papers = {p["paperId"]: p for p in read_jsonl(STATE / "papers.jsonl")}
    routes = {r["bookletId"]: r for r in read_jsonl(STATE / "routes.jsonl")}
    exam_files = sorted((CONTENT / "exams").glob("*.json"))
    if a.paper:
        exam_files = [f for f in exam_files if f.stem == a.paper]
    if not exam_files:
        print("No extracted exams to check.")
        return 0

    results = []
    for f in exam_files:
        exam = json.loads(f.read_text(encoding="utf-8"))
        paper = papers.get(exam["paperId"])
        if not paper:
            results.append({"paperId": exam["paperId"], "status": "orphan",
                            "misses": [], "ratio": 0.0})
            continue
        route = routes.get(paper["representative"]["bookletId"])
        if not route:
            results.append({"paperId": exam["paperId"], "status": "no-route",
                            "misses": [], "ratio": 0.0})
            continue
        results.append(check_paper(exam, route))

    write_jsonl(STATE / "crosscheck.jsonl", results)
    print("status:", dict(Counter(r["status"] for r in results)))
    for r in sorted(results, key=lambda x: x["ratio"]):
        if r["status"] != "ok":
            print(f"\n{r['paperId']}  matched {r.get('matched')}/{r.get('options')} "
                  f"({r['ratio']:.0%})  -> re-extract on Opus")
            for m in r["misses"][:8]:
                print(f"    q{m['q']} option {m['option'] + 1}: {m['text']!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
