/**
 * Field-of-study step (`what.md` §7.8): skippable, named codes only — the same
 * `content/field-codes.json` source Settings reads, so the two pickers never drift.
 */

// `content/` is the repo-root wiki layer (CLAUDE.md), not part of this app: the field names it
// carries are derived data, generated once from the owner's spreadsheet, not app source.
import fieldCodesJson from '../../../../../content/field-codes.json';
import { strings } from '../../strings.ts';
import { Select } from '../../ui/Select.tsx';

const FIELD_CODES: Record<string, string> = (fieldCodesJson as { codes: Record<string, string> })
  .codes;

export interface FieldStepProps {
  readonly fieldCode: string | null;
  readonly onChange: (fieldCode: string | null) => void;
}

export function FieldStep({ fieldCode, onChange }: FieldStepProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-5">
      <h1 className="text-center text-h5 font-medium">{strings.onboarding.fieldTitle}</h1>
      <Select
        aria-label={strings.onboarding.fieldTitle}
        value={fieldCode ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">{strings.onboarding.fieldNone}</option>
        {Object.entries(FIELD_CODES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </Select>
    </div>
  );
}
