/**
 * The full word card plus its history (`what.md` §7.8).
 *
 * A ground-up view, not a reuse of the review card: the review agent owns `screens/review/**`
 * and its card is built for the front/back reveal flow, while this screen shows everything at
 * once — translations, every sense, confusables, exam history and a review timeline — with two
 * actions, «این را بلدم» and the flag sheet.
 */

import type { WordCard } from '@kl/content';
import type { ItemId } from '@kl/core';
import { ChevronRight, Flag } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { outboxEnqueue } from '../../db/repo.ts';
import { now } from '../../engine/clock.ts';
import { buildFlagBody } from '../../engine/flag-body.ts';
import { cachedEvents } from '../../engine/fold-cache.ts';
import { recordReview } from '../../engine/index.ts';
import { useFold } from '../../engine/use-fold.ts';
import { breadcrumb } from '../../log/breadcrumbs.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, CardBody, CardTitle } from '../../ui/Card.tsx';
import { Disclosure } from '../../ui/Disclosure.tsx';
import { faNumber, faYear } from '../../ui/format.ts';
import { SheetClose, SheetContent, SheetRoot, SheetTrigger } from '../../ui/Sheet.tsx';
import { APP_VERSION } from '../../version.ts';
import { FLAG_REASONS } from '../review/FlagSheet.tsx';

function ReviewTimeline({ itemId }: { readonly itemId: ItemId }) {
  useFold();
  const events = cachedEvents()
    .filter((event) => event.itemId === itemId)
    .slice()
    .sort((a, b) => a.at - b.at);

  if (events.length === 0) {
    return <p className="text-body-sm text-[var(--fg-muted)]">{strings.word.noHistory}</p>;
  }

  return (
    <div className="relative flex items-center overflow-x-auto py-2">
      <div className="absolute inset-x-0 h-px bg-[var(--border)]" aria-hidden="true" />
      <ul
        className="relative flex list-none items-center gap-1"
        aria-label={strings.word.historyTitle}
      >
        {events.map((event) => (
          <li
            key={event.id}
            title={new Date(event.at).toISOString()}
            className={
              event.grade === 1
                ? 'h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--fg)]'
                : 'h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--fg)] bg-transparent'
            }
          />
        ))}
      </ul>
    </div>
  );
}

function FlagSheet({ itemId }: { readonly itemId: ItemId }) {
  const [sent, setSent] = useState(false);

  async function submit(reason: (typeof FLAG_REASONS)[number]['reason']): Promise<void> {
    const body = buildFlagBody(itemId, reason, {
      installId: useAuthStore.getState().installId,
      appVersion: APP_VERSION,
      at: now(),
    });
    await outboxEnqueue('flag', body);
    breadcrumb('tap', 'word.flag', { itemId, reason });
    setSent(true);
  }

  return (
    <SheetContent title={strings.word.flagTitle}>
      {sent ? (
        <p className="text-body-sm text-[var(--fg-muted)]">{strings.word.flagSent}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {FLAG_REASONS.map(({ reason, label }) => (
            <Button key={reason} variant="secondary" block onClick={() => void submit(reason)}>
              {label}
            </Button>
          ))}
        </div>
      )}
      {sent ? (
        <SheetClose asChild>
          <Button variant="ghost" block className="mt-3">
            {strings.word.back}
          </Button>
        </SheetClose>
      ) : null}
    </SheetContent>
  );
}

export function WordDetail({ card }: { readonly card: WordCard }) {
  const navigate = useNavigate();

  async function knowIt(): Promise<void> {
    await recordReview(card.id, 'know', 1);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          aria-label={strings.word.back}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] outline-none transition-colors duration-[var(--motion-fast)] hover:bg-[var(--bg-muted)] focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
        <h1 className="min-w-0 text-h4 font-medium tracking-tight break-words" dir="ltr" lang="en">
          {card.lemma}
        </h1>
      </div>

      {card.senses.map((sense) => (
        <Card key={`${sense.pos}:${sense.definition}`}>
          {/* Part of speech and IPA are both Latin: one left-to-right line, each isolated. */}
          <CardTitle dir="ltr" className="flex flex-wrap items-baseline gap-x-2 text-start">
            <span className="text-subtitle-sm font-medium text-[var(--fg-muted)]">{sense.pos}</span>
            {sense.ipa === null ? null : (
              <span className="text-body-sm font-normal text-[var(--fg-muted)]">{sense.ipa}</span>
            )}
          </CardTitle>
          <CardBody className="flex flex-col gap-3 pt-2">
            <p className="text-h6 font-medium text-[var(--fg)]">
              {sense.translations.join(strings.format.listSeparator)}
            </p>
            <p dir="ltr" lang="en">
              {sense.definition}
            </p>
            {sense.examples.map((example) => (
              <div
                key={example.en}
                className="flex flex-col gap-1 rounded-[var(--radius-control)] bg-[var(--bg-muted)] p-3"
              >
                <p dir="ltr" lang="en" className="text-body text-[var(--fg)]">
                  {example.en}
                </p>
                <p>{example.fa}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      <Card className="flex flex-col gap-1 p-2">
        {card.confusables.length === 0 ? null : (
          <Disclosure label={strings.word.confusablesTitle}>
            <ul className="flex flex-col gap-1">
              {card.confusables.map((confusable) => (
                <li key={confusable.word}>
                  <bdi dir="ltr" lang="en" className="font-medium text-[var(--fg)]">
                    {confusable.word}
                  </bdi>
                  {' — '}
                  {confusable.note}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}

        <Disclosure label={strings.word.examTitle} defaultOpen>
          {card.exam.timesTested === 0 ? (
            <p>{strings.word.noExam}</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p>{strings.word.examTimesTested(faNumber(card.exam.timesTested))}</p>
              <p>
                {strings.word.examYears(
                  card.exam.years.map((y) => faYear(y)).join(strings.format.listSeparator),
                )}
              </p>
            </div>
          )}
        </Disclosure>

        <div className="flex flex-col gap-1 px-3 pt-2 pb-1">
          <h2 className="text-subtitle-sm font-medium">{strings.word.historyTitle}</h2>
          <ReviewTimeline itemId={card.id} />
        </div>
      </Card>

      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="secondary" block onClick={() => void knowIt()}>
          {strings.word.know}
        </Button>
        <SheetRoot>
          <SheetTrigger asChild>
            <Button variant="ghost" size="md">
              <Flag size={18} aria-hidden="true" />
              {strings.word.flag}
            </Button>
          </SheetTrigger>
          <FlagSheet itemId={card.id} />
        </SheetRoot>
      </div>
    </main>
  );
}
