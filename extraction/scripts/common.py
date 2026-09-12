"""Shared helpers for the extraction pipeline. See extraction/PIPELINE.md."""
from __future__ import annotations
import contextlib, ctypes, json, os, re, sys, unicodedata
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

# --- keeping the machine awake ----------------------------------------------
# These laptops are Modern Standby (powercfg /a reports "S0 Low Power Idle" and
# no S3). On that hardware the screen timeout is itself an entry into standby,
# not just a display-off: Windows can then throttle or suspend ordinary desktop
# processes. A pass that takes hours and shows no window is exactly the kind of
# process that gets suspended, and it looks like a hang rather than a stall.
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


@contextlib.contextmanager
def keep_awake(label: str = ""):
    """Hold the system awake for the duration of the block.

    ES_DISPLAY_REQUIRED is deliberately NOT set. The screen still turns off on
    its own timeout - that is what protects the panel from a static image - and
    only the idle-to-standby transition is blocked. The request is released on
    exit, including on Ctrl-C, so it never outlives the run that asked for it.
    """
    held = False
    if sys.platform == "win32":
        try:
            held = bool(ctypes.windll.kernel32.SetThreadExecutionState(
                ES_CONTINUOUS | ES_SYSTEM_REQUIRED))
        except Exception as e:
            print(f"keep-awake: could not ask Windows to stay awake ({e}); "
                  f"this run may stall when the screen times out", flush=True)
        if held:
            print(f"keep-awake: holding{' for ' + label if label else ''} "
                  f"(screen may still turn off)", flush=True)
    try:
        yield held
    finally:
        if held:
            ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)


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

# A standalone "Structure and Written Expression" block. Rare: it appears on 10
# of the 2,239 pages OCR'd so far. Nearly all grammar in this corpus sits inside
# Part A or the Part B cloze instead, and those items are transcribed with their
# section (the extractor tags them part="grammar"; only the lexicon fold skips
# them). This regex locates the rare standalone block; it is not a general
# "find the grammar" test.
GRAMMAR_BLOCK = re.compile(
    r"structure\s+and\s+written|written\s+expression|sentence\s+structure", re.I)

STOPWORDS = set("""the of and to in a is that for it was as with be by on not he his are this
have from or had which but were an they you all we her she has been would their said one there
what so up out if about who get which when make can like time no just him know take people into
year your good some could them see other than then now look only come its over think also back
after use two how our work first well way even new want because any these give day most us""".split())

def english_score(text: str) -> dict:
    """Cheap, deterministic 'is this an English exam page?' score."""
    toks = re.findall(r"[A-Za-z]{2,}", text)
    low = [t.lower() for t in toks]
    stop_hits = sum(1 for t in low if t in STOPWORDS)
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
    return {t for t in toks if t not in STOPWORDS and not t.startswith("konkur")
            and t not in {"telegram", "forum", "uni", "www"}}

def general_pages(route: dict) -> list[int]:
    """The general-English pages of a booklet: everything before Part C.

    The English section is two different things bolted together. زبان عمومی
    (Part A vocabulary, Part B cloze) is shared across many field codes; زبان
    تخصصی - the reading passages under Part C - is written for the field and
    differs in every booklet. Measured on 1405: fingerprinting the whole English
    run put 1101 and 1102 at 0.25 similarity and found no duplicates at all,
    because the specialist passages drowned the shared part. Fingerprinting only
    the pages before Part C puts them at 0.94 and still separates 1103's
    different paper cleanly at 0.10.
    """
    eng = sorted(route.get("englishPages") or [])
    part_c = sorted(route.get("partC") or [])
    if part_c:
        general = [p for p in eng if p < part_c[0]]
        if general:
            return general
    return route.get("partA") or eng[:2]


def reading_pages(route: dict) -> list[int]:
    """Where this booklet's reading comprehension lives: 1-based page numbers
    in its own PDF, or [] when S1 has not section-scanned the booklet yet.

    Located, never transcribed - ADR-0008. The first entry is the page that
    opens Part C, which usually also carries the tail of the cloze.
    """
    return sorted(route.get("readingPages") or [])


def scope_pages(route: dict) -> list[int]:
    """Pages rendered for the model: the general-English pages, plus the first
    Part C page. Part markers say where a section starts, not where it ends, so
    cloze options routinely run onto the page that opens reading comprehension.
    One extra image per paper is a cheap price for not truncating the cloze; the
    extractor is told to ignore reading passages."""
    general = general_pages(route)
    part_c = sorted(route.get("partC") or [])
    if general and part_c and part_c[0] not in general:
        return general + [part_c[0]]
    return general


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
