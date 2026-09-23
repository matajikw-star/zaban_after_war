/**
 * The back of the review card (`what.md` §7.8).
 *
 * Three tiers, in this order and no other: what the user needs to grade themselves
 * (translations, one sentence), what they may want («بیشتر»), and the hint («راهنمای یادگیری»,
 * collapsed, §7.9). Both disclosures are collapsed by default so the answer is never buried and
 * never padded.
 *
 * Every content rule — which sentence, which sense first, how the blank is filled — is decided
 * in `engine/card-content.ts`; this file only lays it out.
 */

import type { WordCard } from '@kl/content';
import type { ReactNode } from 'react';
import {
  examBadge,
  examBadgeText,
  orderedSenses,
  primarySentence,
  type SentencePart,
} from '../../engine/card-content.ts';
import { strings } from '../../strings.ts';
import { Chip } from '../../ui/Chip.tsx';
import { Disclosure } from '../../ui/Disclosure.tsx';
import { faNumber, faYear } from '../../ui/format.ts';

export interface CardBackProps {
  readonly card: WordCard;
}

/** The blank, drawn as an underlined gap with the word sitting in it. */
function Gap({ word }: { readonly word: string | null }) {
  return (
    <span className="mx-1 inline-block min-w-16 border-b-2 border-[var(--fg)] text-center font-medium">
      {word ?? ' '}
    </span>
  );
}

function Sentence({ parts }: { readonly parts: readonly SentencePart[] }) {
  return (
    <p dir="ltr" className="text-left text-body leading-relaxed">
      {parts.map((part, index) =>
        part.kind === 'text' ? (
          // The parts of one sentence never reorder, so the index is a stable key.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional by construction
          <span key={index}>{part.text}</span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional by construction
          <Gap key={index} word={part.word} />
        ),
      )}
    </p>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-[var(--fg-muted)]">{label}</span>
      <div className="text-body-sm text-[var(--fg)]">{children}</div>
    </div>
  );
}

export function CardBack({ card }: CardBackProps) {
  const senses = orderedSenses(card);
  const primary = senses[0] ?? null;
  const others = senses.slice(1);
  const sentence = primarySentence(card);
  const badge = examBadge(card);

  return (
    <div className="flex flex-1 flex-col gap-4 py-4" data-testid="review-back">
      <div className="flex flex-col items-center gap-2 text-center">
        <span dir="ltr" className="text-h6 font-medium text-[var(--fg-muted)]">
          {card.lemma}
        </span>
        <h2 className="text-h5 font-medium" data-testid="review-translations">
          {primary === null ? '—' : primary.translations.join('، ')}
        </h2>
        {badge === null ? null : <Chip tone="neutral">{examBadgeText(badge)}</Chip>}
      </div>

      {sentence === null ? null : (
        <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-[var(--bg-elevated)] p-3">
          <Sentence parts={sentence.parts} />
          {sentence.fa === null ? null : (
            <p className="text-body-sm text-[var(--fg-muted)]">{sentence.fa}</p>
          )}
          {sentence.source === 'exam' && sentence.year !== null ? (
            <span className="text-caption text-[var(--fg-muted)]">
              {strings.review.examLastYear} {faYear(sentence.year)}
            </span>
          ) : null}
        </div>
      )}

      <Disclosure label={strings.review.more}>
        <div className="flex flex-col gap-3 pb-1">
          {primary === null ? null : (
            <>
              <Field label={strings.review.definition}>
                <span dir="ltr" className="block text-left">
                  {primary.definition}
                </span>
              </Field>
              {primary.ipa === null ? null : (
                <Field label={strings.review.pronunciation}>
                  <span dir="ltr" className="block text-left">
                    {primary.ipa}
                  </span>
                </Field>
              )}
              {primary.synonyms.length === 0 ? null : (
                <Field label={strings.review.synonyms}>
                  <span dir="ltr" className="block text-left">
                    {primary.synonyms.join(', ')}
                  </span>
                </Field>
              )}
              {primary.antonyms.length === 0 ? null : (
                <Field label={strings.review.antonyms}>
                  <span dir="ltr" className="block text-left">
                    {primary.antonyms.join(', ')}
                  </span>
                </Field>
              )}
            </>
          )}

          {others.length === 0 ? null : (
            <Field label={strings.review.otherSenses}>
              <ul className="flex flex-col gap-1">
                {others.map((sense) => (
                  <li key={`${sense.pos}-${sense.definition}`}>
                    <span dir="ltr">{sense.pos}</span> — {sense.translations.join('، ')}
                  </li>
                ))}
              </ul>
              {card.homograph.suspected ? (
                <p className="mt-1 text-caption text-[var(--fg-muted)]">
                  {card.homograph.note ?? strings.review.homograph}
                </p>
              ) : null}
            </Field>
          )}

          {card.confusables.length === 0 ? null : (
            <Field label={strings.review.confusables}>
              <ul className="flex flex-col gap-1">
                {card.confusables.map((confusable) => (
                  <li key={confusable.word}>
                    <span dir="ltr" className="font-medium">
                      {confusable.word}
                    </span>{' '}
                    — {confusable.note}
                  </li>
                ))}
              </ul>
            </Field>
          )}

          {card.exam.stems.length === 0 ? null : (
            <Field label={strings.review.examHistory}>
              <ul className="flex flex-col gap-1">
                {card.exam.stems.map((stem) => (
                  <li key={`${stem.paperId}-${stem.questionNo}`}>
                    {faYear(stem.year)} — {strings.review.question} {faNumber(stem.questionNo)}
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </div>
      </Disclosure>

      <Disclosure label={strings.review.hintTitle}>
        {card.hint === null ? (
          <p>{strings.review.hintSoon}</p>
        ) : (
          <div className="flex flex-col gap-1 pb-1">
            <Chip tone="neutral" className="self-start">
              {card.hint.template}
            </Chip>
            <p className="text-body-sm text-[var(--fg)]">{card.hint.association}</p>
            <p>{card.hint.sentence}</p>
          </div>
        )}
      </Disclosure>
    </div>
  );
}
