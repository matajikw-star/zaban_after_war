# 01 — Wrong lemmas found during the word-data pass

Status: open — collecting
Type: report

Word ids are frozen forever (constitution rule 6, `CLAUDE.md` → "Word ids").
A wrong lemma is **reported here, never renamed**: renaming orphans every user's
progress for that word. This file is the running collection point for the pass;
generating agents surface them and they land here rather than in a chat reply.

The fix, when there is one, is a product decision — a display override or an
alias, not a rename.

## Found

| id | should be | found by | note |
|---|---|---|---|
| `burgeoning` | `burgeon` | batch-06 | The id is the `-ing` form. It is only ever tested as an adjective ("a burgeoning industry"), so the entry is written for the adjective and the card is not wrong — just narrower than the lemma should be. |
| `histrionic` | — | pre-existing | Not a wrong lemma. Its `surfaceForms` carries `histroinic`, a typo **in the exam paper**, transcribed verbatim as ingest rule 1 requires. The lemma is right; leave both alone. |

| `impromptu` | — | batch-13 | Not a wrong lemma. `surfaceForms` carries `impromptuj`, a typo **in the exam paper** (`arshad-1398-p05` q12), transcribed verbatim like `histroinic`. The lemma is right; leave it. |
| `non-sequitur` | — | batch-14 | Not wrong. The id is hyphenated and the lemma is `non sequitur` with a space, which is correct for a multiword entry. |

| `petitio-principia` | `petitio-principii` | batch-20 area | The fallacy is *petitio principii*. `arshad-1405-p05` q23 printed `principia` and it was transcribed verbatim per ingest rule 1, so the id is frozen on the exam's misspelling. See `04-non-words-and-latin-phrases.md`. |

## Not a lemma problem, but adjacent

- **18 surface forms are claimed by two ids each**, because the lemmatiser
  split the same word across twin papers — `mislead`/`misleading`,
  `strict`/`strictly`, and 16 more. That is not a wrong lemma; it is one word
  with two entries, and it has its own ticket:
  `.scratch/word-data/issues/02-lemmatiser-split-twin-papers.md`.
- `meager` is the US spelling and carries a British IPA `/ˈmiːɡə(r)/`. Both
  spellings are current; the id is whichever the exam printed. No action unless
  the owner wants spelling normalised, which would be a rename.
