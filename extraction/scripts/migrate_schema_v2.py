"""One-off - migrate content/lexicon to the schema-v2 shape of ADR-0012.

Replaces the flat pos/translations/synonyms/examples with senses[], and adds
level, confusables, homograph and provenance. Everything extraction owns -
id, lemma, surfaceForms, occurrences, stats, domain, status - is untouched.

Safe because it is lossless: every field being replaced is empty on every entry
in the corpus, which is the whole reason ADR-0012 restructures now rather than
after the generation pass. The script refuses to run if that stops being true.

    python extraction/scripts/migrate_schema_v2.py --dry-run
    python extraction/scripts/migrate_schema_v2.py
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import CONTENT, save_json  # noqa: E402

LEX = CONTENT / "lexicon"
LEGACY = ("pos", "translations", "synonyms", "examples")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    files = sorted(LEX.glob("*.json"))
    carrying_data = []
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        if any(d.get(k) for k in LEGACY):
            carrying_data.append(f.stem)

    if carrying_data:
        print("REFUSING: %d entries already carry data in the fields this "
              "migration replaces." % len(carrying_data))
        print("  " + ", ".join(carrying_data[:20]))
        print("\nADR-0012 is only lossless while those fields are empty. Migrate "
              "them by hand, or revise the ADR.")
        return 1

    migrated, already = 0, 0
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        if "senses" in d:
            already += 1
            continue
        entry = {
            "id": d["id"],
            "lemma": d["lemma"],
            "level": None,
            "senses": [],
            "confusables": [],
            "homograph": {"suspected": False, "note": None},
            "surfaceForms": d["surfaceForms"],
            "occurrences": d["occurrences"],
            "stats": d["stats"],
            "status": d.get("status", "draft"),
            "provenance": None,
        }
        if "domain" in d:
            entry["domain"] = d["domain"]
        if not a.dry_run:
            save_json(f, entry)
        migrated += 1

    print("%s%d entries migrated, %d already on v2"
          % ("DRY RUN - " if a.dry_run else "", migrated, already))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
