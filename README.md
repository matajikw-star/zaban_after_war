# Konkour Leitner

An offline-first Persian PWA for memorising the English vocabulary that actually appears in the
Iranian MA and PhD entrance exams (کنکور ارشد و دکتری), using spaced repetition.

`konkourleitner.com`

## Status

Planning. No application code yet — the repo currently holds the project's schema, decisions and
plan. See [`docs/plan/roadmap.md`](docs/plan/roadmap.md) for what gets built and in what order.

## Where things are

| Path | What |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The schema: conventions, operations, and the project constitution. Read first. |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary. |
| [`sources/`](sources/) | Raw exam papers. Immutable inputs. |
| [`content/`](content/) | The lexicon: exams, words, hints. The business asset. |
| [`docs/adr/`](docs/adr/) | Architecture decisions and their reasoning. |
| [`docs/plan/`](docs/plan/) | Roadmap, infrastructure, content pipeline, repo setup. |
| [`docs/postmortem-v1.md`](docs/postmortem-v1.md) | What the previous build got wrong. |
| [`wiki/`](wiki/) | Index and append-only log of what the project knows. |

## Working on this

The project is built by its owner together with Claude Code. `CLAUDE.md` defines three named
operations — `ingest`, `query`, `lint` — and the rules that every change follows.
