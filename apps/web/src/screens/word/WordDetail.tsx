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
import { cachedEvents } from '../../engine/fold-cache.ts';
import { recordReview } from '../../engine/index.ts';
import { useFold } from '../../engine/use-fold.ts';
import { breadcrumb } from '../../log/breadcrumbs.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, CardBody, CardTitle } from '../../ui/Card.tsx';
import { Disclosure } from '../../ui/Disclosure.tsx';
import { faNumber } from '../../ui/format.ts';
import { SheetClose, SheetContent, SheetRoot, SheetTrigger } from '../../ui/Sheet.tsx';
import { BOTTOM_NAV_SPACER_CLASS } from '../layout/BottomNav.tsx';

const FLAG_REASONS: readonly string[] = [
  strings.word.flagReasonWrongTranslation,
  strings.word.flagReasonBadExample,
  strings.word.flagReasonOther,
];

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

  async function submit(reason: string): Promise<void> {
    await outboxEnqueue('flag', { itemId, reason, at: now() });
    breadcrumb('tap', 'word.flag', { itemId, reason });
    setSent(true);
  }

  return (
    <SheetContent title={strings.word.flagTitle}>
      {sent ? (
        <p className="text-body-sm text-[var(--fg-muted)]">{strings.word.flagSent}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {FLAG_REASONS.map((reason) => (
            <Button key={reason} variant="secondary" block onClick={() => void submit(reason)}>
              {reason}
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
    <main className={`flex flex-1 flex-col gap-4 pt-4 ${BOTTOM_NAV_SPACER_CLASS}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          aria-label={strings.word.back}
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] hover:bg-[var(--border)]"
        >
          <ChevronRight aria-hidden="true" />
        </button>
        <h1 className="text-h4 font-medium" dir="ltr">
          {card.lemma}
        </h1>
      </div>

      {card.senses.map((sense) => (
        <Card key={`${sense.pos}:${sense.definition}`}>
          <CardTitle>
            {sense.pos}
            {sense.ipa === null ? null : (
              <span className="ms-2 text-body-sm font-normal text-[var(--fg-muted)]" dir="ltr">
                {sense.ipa}
              </span>
            )}
          </CardTitle>
          <CardBody className="flex flex-col gap-2 pt-2">
            <p className="text-body text-[var(--fg)]">{sense.translations.join('، ')}</p>
            <p>{sense.definition}</p>
            {sense.examples.map((example) => (
              <div key={example.en} className="flex flex-col gap-0.5">
                <p dir="ltr">{example.en}</p>
                <p>{example.fa}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      {card.confusables.length === 0 ? null : (
        <Disclosure label={strings.word.confusablesTitle}>
          <ul className="flex flex-col gap-1">
            {card.confusables.map((confusable) => (
              <li key={confusable.word}>
                <span dir="ltr" className="font-medium text-[var(--fg)]">
                  {confusable.word}
                </span>
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
            <p dir="ltr">
              {strings.word.examYears(card.exam.years.map((y) => faNumber(y)).join('، '))}
            </p>
          </div>
        )}
      </Disclosure>

      <div className="flex flex-col gap-1">
        <h2 className="text-body-sm font-medium">{strings.word.historyTitle}</h2>
        <ReviewTimeline itemId={card.id} />
      </div>

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
