/**
 * `/settings` (`what.md` §7.8, §7.4, §7.5, §7.6, §10.4).
 *
 * Local parts are fully wired: goal, exam date, field, theme, the diagnostic report. Account,
 * backup and download show whatever state the stores already carry — `sync/backup.ts`'s and
 * `sync/download.ts`'s `run()` are stubs until Phase 4/5 (§7.4, §7.5), so the manual backup
 * button calls the real (currently no-op) `run()` rather than faking a result.
 */

import { goalFromMinutes, ONBOARDING_MINUTES } from '@kl/core';
import { format, isValid, parse } from 'date-fns-jalali';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
// `content/` is the repo-root wiki layer (CLAUDE.md), not part of this app: the field names it
// carries are derived data, generated once from the owner's spreadsheet, not app source.
import fieldCodesJson from '../../../../../content/field-codes.json';
import { reportError } from '../../log/errors.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { type ThemeChoice, useSettingsStore } from '../../stores/settings.ts';
import { useSyncStore } from '../../stores/sync.ts';
import { strings } from '../../strings.ts';
import { run as runBackup } from '../../sync/backup.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, CardTitle } from '../../ui/Card.tsx';
import { faNumber, faPercent } from '../../ui/format.ts';
import { Input } from '../../ui/Input.tsx';
import { SheetClose, SheetContent, SheetRoot, SheetTrigger } from '../../ui/Sheet.tsx';
import { Switch } from '../../ui/Switch.tsx';
import { APP_VERSION, BUILD_SHA } from '../../version.ts';
import { InstallSheet } from '../install/InstallSheet.tsx';
import { BOTTOM_NAV_SPACER_CLASS, BottomNav } from '../layout/BottomNav.tsx';

const JALALI_FORMAT = 'yyyy/MM/dd';

const FIELD_CODES: Record<string, string> = (fieldCodesJson as { codes: Record<string, string> })
  .codes;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{title}</CardTitle>
      {children}
    </Card>
  );
}

function backupStatusText(name: string): string {
  switch (name) {
    case 'pushing':
      return strings.settings.backupPushing;
    case 'pulling':
      return strings.settings.backupPulling;
    case 'error':
      return strings.settings.backupError;
    default:
      return strings.settings.backupIdle;
  }
}

function downloadStatusText(name: string, percent: number | null): string {
  switch (name) {
    case 'checking':
      return strings.settings.downloadChecking;
    case 'downloading':
      return strings.settings.downloadProgress(faPercent(percent ?? 0));
    case 'verifying':
      return strings.settings.downloadVerifying;
    case 'installed':
      return strings.settings.downloadInstalled;
    case 'error':
      return strings.settings.downloadError;
    default:
      return strings.settings.downloadNone;
  }
}

