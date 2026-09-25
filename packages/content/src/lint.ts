#!/usr/bin/env node
/**
 * The `lint` operation over `content/`. Checklist: `docs/plan/content-pipeline.md` → "Lint
 * checklist". Implements the blocking checks 1–5 and warnings 6, 10, 11, 12, 14, and the
 * duplicate-paper checks 15–18 (`./duplicates.ts`, ADR-0021); the rest of the checklist
 * (7, 8, 9, 13) needs judgement this script cannot make and stays a manual `query`.
 *
 * Fixes nothing — a lint that auto-repairs hides the extraction problems this pipeline exists
 * to surface (`docs/plan/content-pipeline.md`). Exits 1 only when a blocking finding exists.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FREE_SIZE } from './build/build.ts';
import { isShippable } from './build/card.ts';
import { assignRanks } from './build/rank.ts';
import type { ExamFile, ExamQuestion, HintFile, LexiconEntry } from './build/raw.ts';
import { duplicatePaperFindings, retiredOccurrenceFindings } from './duplicates.ts';

type Severity = 'blocking' | 'warning';

interface Finding {
  readonly severity: Severity;
  readonly check: string;
  readonly file: string;
  readonly message: string;
}

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONTENT_DIR = path.join(ROOT, 'content');
const CONFIG_DIR = path.join(ROOT, 'packages/content');

async function readJsonDir<T>(dir: string): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw error;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const raw = await readFile(path.join(dir, name), 'utf8');
    out.set(name.slice(0, -'.json'.length), JSON.parse(raw) as T);
  }
  return out;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Hand-rolled schema check (check 5) — required fields present with the right types. */
function validateExamFile(fileName: string, data: unknown): string[] {
  const problems: string[] = [];
  if (typeof data !== 'object' || data === null) {
    return [`${fileName}: not a JSON object`];
  }
  const d = data as Record<string, unknown>;

  if (!isString(d.paperId)) problems.push('paperId missing or not a string');
  if (!isString(d.degree)) problems.push('degree missing or not a string');
  if (!isNumber(d.year)) problems.push('year missing or not a number');
  if (d.duplicateOf !== undefined && !isString(d.duplicateOf))
    problems.push('duplicateOf must be a paper id string when present');
  if (!Array.isArray(d.questions)) {
    problems.push('questions missing or not an array');
    return problems;
  }

  d.questions.forEach((raw, index) => {
    const where = `question[${index}]`;
    if (typeof raw !== 'object' || raw === null) {
      problems.push(`${where}: not an object`);
      return;
    }
    const q = raw as Record<string, unknown>;
    if (!isNumber(q.no)) problems.push(`${where}: "no" missing or not a number`);
    if (!isString(q.part)) problems.push(`${where}: "part" missing or not a string`);
    if (!isString(q.stem) || q.stem.length === 0)
      problems.push(`${where}: "stem" missing or empty`);
    if (!Array.isArray(q.options) || q.options.length === 0 || !q.options.every(isString)) {
      problems.push(`${where}: "options" missing or not an array of strings`);
    }
    if (q.key !== null && !isNumber(q.key))
      problems.push(`${where}: "key" must be a number or null`);
    if (q.testedWord !== null && !isString(q.testedWord)) {
      problems.push(`${where}: "testedWord" must be a string or null`);
    }
  });

  return problems;
}

function slugify(word: string): string {
  return word.toLowerCase().trim().replace(/\s+/g, '-');
}

