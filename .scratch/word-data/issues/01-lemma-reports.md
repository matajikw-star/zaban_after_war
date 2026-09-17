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

## Not a lemma problem, but adjacent

- `meager` is the US spelling and carries a British IPA `/ˈmiːɡə(r)/`. Both
  spellings are current; the id is whichever the exam printed. No action unless
  the owner wants spelling normalised, which would be a rename.
