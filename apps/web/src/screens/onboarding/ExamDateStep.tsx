/**
 * Exam-date step (`what.md` §5.5, §7.8): Jalali, skippable, three `<select>`s rather than a
 * typed field — onboarding has no keyboard context to lean on the way Settings' text input does.
 * Built with `date-fns-jalali`, the same library Settings uses, so a year like ۱۴۰۵ round-trips
 * the same way in both places.
 */

import { format, isValid, parse } from 'date-fns-jalali';
import { useState } from 'react';
import { now } from '../../engine/clock.ts';
import { strings } from '../../strings.ts';
import { faNumber } from '../../ui/format.ts';

const JALALI_FORMAT = 'yyyy/MM/dd';
const YEAR_RANGE = 6;
const SELECT_CLASS =
  'min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-body outline-none focus-visible:border-[var(--fg)]';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function currentJalaliYear(): number {
  return Number(format(new Date(now()), 'yyyy'));
}

function partsOf(examDate: number | null): { year: string; month: string; day: string } {
  if (examDate === null) return { year: '', month: '', day: '' };
  const text = format(new Date(examDate), JALALI_FORMAT);
  const [year = '', month = '', day = ''] = text.split('/');
  return { year, month, day };
}

export interface ExamDateStepProps {
  readonly examDate: number | null;
  readonly onChange: (examDate: number | null) => void;
}

export function ExamDateStep({ examDate, onChange }: ExamDateStepProps) {
  const initial = partsOf(examDate);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  const startYear = currentJalaliYear();
  const years = Array.from({ length: YEAR_RANGE }, (_, i) => startYear + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  function commit(nextYear: string, nextMonth: string, nextDay: string): void {
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(nextDay);

    if (nextYear === '' || nextMonth === '' || nextDay === '') {
      onChange(null);
      return;
    }

    const parsed = parse(`${nextYear}/${nextMonth}/${nextDay}`, JALALI_FORMAT, new Date());
    onChange(isValid(parsed) ? parsed.getTime() : null);
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h1 className="text-h5 font-medium">{strings.onboarding.examDateTitle}</h1>
      <div className="flex gap-2" dir="ltr">
        <select
          aria-label={strings.onboarding.examDateDayLabel}
          className={SELECT_CLASS}
          value={day}
          onChange={(event) => commit(year, month, event.target.value)}
        >
          <option value="">{strings.onboarding.examDateDay}</option>
          {days.map((d) => (
            <option key={d} value={pad2(d)}>
              {faNumber(d)}
            </option>
          ))}
        </select>
        <select
          aria-label={strings.onboarding.examDateMonthLabel}
          className={SELECT_CLASS}
          value={month}
          onChange={(event) => commit(year, event.target.value, day)}
        >
          <option value="">{strings.onboarding.examDateMonth}</option>
          {months.map((m) => (
            <option key={m} value={pad2(m)}>
              {faNumber(m)}
            </option>
          ))}
        </select>
        <select
          aria-label={strings.onboarding.examDateYearLabel}
          className={SELECT_CLASS}
          value={year}
          onChange={(event) => commit(event.target.value, month, day)}
        >
          <option value="">{strings.onboarding.examDateYear}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {faNumber(y)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
