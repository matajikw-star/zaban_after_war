"""S10 - apply generated word data to content/lexicon/.

The generation pass owns exactly five fields: level, senses, confusables,
homograph, provenance. Extraction owns id, lemma, surfaceForms, occurrences,
stats and domain, and re-derives them on every run (ADR-0012). This script is
the only sanctioned way to write the generated side, because it reads the
existing entry, replaces those five keys and nothing else, and saves through
the same `save_json` the rest of the pipeline uses - so neither the other
provenance nor the file formatting can drift.

Input: a JSON file mapping word-id -> {level, senses, confusables, homograph}.
`provenance` is stamped here rather than typed out 2,098 times.

    python extraction/scripts/s10_apply_word_data.py batch.json [--dry-run]

Validates before writing anything; a batch with any error writes nothing.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_json, save_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LEXICON = ROOT / "content" / "lexicon"

OWNED = ("level", "senses", "confusables", "homograph", "provenance")
LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
SENSE_KEYS = {"pos", "ipa", "definition", "translations", "synonyms",
              "antonyms", "examples", "testedIn"}
MODEL = "claude-opus-5"


def has_persian(s: str) -> bool:
    return any("؀" <= c <= "ۿ" for c in s)


def validate(word_id: str, data: dict, entry: dict) -> list[str]:
    """Everything that would make this entry wrong, as a list of messages."""
    errs: list[str] = []

    def err(m):
        errs.append(f"{word_id}: {m}")

    extra = set(data) - set(OWNED)
    if extra:
        err(f"writes fields it does not own: {sorted(extra)}")

    if data.get("level") not in LEVELS:
        err(f"level {data.get('level')!r} is not one of {sorted(LEVELS)}")

    senses = data.get("senses") or []
    if not senses:
        err("no senses")

    # Every tested occurrence must be claimed by exactly one sense's testedIn
    # (lint rule 13), and a sense may not claim a question the word never
    # occurred in.
    occ_tested = {(o["paperId"], o["questionNo"])
                  for o in entry.get("occurrences", [])
                  if o.get("occurrenceType") == "tested"}
    occ_all = {(o["paperId"], o["questionNo"]) for o in entry.get("occurrences", [])}
    claimed: dict[tuple, int] = {}

    # The word's own exam sentences, so an authored example can never be one of
    # them (lint rule 14).
    stems = set()
    for o in entry.get("occurrences", []):
        exam = load_json(ROOT / "content" / "exams" / f"{o['paperId']}.json")
        if not exam:
            continue
        for q in exam.get("questions", []):
            if q.get("no") == o["questionNo"] and q.get("stem"):
                stems.add(" ".join(q["stem"].split()).lower())

    for i, s in enumerate(senses):
        tag = f"sense[{i}]"
        bad = set(s) - SENSE_KEYS
        if bad:
            err(f"{tag} has unknown keys {sorted(bad)}")
        for k in ("pos", "ipa", "definition"):
            if not s.get(k):
                err(f"{tag} has no {k}")
        if s.get("definition") and has_persian(s["definition"]):
            err(f"{tag} definition must be English")
        tr = s.get("translations") or []
        if not tr:
            err(f"{tag} has no translations")
        for t in tr:
            if not has_persian(t):
                err(f"{tag} translation {t!r} is not Persian")
        ex = s.get("examples") or []
        if not ex:
            err(f"{tag} has no examples")
        for j, e in enumerate(ex):
            if not e.get("en") or not e.get("fa"):
                err(f"{tag} example[{j}] needs both en and fa")
                continue
            if has_persian(e["en"]):
                err(f"{tag} example[{j}].en must be English")
            if not has_persian(e["fa"]):
                err(f"{tag} example[{j}].fa must be Persian")
            if " ".join(e["en"].split()).lower() in stems:
                err(f"{tag} example[{j}].en reproduces this word's own exam stem")
        for t in s.get("testedIn") or []:
            key = (t.get("paperId"), t.get("questionNo"))
            if key not in occ_all:
                err(f"{tag} testedIn {key} is not an occurrence of this word")
            claimed[key] = claimed.get(key, 0) + 1

    for key in sorted(occ_tested - set(claimed)):
        err(f"tested occurrence {key} is claimed by no sense")
    for key, n in sorted(claimed.items()):
        if n > 1:
            err(f"occurrence {key} is claimed by {n} senses")

    h = data.get("homograph")
    if not isinstance(h, dict) or "suspected" not in h or "note" not in h:
        err("homograph must be {suspected, note}")
    elif h["suspected"] and not h.get("note"):
        err("homograph.suspected is true but note is empty")

    for c in data.get("confusables") or []:
        if not c.get("word") or not c.get("note"):
            err(f"confusable {c!r} needs both word and note")
        elif not has_persian(c["note"]):
            err(f"confusable {c['word']!r} note must be Persian")

    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("batch", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--at", default=None, help="provenance date, default today")
    args = ap.parse_args()

    at = args.at or __import__("datetime").date.today().isoformat()
    batch = json.loads(args.batch.read_text(encoding="utf-8"))

    entries, errors = {}, []
    for word_id, data in batch.items():
        path = LEXICON / f"{word_id}.json"
        entry = load_json(path)
        if entry is None:
            errors.append(f"{word_id}: no such lexicon file")
            continue
        if entry.get("id") != word_id:
            errors.append(f"{word_id}: file's id is {entry.get('id')!r}")
            continue
        errors += validate(word_id, data, entry)
        entries[word_id] = (path, entry, data)

    if errors:
        print(f"REJECTED - {len(errors)} problem(s), nothing written:")
        for e in errors:
            print("  -", e)
        return 1

    for word_id, (path, entry, data) in entries.items():
        entry["level"] = data["level"]
        entry["senses"] = data["senses"]
        entry["confusables"] = data.get("confusables") or []
        entry["homograph"] = data["homograph"]
        entry["provenance"] = {"model": MODEL, "at": at, "schemaVersion": 2}
        if not args.dry_run:
            save_json(path, entry)

    verb = "would write" if args.dry_run else "wrote"
    print(f"OK - {verb} {len(entries)} entries")
    flagged = [w for w, (_, _, d) in entries.items() if d["homograph"]["suspected"]]
    if flagged:
        print(f"homograph suspects ({len(flagged)}): {', '.join(sorted(flagged))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