function normalizeLemma(lemma: string): string {
  return lemma.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** For check 14: the stem with its blank filled by the occurrence's surface form, normalized. */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main(): Promise<Finding[]> {
  const findings: Finding[] = [];

  const lexiconFiles = await readJsonDir<LexiconEntry>(path.join(CONTENT_DIR, 'lexicon'));
  const examFiles = await readJsonDir<ExamFile>(path.join(CONTENT_DIR, 'exams'));
  const hintFiles = await readJsonDir<HintFile>(path.join(CONTENT_DIR, 'hints'));
  const exclusionsFile = await readJsonFile<{ ids: readonly string[] }>(
    path.join(CONFIG_DIR, 'exclusions.json'),
    { ids: [] },
  );
  const existingRanks = await readJsonFile<Record<string, number>>(
    path.join(CONFIG_DIR, 'ranks.json'),
    {},
  );

  const examsById = new Map<string, { fileName: string; exam: ExamFile }>();
  for (const [fileName, exam] of examFiles) examsById.set(exam.paperId, { fileName, exam });

  // --- Check 1 (blocking): every vocabulary/cloze testedWord resolves to a lexicon file. ---
  // Scoped to vocabulary and cloze: `grammar`-part questions test structure (prepositions,
  // verb forms), not a memorizable word, and CLAUDE.md rule 5 keeps grammar out of the lexicon
  // on purpose — its `testedWord` is a label, not a lexicon candidate.
  for (const [fileName, exam] of examFiles) {
    for (const q of exam.questions) {
      if (q.testedWord === null) continue;
      if (q.part === 'grammar') continue;
      const id = slugify(q.testedWord);
      if (!lexiconFiles.has(id)) {
        findings.push({
          severity: 'blocking',
          check: '1',
          file: `content/exams/${fileName}.json`,
          message: `question ${q.no} (${q.part}): testedWord "${q.testedWord}" has no content/lexicon/${id}.json`,
        });
      }
    }
  }

  // --- Check 2 (blocking): every occurrences[] entry points to a real exam and question. ---
  for (const [fileName, entry] of lexiconFiles) {
    for (const occ of entry.occurrences) {
      const found = examsById.get(occ.paperId);
      if (!found) {
        findings.push({
          severity: 'blocking',
          check: '2',
          file: `content/lexicon/${fileName}.json`,
          message: `occurrence points to unknown paper "${occ.paperId}"`,
        });
        continue;
      }
      if (!found.exam.questions.some((q) => q.no === occ.questionNo)) {
        findings.push({
          severity: 'blocking',
          check: '2',
          file: `content/lexicon/${fileName}.json`,
          message: `occurrence points to unknown question ${occ.paperId}#${occ.questionNo}`,
        });
      }
    }
  }

  // --- Check 3 (blocking): no duplicate ids; no two files whose lemmas differ only by case
  // or whitespace. ---
  const byLemma = new Map<string, string[]>();
  for (const [fileName, entry] of lexiconFiles) {
    if (entry.id !== fileName) {
      findings.push({
        severity: 'blocking',
        check: '3',
        file: `content/lexicon/${fileName}.json`,
        message: `internal id "${entry.id}" does not match its filename`,
      });
    }
    const key = normalizeLemma(entry.lemma);
    const ids = byLemma.get(key) ?? [];
    ids.push(entry.id);
    byLemma.set(key, ids);
  }
  for (const [lemma, ids] of byLemma) {
    if (new Set(ids).size > 1) {
      findings.push({
        severity: 'blocking',
        check: '3',
        file: ids.map((id) => `content/lexicon/${id}.json`).join(', '),
        message: `lemma "${lemma}" is split across ids that differ only by case or whitespace: ${ids.join(', ')}`,
      });
    }
  }

  // --- Check 4 (blocking): a lexicon entry has at least one occurrence, and once word data
  // has been written (`senses` is how `extraction/WORD-DATA.md` tracks that), at least one
  // sense with at least one translation and one example. A word still awaiting word data
  // (empty `senses`, `provenance: null`) is incomplete by design, not a lint defect.
  for (const [fileName, entry] of lexiconFiles) {
    // A retired id (ADR-0021) is the opposite: it must have no occurrences and never ships.
    if (entry.retired !== undefined) {
      if (entry.occurrences.length > 0 || !entry.retired.reason || !entry.retired.date) {
        findings.push({
          severity: 'blocking',
          check: '4',
          file: `content/lexicon/${fileName}.json`,
          message:
            'retired, but still has occurrences or lacks retired.reason/date — a retired id counts nothing',
        });
      }
      continue;
    }
    if (entry.occurrences.length === 0) {
      findings.push({
        severity: 'blocking',
        check: '4',
        file: `content/lexicon/${fileName}.json`,
        message: 'no occurrences[] — a lexicon entry must point at a real extracted question',
      });
    }
    if (entry.senses.length === 0) continue;
    entry.senses.forEach((sense, index) => {
      if (!sense.translations || sense.translations.length === 0) {
        findings.push({
          severity: 'blocking',
          check: '4',
          file: `content/lexicon/${fileName}.json`,
          message: `senses[${index}] has no translations`,
        });
      }
      if (!sense.examples || sense.examples.length === 0) {
        findings.push({
          severity: 'blocking',
          check: '4',
          file: `content/lexicon/${fileName}.json`,
          message: `senses[${index}] has no examples`,
        });
      }
    });
  }

  // --- Check 5 (blocking): every exam JSON validates against the schema. ---
  for (const [fileName, exam] of examFiles) {
    const problems = validateExamFile(fileName, exam);
    for (const problem of problems) {
      findings.push({
        severity: 'blocking',
        check: '5',
        file: `content/exams/${fileName}.json`,
        message: problem,
      });
    }
  }

  // --- Check 6 (warning): a free-150 word without an approved hint. Scoped to the free
  // boundary — `content/hints/` is empty today, so a blanket "every shipping word needs a
  // hint" warning would just repeat 893 times. See ticket 01-package-builder.md "Also". ---
  const exclusions = new Set(exclusionsFile.ids);
  const shippable = [...lexiconFiles.values()].filter((entry) => isShippable(entry, exclusions));
  const ranks = assignRanks(
    existingRanks,
    shippable.map((entry) => ({
      id: entry.id,
      priority: entry.stats.priority,
      timesTested: entry.stats.timesTested,
      firstYear: entry.stats.firstYear,
    })),
  );
  const freeIds = shippable
    .slice()
    .sort((a, b) => (ranks[a.id] ?? 0) - (ranks[b.id] ?? 0))
    .slice(0, FREE_SIZE)
    .map((entry) => entry.id);
  for (const id of freeIds) {
    const hint = hintFiles.get(id);
    if (hint?.status !== 'approved') {
      findings.push({
        severity: 'warning',
        check: '6',
        file: `content/hints/${id}.json`,
        message: hint
          ? 'hint exists but is not approved'
          : 'no hint file, and this word ships free',
      });
    }
  }

  // --- Check 10 (warning): exam questions whose testedWord is null. ---
  for (const [fileName, exam] of examFiles) {
    for (const q of exam.questions) {
      if (q.testedWord === null) {
        findings.push({
          severity: 'warning',
          check: '10',
          file: `content/exams/${fileName}.json`,
          message: `question ${q.no} (${q.part}): testedWord is null`,
        });
      }
    }
  }

  // --- Check 11 (warning): context-only entries — every occurrence is "context". ---
  for (const [fileName, entry] of lexiconFiles) {
    if (
      entry.occurrences.length > 0 &&
      entry.occurrences.every((o) => o.occurrenceType === 'context')
    ) {
      findings.push({
        severity: 'warning',
        check: '11',
        file: `content/lexicon/${fileName}.json`,
        message: 'context-only: every occurrence is "context" — never counted as exam frequency',
      });
    }
  }

  // --- Check 12 (warning): a context occurrence carrying optionIndex or isAnswer. ---
  for (const [fileName, entry] of lexiconFiles) {
    entry.occurrences.forEach((occ, index) => {
      if (occ.occurrenceType !== 'context') return;
      const raw = occ as unknown as Record<string, unknown>;
      if ('optionIndex' in raw || 'isAnswer' in raw) {
        findings.push({
          severity: 'warning',
          check: '12',
          file: `content/lexicon/${fileName}.json`,
          message: `occurrences[${index}] is "context" but carries optionIndex/isAnswer`,
        });
      }
    });
  }

  // --- Check 14 (warning): an authored example reproduces the stem of one of the entry's own
  // occurrences (the exam sentence is joined at build time and must never be duplicated). An
  // occurrence's stem, blank filled with its `surface`, is compared to each example verbatim
  // after normalizing case, punctuation and whitespace. ---
  for (const [fileName, entry] of lexiconFiles) {
    if (entry.senses.length === 0) continue;
    const stemTexts: string[] = [];
    for (const occ of entry.occurrences) {
      if (occ.occurrenceType !== 'tested') continue;
      const found = examsById.get(occ.paperId);
      const question = found?.exam.questions.find((q: ExamQuestion) => q.no === occ.questionNo);
      if (!question) continue;
      const filled = question.stem.replace(/\.{2,}|-{2,}/, occ.surface);
      stemTexts.push(normalizeForComparison(filled));
    }
    if (stemTexts.length === 0) continue;
    entry.senses.forEach((sense, senseIndex) => {
      sense.examples.forEach((example, exampleIndex) => {
        const normalizedExample = normalizeForComparison(example.en);
        if (stemTexts.includes(normalizedExample)) {
          findings.push({
            severity: 'warning',
            check: '14',
            file: `content/lexicon/${fileName}.json`,
            message: `senses[${senseIndex}].examples[${exampleIndex}].en reproduces one of its own occurrences' exam stem`,
          });
        }
      });
    });
  }

  // --- Checks 15–18: duplicate papers (ADR-0021). 15 (blocking): two live papers of a year
  // share more than MAX_SHARED_STEMS stems. 16 (blocking): a duplicateOf claim that does not
  // hold. 17 (warning): a retired question whose options differ from its kept counterpart.
  // 18: an occurrence on a retired paper — blocking when the word ships. ---
  const exams = [...examFiles.values()];
  findings.push(...duplicatePaperFindings(exams));
  findings.push(
    ...retiredOccurrenceFindings(
      [...lexiconFiles.values()],
      exams,
      new Set(shippable.map((entry) => entry.id)),
    ),
  );

  return findings;
}

