"""Convert the owner's field-code workbook into content/field-codes.json.

`content/exams/*.json` carries `groupCodes` - the کد رشته that sat each paper -
and 44 lexicon entries carry a `domain` block naming the codes a term belongs
to. Both were unreadable until the owner supplied
`sources/reference/field-codes.xlsx` (2026-09-17).

Kept as a script rather than run once by hand because codes are not stable
across years: when the owner supplies a fuller or newer sheet, re-run this
rather than hand-editing the JSON.

    python extraction/scripts/field_codes.py [--dry-run]

Two things it will not do. It never invents a name for a code the sheet does
not carry, and where the sheet is self-contradictory it routes the code to
`needsReview` instead of picking a winner - guessing a field name from the
vocabulary of its paper is the error ADR-0011 exists to correct.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / "sources" / "reference" / "field-codes.xlsx"
OUT = ROOT / "content" / "field-codes.json"

# The sheet mixes Arabic and Persian forms of the same two letters, so
# `مهندسي` and `مهندسی` appear as different strings. The product is Persian.
ARABIC = str.maketrans({"ي": "ی", "ك": "ک", "\u00a0": " ", "\u200c": "\u200c"})


# Codes the owner named directly, which the sheet does not carry. Kept here so
# that re-running against a fuller sheet cannot silently drop them. The sheet
# always wins where the two disagree - that disagreement is worth seeing.
OWNER_SUPPLIED = {
    # 2026-09-17: "۱۱۲۱ کد ارشد زبان انگلیسیه". This is the field this product
    # is built for, and its paper is a general English test - so a word tagged
    # 1121 is vocabulary that appeared in an English exam, not a technical term
    # of any discipline. See the note on `domain` in extraction/WORD-DATA.md.
    "1121": "زبان انگلیسی",
}


def clean(name: str) -> str:
    name = name.translate(ARABIC)
    name = " ".join(name.split())
    # "رشته اقتصاد" is the prefix plus the name. The UI already says
    # «اصطلاح تخصصی رشتهٔ ...», so keeping it would read «رشتهٔ رشته اقتصاد».
    for prefix in ("رشته ", "رشتهٔ "):
        if name.startswith(prefix):
            name = name[len(prefix):]
    return name.strip()


def read_book() -> dict[str, list[str]]:
    ws = openpyxl.load_workbook(BOOK, data_only=True).worksheets[0]
    rows: dict[str, list[str]] = defaultdict(list)
    for i, (code, name) in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or code is None or name is None:
            continue
        key = str(code).replace("\u00a0", "").strip()
        value = clean(str(name))
        if key and value and value not in rows[key]:
            rows[key].append(value)
    return dict(rows)


def corpus_codes() -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for f in sorted((ROOT / "content" / "exams").glob("*.json")):
        for c in json.loads(f.read_text(encoding="utf-8")).get("groupCodes", []):
            counts[str(c)] += 1
    return dict(counts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rows = read_book()
    codes: dict[str, str] = {}
    review: dict[str, list[str]] = {}
    for code, names in rows.items():
        if len(names) == 1:
            codes[code] = names[0]
        else:
            review[code] = names

    # Two rows arrived with a neighbouring row's name run into them - a
    # spreadsheet artifact, not a field whose name contains two fields.
    for code in ("1363", "1503"):
        if code in codes and len(codes[code].split()) > 2:
            review[code] = [codes.pop(code)]

    owner_only = {c: n for c, n in OWNER_SUPPLIED.items()
                  if c not in codes and c not in review}
    codes.update(owner_only)

    corpus = corpus_codes()
    known = sorted(c for c in corpus if c in codes)
    unknown = sorted(c for c in corpus if c not in codes)

    doc = {
        "$comment": (
            "Maps a کد رشته to its Persian field name. Read by the domain-term "
            "display and by onboarding's field picker. Codes are NOT stable "
            "across years - see the ticket. Never infer a name from the "
            "vocabulary of a paper; leave it out instead."
        ),
        "source": "sources/reference/field-codes.xlsx, supplied by the owner 2026-09-17",
        "ownerSupplied": sorted(owner_only),
        "coverage": {
            "namedCodes": len(codes),
            "codesInCorpus": len(corpus),
            "codesInCorpusNamed": len(known),
            "codesInCorpusUnnamed": len(unknown),
        },
        "unnamed": unknown,
        "needsReview": review,
        "codes": dict(sorted(codes.items())),
    }

    print(f"sheet rows: {len(rows)}   named: {len(codes)}   needs review: {len(review)}")
    for c in sorted(owner_only):
        print(f"  owner-supplied: {c} -> {owner_only[c]}")
    print(f"corpus codes: {len(corpus)}   named: {len(known)}   unnamed: {len(unknown)}")
    for code, names in sorted(review.items()):
        print(f"  needs review: {code} -> {names}")
    if args.dry_run:
        print("DRY RUN - nothing written")
        return 0
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
