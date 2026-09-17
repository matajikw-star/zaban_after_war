"""S8 step 1 - build the judging batches from the S7 shortlist.

Reads extraction/state/stem-vocab.json, keeps the `mid` and `rare` bands, and
writes them as numbered batches under extraction/state/judge/.

The rows are deliberately lean. S7 records every field code a word's papers
carry, which for a general paper is 124 codes that say nothing (ADR-0011,
"attribution is not detection"). Carrying that into the judging prompt would
cost tokens and invite the model to read meaning into it, so a broad code set
is reduced to its scope alone and only a narrow one keeps its codes.

Writes nothing to content/.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "extraction" / "state"
JUDGE = STATE / "judge"
BATCH_SIZE = 125


def main() -> None:
    data = json.loads((STATE / "stem-vocab.json").read_text(encoding="utf-8"))
    shortlist = [w for w in data["words"] if w["band"] in ("mid", "rare")]
    shortlist.sort(key=lambda w: w["lemma"])

    rows = []
    for w in shortlist:
        ex = w.get("example") or {}
        row = {
            "lemma": w["lemma"],
            "band": w["band"],
            "generalRank": w["generalRank"],
            "distinctYears": w["distinctYears"],
            "occurrences": w["occurrences"],
            "paperId": ex.get("paperId"),
            "questionNo": ex.get("questionNo"),
            "stem": ex.get("stem"),
        }
        if w["surfaces"] != [w["lemma"]]:
            row["surfaces"] = w["surfaces"]
        if w.get("lemmaUncertain"):
            row["lemmaUncertain"] = True
        field = w.get("field") or {}
        if field.get("scope") == "specific":
            row["fieldCodes"] = field["codes"]
        rows.append(row)

    for old in JUDGE.glob("batch-*.json"):
        old.unlink()

    n = 0
    for i in range(0, len(rows), BATCH_SIZE):
        n += 1
        chunk = rows[i : i + BATCH_SIZE]
        out = JUDGE / f"batch-{n:02d}.json"
        out.write_text(json.dumps(chunk, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{out.name}: {len(chunk)} words  {chunk[0]['lemma']} .. {chunk[-1]['lemma']}")

    print(f"\n{len(rows)} shortlist words in {n} batches")


if __name__ == "__main__":
    main()