function ReportSheet() {
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(): Promise<void> {
    const trimmed = note.trim();
    await reportError(
      'user_report',
      new Error('user_report'),
      undefined,
      trimmed === '' ? undefined : { userNote: trimmed },
    );
    setSent(true);
  }

  return (
    <SheetContent title={strings.settings.reportTitle}>
      {sent ? (
        <p className="text-body-sm text-[var(--fg-muted)]">{strings.settings.reportSent}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={strings.settings.reportNotePlaceholder}
            rows={4}
            className="min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-body outline-none focus-visible:border-[var(--fg)]"
          />
          <Button variant="primary" block onClick={() => void submit()}>
            {strings.settings.reportSubmit}
          </Button>
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

export function Settings() {
  const navigate = useNavigate();
  const phone = useAuthStore((state) => state.phone);
  const profile = useSettingsStore((state) => state.profile);
  const setProfile = useSettingsStore((state) => state.setProfile);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const backup = useSyncStore((state) => state.backup);
  const download = useSyncStore((state) => state.download);
  const lastBackupAt = useSyncStore((state) => state.lastBackupAt);

  const [examDateText, setExamDateText] = useState(() =>
    profile.examDate === null ? '' : format(new Date(profile.examDate), JALALI_FORMAT),
  );

  function commitExamDate(text: string): void {
    setExamDateText(text);
    if (text.trim() === '') {
      void setProfile({ examDate: null });
      return;
    }
    const parsed = parse(text.trim(), JALALI_FORMAT, new Date());
    if (isValid(parsed)) void setProfile({ examDate: parsed.getTime() });
  }

  const downloadPercent = download.name === 'downloading' ? download.percent : null;

  return (
    <main className={`flex flex-1 flex-col gap-4 pt-4 ${BOTTOM_NAV_SPACER_CLASS}`}>
      <h1 className="text-h5 font-medium">{strings.screens.settings}</h1>

      <Section title={strings.settings.accountTitle}>
        {phone === null ? (
          <Button variant="secondary" onClick={() => void navigate('/login')}>
            {strings.settings.accountLoggedOut}
          </Button>
        ) : (
          <p dir="ltr" className="text-body">
            {phone}
          </p>
        )}
      </Section>

      <Section title={strings.settings.goalTitle}>
        <div className="flex flex-wrap gap-2">
          {ONBOARDING_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              variant={profile.minutesPerDay === minutes ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => void setProfile({ minutesPerDay: minutes })}
            >
              {strings.settings.minutesOption(faNumber(minutes))}
            </Button>
          ))}
        </div>
        <p className="text-caption text-[var(--fg-muted)]">
          {strings.settings.dailyGoalCaption(faNumber(goalFromMinutes(profile.minutesPerDay)))}
        </p>
      </Section>

      <Section title={strings.settings.examDateTitle}>
        <Input
          dir="ltr"
          inputMode="numeric"
          placeholder={strings.settings.examDatePlaceholder}
          value={examDateText}
          onChange={(event) => commitExamDate(event.target.value)}
        />
        {profile.examDate === null ? null : (
          <Button variant="ghost" size="sm" onClick={() => commitExamDate('')}>
            {strings.settings.examDateClear}
          </Button>
        )}
      </Section>

      <Section title={strings.settings.fieldTitle}>
        <select
          value={profile.fieldCode ?? ''}
          onChange={(event) =>
            void setProfile({ fieldCode: event.target.value === '' ? null : event.target.value })
          }
          className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-body outline-none focus-visible:border-[var(--fg)]"
        >
          <option value="">{strings.settings.fieldNone}</option>
          {Object.entries(FIELD_CODES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </Section>

      <Section title={strings.settings.themeTitle}>
        <div className="flex gap-4">
          {(
            [
              { choice: 'system', label: strings.settings.themeSystem },
              { choice: 'light', label: strings.settings.themeLight },
              { choice: 'dark', label: strings.settings.themeDark },
            ] as const satisfies readonly { choice: ThemeChoice; label: string }[]
          ).map(({ choice, label }) => (
            <div key={choice} className="flex items-center gap-2 text-body-sm">
              <Switch
                ariaLabel={label}
                checked={theme === choice}
                onCheckedChange={(checked) => {
                  if (checked) void setTheme(choice);
                }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={strings.settings.backupTitle}>
        <p className="text-body-sm text-[var(--fg-muted)]">{backupStatusText(backup.name)}</p>
        <p className="text-caption text-[var(--fg-muted)]">
          {lastBackupAt === null
            ? strings.settings.backupNever
            : new Date(lastBackupAt).toLocaleString('fa-IR')}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void runBackup()}>
          {strings.settings.backupNow}
        </Button>
      </Section>

      <Section title={strings.settings.downloadTitle}>
        <p className="text-body-sm text-[var(--fg-muted)]">
          {downloadStatusText(download.name, downloadPercent)}
        </p>
      </Section>

      <Section title={strings.settings.installTitle}>
        <p className="text-body-sm text-[var(--fg-muted)]">{strings.settings.installComingSoon}</p>
      </Section>

      <Section title={strings.settings.reportTitle}>
        <SheetRoot>
          <SheetTrigger asChild>
            <Button variant="secondary">{strings.settings.reportTitle}</Button>
          </SheetTrigger>
          <ReportSheet />
        </SheetRoot>
      </Section>

      <Section title={strings.settings.aboutTitle}>
        <p className="text-body">{strings.appName}</p>
        <p className="text-caption text-[var(--fg-muted)]" dir="ltr">
          v{APP_VERSION} · {BUILD_SHA}
        </p>
        {import.meta.env.VITE_SUPPORT_URL ? (
          <a
            href={import.meta.env.VITE_SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
            className="text-body-sm underline"
          >
            {strings.settings.supportLink}
          </a>
        ) : null}
      </Section>

      <BottomNav />
    </main>
  );
}
