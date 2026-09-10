"""S0 - Survey. Reads every PDF's page count and size into state/booklets.jsonl.

Cheap (seconds), no OCR, no tokens. Safe to re-run: it is a full rebuild.
"""
from __future__ import annotations
import sys
import fitz
from common import RAW, STATE, parse_name, write_jsonl


def main() -> int:
    rows, bad = [], []
    files = sorted(p.name for p in RAW.glob("*.pdf"))
    for i, name in enumerate(files):
        meta = parse_name(name)
        if not meta:
            bad.append(name)
            continue
        try:
            with fitz.open(RAW / name) as doc:
                meta["pages"] = doc.page_count
        except Exception as e:
            meta["pages"] = None
            meta["error"] = str(e)[:120]
        meta["bytes"] = (RAW / name).stat().st_size
        rows.append(meta)
        if i % 500 == 0:
            print(f"  ...{i}/{len(files)}", file=sys.stderr)

    write_jsonl(STATE / "booklets.jsonl", rows)
    years = sorted({r["year"] for r in rows})
    print(f"booklets: {len(rows)}   pages: {sum(r['pages'] or 0 for r in rows)}")
    print(f"years: {years[0]}..{years[-1]} ({len(years)} present)")
    if bad:
        print(f"UNPARSED FILENAMES ({len(bad)}): {bad[:20]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
