"""Shared helpers for the extraction pipeline. See extraction/PIPELINE.md."""
from __future__ import annotations
import json, os, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw_konkour_files"
STATE = ROOT / "extraction" / "state"
CACHE = ROOT / "extraction" / "cache"
OCR_CACHE = CACHE / "ocr"
PAGE_CACHE = CACHE / "pages"
CONTENT = ROOT / "content"

for _d in (STATE, OCR_CACHE, PAGE_CACHE):
    _d.mkdir(parents=True, exist_ok=True)

# --- filename parsing -------------------------------------------------------
# Real names in the corpus are messy: "1101-1403.pdf", "1101-1393-.pdf",
# "1148 (2)-1394.pdf", "1113 -1394.pdf", "1102-1389-(2).pdf".
_NAME = re.compile(
    r"^(?P<code>\d{4})\s*(?:\((?P<cvar>\d+)\))?\s*-\s*"
    r"(?P<year>13\d\d|14\d\d)\s*-?\s*(?:\((?P<yvar>\d+)\))?\s*-?$"
)

def parse_name(filename: str) -> dict | None:
    stem = re.sub(r"\.pdf$", "", filename, flags=re.I).strip()
    m = _NAME.match(stem)
    if not m:
        return None
    d = m.groupdict()
    variant = d["cvar"] or d["yvar"]
    return {
        "file": filename,
        "code": d["code"],
        "year": int(d["year"]),
        "variant": int(variant) if variant else None,
        "bookletId": f"{d['code']}-{d['year']}" + (f"-v{variant}" if variant else ""),
    }

# --- English detection ------------------------------------------------------
# Local OCR runs an English-only model: it reads Latin script well and turns
# Persian into noise. That asymmetry is the router. We score a page by how much
# of it is real English, not merely Latin-looking.
SECTION_MARKERS = re.compile(
    r"(part\s*[abcd]\b|vocabulary|directions?\s*:|cloze|reading\s+comprehension|"
    r"best\s+completes|answer\s+sheet|structure\s+and\s+written)", re.I)

PART_A = re.compile(r"part\s*a\b|vocabulary", re.I)
PART_B = re.compile(r"part\s*b\b|cloze", re.I)
PART_C = re.compile(r"part\s*c\b|reading\s+comprehension", re.I)

_STOPWORDS = set("""the of and to in a is that for it was as with be by on not he his are this
have from or had which but were an they you all we her she has been would their said one there
what so up out if about who get which when make can like time no just him know take people into
year your good some could them see other than then now look only come its over think also back
after use two how our work first well way even new want because any these give day most us""".split())

def english_score(text: str) -> dict:
    """Cheap, deterministic 'is this an English exam page?' score."""
    toks = re.findall(r"[A-Za-z]{2,}", text)
    low = [t.lower() for t in toks]
    stop_hits = sum(1 for t in low if t in _STOPWORDS)
    n = max(len(low), 1)
    return {
        "tokens": len(low),
        "stopRatio": round(stop_hits / n, 3),
        "stopHits": stop_hits,
        "markers": sorted({m.group(0).lower() for m in SECTION_MARKERS.finditer(text)}),
        "isEnglish": stop_hits >= 12 and (stop_hits / n) >= 0.12,
    }

def fingerprint_tokens(text: str) -> set[str]:
    """Order-free signature. OCR scrambles reading order across columns, so we
    compare bags of distinctive words, never sequences."""
    toks = {t.lower() for t in re.findall(r"[A-Za-z]{4,}", text)}
    return {t for t in toks if t not in _STOPWORDS and not t.startswith("konkur")
            and t not in {"telegram", "forum", "uni", "www"}}

def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)

# --- jsonl state ------------------------------------------------------------
def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out

def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
    tmp.replace(path)

def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                   encoding="utf-8")
    tmp.replace(path)

def slugify(word: str) -> str:
    w = unicodedata.normalize("NFKD", word).encode("ascii", "ignore").decode()
    w = re.sub(r"[^A-Za-z0-9]+", "-", w).strip("-").lower()
    return w
