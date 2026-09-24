/**
 * The two grading buttons (`what.md` §7.8, §7.9, ADR-0020).
 *
 * The only colour in the app lives here: green «بلد بودم», red «بلد نبودم». Fixed to the bottom
 * edge inside the layout's 430 px column, both ≥ 56 px tall (`size="lg"`), with the safe-area
 * inset added to the bar's own padding so a gesture-navigation phone does not eat a tap.
 */

import type { Grade } from '@kl/core';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';

export interface GradeBarProps {
  readonly onGrade: (grade: Grade) => void;
  readonly disabled: boolean;
}

export function GradeBar({ onGrade, disabled }: GradeBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="glass flex w-full max-w-[430px] gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="danger"
          size="lg"
          block
          disabled={disabled}
          onClick={() => onGrade(0)}
          data-testid="grade-forgot"
        >
          {strings.review.gradeForgot}
        </Button>
        <Button
          variant="success"
          size="lg"
          block
          disabled={disabled}
          onClick={() => onGrade(1)}
          data-testid="grade-knew"
        >
          {strings.review.gradeKnew}
        </Button>
      </div>
    </div>
  );
}
