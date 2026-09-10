# Source manifest

Every raw exam paper, listed before it is ingested. The human adds rows here; Claude reads them.

Files live in `sources/raw/` and are tracked with Git LFS. If a file is too large or cannot be
shared, still add its row and mark `file` as `EXTERNAL` with a note on where it lives.

| exam-id | degree | year (Jalali) | field | file | pages | quality | ingested |
|---|---|---|---|---|---|---|---|
| _example_ `arshad-1402-zaban` | arshad | 1402 | زبان انگلیسی | `arshad-1402-zaban.pdf` | 12 | scan, poor OCR | no |

**quality** is a warning to the ingest operation: `clean text`, `scan, good`, `scan, poor OCR`,
`photo`. Poor sources get flagged uncertainties rather than confident guesses.
