/**
 * The three intro slides (`what.md` §7.8 onboarding row): what the app is, the exam-frequency
 * claim, Leitner in one picture. `Onboarding.tsx` owns the footer (back/next); this file only
 * renders each slide's own content.
 */

import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { faNumber } from '../../ui/format.ts';
import type { OnboardingStep } from './steps.ts';

const DIAGRAM_WIDTH = 300;
const DIAGRAM_HEIGHT = 84;
const DIAGRAM_GAP = 8;

/** Five boxes, growing — the picture behind «هر واژه در یکی از پنج جعبه جا می‌گیرد». Monochrome
 *  (ADR-0020): opacity carries the "further along" idea instead of colour. Box 1 is on the right,
 *  where a right-to-left reader starts. */
function LeitnerDiagram() {
  const boxes = [1, 2, 3, 4, 5].map((box, i) => ({
    box,
    width: 34 + i * 8,
    height: 36 + i * 10,
    opacity: 0.4 + i * 0.15,
  }));
  // Centred: the row's own width, then half the slack on either side.
  const rowWidth =
    boxes.reduce((sum, { width }) => sum + width, 0) + DIAGRAM_GAP * (boxes.length - 1);
  let right = (DIAGRAM_WIDTH + rowWidth) / 2;
  return (
    <svg
      viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
      role="img"
      aria-label={strings.onboarding.slide3Title}
      className="h-24 w-full max-w-xs"
    >
      {boxes.map(({ box, width, height, opacity }) => {
        const x = right - width;
        right = x - DIAGRAM_GAP;
        const y = DIAGRAM_HEIGHT - height - 1;
        return (
          <g key={box} opacity={opacity}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={10}
              fill="none"
              stroke="var(--fg)"
              strokeWidth={2}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--fg)"
              fontSize={14}
            >
              {faNumber(box)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const SLIDES = ['slide-1', 'slide-2', 'slide-3'] as const;

/** Which of the three slides this is, as three dots — shape only, no colour. */
function SlideDots({ step }: { readonly step: (typeof SLIDES)[number] }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {SLIDES.map((slide) => (
        <span
          key={slide}
          className={
            slide === step
              ? 'h-1.5 w-5 rounded-[var(--radius-pill)] bg-[var(--fg)]'
              : 'h-1.5 w-1.5 rounded-[var(--radius-pill)] bg-[var(--border)]'
          }
        />
      ))}
    </div>
  );
}

export interface SlidesProps {
  readonly step: Extract<OnboardingStep, 'slide-1' | 'slide-2' | 'slide-3'>;
  readonly onHaveAccount: () => void;
}

export function Slides({ step, onHaveAccount }: SlidesProps) {
  const content =
    step === 'slide-1'
      ? { title: strings.onboarding.slide1Title, body: strings.onboarding.slide1Body }
      : step === 'slide-2'
        ? { title: strings.onboarding.slide2Title, body: strings.onboarding.slide2Body }
        : { title: strings.onboarding.slide3Title, body: strings.onboarding.slide3Body };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      {step === 'slide-3' ? <LeitnerDiagram /> : null}
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-h4 font-medium">{content.title}</h1>
        <p className="max-w-sm text-body text-[var(--fg-muted)]">{content.body}</p>
      </div>
      <SlideDots step={step} />
      {step === 'slide-1' ? (
        <Button variant="ghost" size="sm" onClick={onHaveAccount}>
          {strings.onboarding.haveAccount}
        </Button>
      ) : null}
    </div>
  );
}