function report(findings: readonly Finding[]): void {
  const blocking = findings.filter((f) => f.severity === 'blocking');
  const warnings = findings.filter((f) => f.severity === 'warning');

  const bySeverity = (list: readonly Finding[], label: string) => {
    if (list.length === 0) {
      console.log(`${label}: none`);
      return;
    }
    console.log(`${label}: ${list.length}`);
    const byCheck = new Map<string, Finding[]>();
    for (const f of list) {
      const bucket = byCheck.get(f.check) ?? [];
      bucket.push(f);
      byCheck.set(f.check, bucket);
    }
    for (const [check, items] of [...byCheck.entries()].sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    )) {
      console.log(`  check ${check} — ${items.length}`);
      for (const item of items) {
        console.log(`    ${item.file}: ${item.message}`);
      }
    }
  };

  bySeverity(blocking, 'Blocking');
  bySeverity(warnings, 'Warnings');
}

main()
  .then((findings) => {
    report(findings);
    const blockingCount = findings.filter((f) => f.severity === 'blocking').length;
    if (blockingCount > 0) {
      console.log(
        `\ncontent:lint — ${blockingCount} blocking finding(s), ${findings.length - blockingCount} warning(s).`,
      );
      process.exit(1);
    }
    console.log(`\ncontent:lint — clean run, ${findings.length} warning(s).`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
