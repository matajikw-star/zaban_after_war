"""S6 - Lexicon. Folds extracted exams into content/lexicon/<word-id>.json.

Pure, deterministic, and idempotent: the lexicon is a fold over every file in
content/exams/, so re-running after a re-extraction repairs rather than
duplicates. Word ids are frozen on first sight (CLAUDE.md -> "Word ids"); this
script will refuse to rename one and reports the collision instead.

Two things the owner asked to be first-class here:

  isAnswer   Every option a word appeared as is recorded with whether it was the
             correct answer. A word tested as the key is worth more study time
             than one that only ever served as a distractor.
  byYear     How often the word was tested in each Jalali year, so recency and
             persistence can both drive the curriculum.

    python extraction/scripts/s6_lexicon.py --dry-run
    python extraction/scripts/s6_lexicon.py
"""
from __future__ import annotations
import argparse
import json
from collections import defaultdict

from common import CONTENT, STATE, load_json, read_jsonl, save_json, slugify

LEX = CONTENT / "lexicon"
IN_SCOPE_PARTS = {"vocabulary", "cloze"}


def collect(exam_files: list) -> dict[str, dict]:
    """Group every occurrence by word id, from every exam on disk."""
    acc: dict[str, dict] = defaultdict(lambda: {"lemmas": set(), "occ": []})
    for f in exam_files:
        exam = json.loads(f.read_text(encoding="utf-8"))
        year, paper_id = exam["year"], exam["paperId"]
        reach = exam.get("bookletCount", 1)
        for q in exam.get("questions", []):
            part = q.get("part")
            if part not in IN_SCOPE_PARTS:
                continue
            options = q.get("options") or []
            lemmas = q.get("optionLemmas") or options
            key = q.get("key")
            for i, opt in enumerate(options):
                lemma = (lemmas[i] if i < len(lemmas) else opt) or opt
                if not lemma:
                    continue
                wid = slugify(lemma)
                if not wid:
                    continue
                acc[wid]["lemmas"].add(lemma.strip().lower())
                acc[wid]["occ"].append({
                    "paperId": paper_id,
                    "year": year,
                    "questionNo": q.get("no"),
                    "part": part,
                    "optionIndex": i,
                    "surface": opt,
                    "isAnswer": (key == i),
                    "reach": reach,
                })
    return acc


def build_stats(occ: list[dict]) -> dict:
    by_year: dict[str, int] = defaultdict(int)
    answers_by_year: dict[str, int] = defaultdict(int)
    for o in occ:
        by_year[str(o["year"])] += 1
        if o["isAnswer"]:
            answers_by_year[str(o["year"])] += 1
    years = sorted({o["year"] for o in occ})
    times_answer = sum(1 for o in occ if o["isAnswer"])
    return {
        "timesTested": len(occ),
        "timesAsAnswer": times_answer,
        "timesAsDistractor": len(occ) - times_answer,
        "distinctYears": len(years),
        "firstYear": years[0] if years else None,
        "lastYear": years[-1] if years else None,
        "byYear": dict(sorted(by_year.items(), reverse=True)),
        "answersByYear": dict(sorted(answers_by_year.items(), reverse=True)),
        # Study priority: being the correct answer counts triple, and breadth
        # across years counts more than repetition inside one year.
        "priority": times_answer * 3 + (len(occ) - times_answer) + len(years) * 2,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    exam_files = sorted((CONTENT / "exams").glob("*.json"))
    if not exam_files:
        print("No files in content/exams/ - nothing to fold.")
        return 0
    LEX.mkdir(parents=True, exist_ok=True)

    acc = collect(exam_files)
    created, updated, frozen_conflicts = 0, 0, []

    for wid, data in sorted(acc.items()):
        path = LEX / f"{wid}.json"
        prev = load_json(path, default=None)
        occ = sorted(data["occ"], key=lambda o: (-o["year"], o["paperId"], o["questionNo"] or 0))
        lemma = sorted(data["lemmas"])[0]

        if prev and prev.get("id") != wid:
            frozen_conflicts.append((wid, prev.get("id")))
            continue

        entry = {
            "id": wid,                                  # frozen forever
            "lemma": prev.get("lemma") if prev else lemma,
            "pos": (prev or {}).get("pos", []),
            "translations": (prev or {}).get("translations", []),
            "synonyms": (prev or {}).get("synonyms", []),
            "examples": (prev or {}).get("examples", []),
            "surfaceForms": sorted({o["surface"] for o in occ if o["surface"]}),
            "occurrences": occ,
            "stats": build_stats(occ),
            "status": (prev or {}).get("status", "draft"),
        }
        if prev == entry:
            continue
        if not a.dry_run:
            save_json(path, entry)
        if prev:
            updated += 1
        else:
            created += 1

    total = len(acc)
    answers = sum(1 for d in acc.values() if any(o["isAnswer"] for o in d["occ"]))
    print(f"{'DRY RUN - ' if a.dry_run else ''}words: {total}   "
          f"created: {created}   updated: {updated}")
    print(f"words that were the correct answer at least once: {answers}")
    top = sorted(acc.items(), key=lambda kv: -build_stats(kv[1]["occ"])["priority"])[:12]
    print("\nhighest priority so far:")
    for wid, d in top:
        s = build_stats(d["occ"])
        print(f"  {wid:<22} tested {s['timesTested']:>2}x  "
              f"answer {s['timesAsAnswer']:>2}x  years {s['byYear']}")
    if frozen_conflicts:
        print(f"\nFROZEN-ID CONFLICTS (resolve by hand): {frozen_conflicts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
