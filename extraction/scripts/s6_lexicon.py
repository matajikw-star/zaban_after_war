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

A paper retired with `duplicateOf` (ADR-0021) is folded as a second reading of
the paper it duplicates, so one question counts once - see `collect`.

    python extraction/scripts/s6_lexicon.py --dry-run
    python extraction/scripts/s6_lexicon.py
"""
from __future__ import annotations
import argparse
import json
from collections import defaultdict

from common import CONTENT, STOPWORDS, load_json, read_jsonl, save_json, slugify

LEX = CONTENT / "lexicon"
IN_SCOPE_PARTS = {"vocabulary", "cloze"}


def same_text(a, b) -> bool:
    return " ".join((a or "").split()).lower() == " ".join((b or "").split()).lower()


def collect(exam_files: list) -> dict[str, dict]:
    """Group every occurrence by word id, from every exam on disk.

    A retired paper - one carrying `duplicateOf` (ADR-0021) - is the same English
    test as the paper it names, split off by S2 clustering. It is folded as a
    second reading of that paper, never as a paper of its own: its questions are
    booked on the kept paper's id, question number, part and key, and a word the
    kept reading already booked for that question is not booked again. So one
    question counts once, while an option both transcripts agree on but lemmatise
    differently (`creatively` read once as itself, once as `creative`) still
    reaches both ids, as it would have in any other year. An option the two
    transcripts disagree on is a misreading in one of them and books nothing -
    `content:lint` check 17 reports it.
    """
    exams = [json.loads(f.read_text(encoding="utf-8")) for f in exam_files]
    by_id = {e["paperId"]: e for e in exams}
    # The booklets that sat a retired paper sat the kept one: its reach is theirs too.
    reach = {e["paperId"]: e.get("bookletCount", 1) for e in exams if not e.get("duplicateOf")}
    for e in exams:
        if e.get("duplicateOf"):
            reach[e["duplicateOf"]] += e.get("bookletCount", 1)

    acc: dict[str, dict] = defaultdict(lambda: {"lemmas": set(), "occ": []})
    # (word id, paperId, questionNo): one occurrence per word per question, so a
    # repeated option or a second transcript cannot inflate a word's frequency.
    booked: set[tuple] = set()
    # Kept papers first, so every occurrence both readings agree on comes from the kept one.
    for exam in sorted(exams, key=lambda e: bool(e.get("duplicateOf"))):
        counted = by_id[exam.get("duplicateOf") or exam["paperId"]]
        year, paper_id = counted["year"], counted["paperId"]
        counterpart = {q.get("no"): q for q in counted.get("questions", [])}
        for q in exam.get("questions", []):
            cq = q if counted is exam else counterpart.get(q.get("no"))
            if cq is None:
                continue
            part = cq.get("part")
            if part not in IN_SCOPE_PARTS:
                continue
            options = cq.get("options") or []
            read = q.get("options") or []
            lemmas = q.get("optionLemmas") or read
            key = cq.get("key")

            norm = [((lemmas[i] if i < len(lemmas) else o) or o or "").strip().lower()
                    for i, o in enumerate(read)]
            # A question whose four options share one lemma tests grammar, not
            # vocabulary - "and formulated / who formulating / was formulated"
            # would otherwise book `formulate` four times for one item. The
            # extractor labels these `grammar`, but the shape is checkable here
            # and this stage must not depend on it having got that right.
            if len({n for n in norm if n}) < 2:
                continue

            for i, opt in enumerate(options):
                if i >= len(read) or not same_text(read[i], opt):
                    continue
                lemma = norm[i]
                if not lemma or lemma in STOPWORDS:
                    continue
                wid = slugify(lemma)
                if not wid or (wid, paper_id, cq.get("no")) in booked:
                    continue
                booked.add((wid, paper_id, cq.get("no")))
                acc[wid]["lemmas"].add(lemma)
                acc[wid]["occ"].append({
                    "occurrenceType": "tested",
                    "paperId": paper_id,
                    "year": year,
                    "questionNo": cq.get("no"),
                    "part": part,
                    "optionIndex": i,
                    "surface": opt,
                    "isAnswer": (key == i),
                    "reach": reach[paper_id],
                })
    return acc


def build_stats(occ: list[dict], context: list[dict] | None = None) -> dict:
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
        # A word can also appear in a question's stem without ever being tested.
        # It is counted separately and deliberately kept out of `priority`: how
        # often a word turns up in prose is not how much study time it is worth,
        # which is the distinction ADR-0011 exists to enforce.
        "timesAsContext": len(context or []),
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
    retired = {f.stem for f in exam_files
               if json.loads(f.read_text(encoding="utf-8")).get("duplicateOf")}
    created, updated, frozen_conflicts = 0, 0, []

    for wid, data in sorted(acc.items()):
        path = LEX / f"{wid}.json"
        prev = load_json(path, default=None)
        occ = sorted(data["occ"], key=lambda o: (-o["year"], o["paperId"], o["questionNo"] or 0))
        lemma = sorted(data["lemmas"])[0]

        if prev and prev.get("id") != wid:
            frozen_conflicts.append((wid, prev.get("id")))
            continue

        # Context occurrences come from S8, not from the options, so this fold
        # cannot re-derive them. Carry them through, or re-running S6 would
        # silently delete the whole context-vocabulary pass.
        # One on a retired paper is dropped: the kept paper carries the same stem
        # (s8_fold.py and s8_finalize.py skip retired papers the same way).
        context = [o for o in (prev or {}).get("occurrences", [])
                   if o.get("occurrenceType") == "context" and o["paperId"] not in retired]

        entry = {
            "id": wid,                                  # frozen forever
            "lemma": prev.get("lemma") if prev else lemma,
            # Written by the generation pass, not derivable here (ADR-0012).
            "level": (prev or {}).get("level"),
            "senses": (prev or {}).get("senses", []),
            "confusables": (prev or {}).get("confusables", []),
            "homograph": (prev or {}).get("homograph", {"suspected": False, "note": None}),
            "surfaceForms": sorted({o["surface"] for o in occ + context if o.get("surface")}),
            "occurrences": occ + context,
            "stats": build_stats(occ, context),
            "status": (prev or {}).get("status", "draft"),
            "provenance": (prev or {}).get("provenance"),
        }
        # Set by S8 for a domain term, and no more re-derivable here than the
        # context occurrences are.
        if prev and "domain" in prev:
            entry["domain"] = prev["domain"]
        # A retired id (ADR-0021) stays retired: if an exam ever books it again,
        # lint check 4 blocks and a human decides, rather than this fold silently
        # un-retiring it.
        if prev and "retired" in prev:
            entry["retired"] = prev["retired"]
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
    # A lexicon file this fold no longer produces is never deleted here - word ids
    # are frozen - so it is named, and content:lint check 18 keeps naming it.
    orphans = sorted(
        f.stem for f in LEX.glob("*.json")
        if f.stem not in acc and any(
            o.get("occurrenceType") == "tested"
            for o in json.loads(f.read_text(encoding="utf-8")).get("occurrences", [])))
    if orphans:
        print(f"\ntested words this fold no longer derives (left untouched): {orphans}")
    if frozen_conflicts:
        print(f"\nFROZEN-ID CONFLICTS (resolve by hand): {frozen_conflicts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
