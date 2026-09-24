import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildServerEnv,
  describeServerEnv,
  type ExampleEntry,
  parseServerSection,
  REQUIRED_SERVER_NAMES,
  SUPERUSER_PASSWORD_MIN,
  superuserStdin,
} from './server-env.ts';

const exampleText = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const example = parseServerSection(exampleText);

/** A stand-in `.env.local`: every kind of name the real one can hold, with fake values. */
const local: Record<string, string> = {
  SMS_PROVIDER: 'kavenegar',
  SMS_API_KEY: 'secret-sms-key-0001',
  ZARINPAL_MERCHANT_ID: 'secret-merchant-0002',
  ZARINPAL_SANDBOX: '0',
  KL_ADMIN_EMAIL: 'owner@example.com',
  KL_ADMIN_PASSWORD: 'secret-admin-password-0003',
  KL_API_ORIGIN: 'https://admin.konkurleitner.com',
  DEPLOY_HOST: '203.0.113.9',
  VPS_ROOT_PASSWORD: 'secret-root-0004',
};
const lookup = (name: string) => local[name];

function lineValue(content: string, name: string): string | undefined {
  const line = content.split('\n').find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1);
}

describe('parseServerSection', () => {
  it('reads exactly the VPS / PocketBase names of the real .env.example, in order', () => {
    expect(example.map((e) => e.name)).toEqual([
      'SMS_PROVIDER',
      'SMS_API_KEY',
      'SMS_API_BASE',
      'SMS_OTP_TEMPLATE',
      'ZARINPAL_MERCHANT_ID',
      'ZARINPAL_SANDBOX',
      'ZARINPAL_CALLBACK_URL',
      'PUBLIC_APP_ORIGIN',
      'CONTENT_DIR',
      'SOURCEMAP_DIR',
      'BACKUP_S3_ENDPOINT',
      'BACKUP_S3_BUCKET',
      'BACKUP_S3_KEY',
      'BACKUP_S3_SECRET',
    ]);
  });

  it('strips inline comments from the documented defaults', () => {
    const byName = new Map(example.map((e) => [e.name, e.defaultValue]));
    expect(byName.get('CONTENT_DIR')).toBe('/opt/kl/content');
    expect(byName.get('SMS_API_KEY')).toBe('');
    expect(byName.get('ZARINPAL_SANDBOX')).toBe('0');
  });

  it('refuses a file without the section', () => {
    expect(() => parseServerSection('FOO=1\n')).toThrow(/no "--- VPS \/ PocketBase" section/);
  });
});

describe('buildServerEnv', () => {
  it('forces SMS_PROVIDER=mock and ZARINPAL_SANDBOX=1 whatever .env.local says', () => {
    const env = buildServerEnv(example, lookup);
    expect(lineValue(env.content, 'SMS_PROVIDER')).toBe('mock');
    expect(lineValue(env.content, 'ZARINPAL_SANDBOX')).toBe('1');
    expect(env.content).not.toMatch(/kavenegar\n|SMS_PROVIDER=kavenegar/);
  });

  it('takes server secrets from the environment and non-secret defaults from .env.example', () => {
    const env = buildServerEnv(example, lookup);
    expect(lineValue(env.content, 'SMS_API_KEY')).toBe('secret-sms-key-0001');
    expect(lineValue(env.content, 'ZARINPAL_MERCHANT_ID')).toBe('secret-merchant-0002');
    expect(lineValue(env.content, 'CONTENT_DIR')).toBe('/opt/kl/content');
    expect(lineValue(env.content, 'PUBLIC_APP_ORIGIN')).toBe('https://app.konkurleitner.com');
  });

  it('never lets a local-tool or bootstrap secret into the server file', () => {
    const env = buildServerEnv(example, lookup);
    for (const secret of ['secret-admin-password-0003', 'secret-root-0004', '203.0.113.9']) {
      expect(env.content).not.toContain(secret);
    }
    expect(env.content).not.toMatch(/^(KL_|DEPLOY_|VPS_)/m);
  });

  it('leaves out a secret nobody set, rather than writing an empty value', () => {
    const env = buildServerEnv(example, lookup);
    expect(lineValue(env.content, 'BACKUP_S3_KEY')).toBeUndefined();
    expect(env.entries.find((e) => e.name === 'BACKUP_S3_KEY')?.source).toBe('unset');
  });

  it('refuses when a required name has no value anywhere, naming it', () => {
    const bare: ExampleEntry[] = example.map((e) => ({ ...e, defaultValue: '' }));
    expect(() => buildServerEnv(bare, () => undefined)).toThrow(
      /no value for PUBLIC_APP_ORIGIN, CONTENT_DIR, SOURCEMAP_DIR/,
    );
  });

  it('refuses when .env.example and the code have drifted apart', () => {
    const withoutOrigin = example.filter((e) => e.name !== 'PUBLIC_APP_ORIGIN');
    expect(() => buildServerEnv(withoutOrigin, lookup)).toThrow(/PUBLIC_APP_ORIGIN is not in/);
    expect(REQUIRED_SERVER_NAMES).toContain('PUBLIC_APP_ORIGIN');
  });

  it('refuses a value systemd would misread — and never echoes it', () => {
    for (const bad of ['has"quote', "it's", 'back\\slash', 'two\nlines', ' padded ']) {
      let message = '';
      try {
        buildServerEnv(example, (name) => (name === 'SMS_API_KEY' ? bad : local[name]));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/SMS_API_KEY has a value systemd/);
      expect(message).not.toContain(bad.trim());
    }
  });
});

describe('describeServerEnv', () => {
  it('masks every value that came from .env.local; shows only what is already in git', () => {
    const env = buildServerEnv(example, lookup);
    const printed = describeServerEnv(example, env.entries).join('\n');
    const secrets = Object.values(local).filter((v) => v.startsWith('secret-'));
    expect(secrets).toHaveLength(4);
    for (const secret of secrets) expect(printed).not.toContain(secret);
    expect(printed).not.toContain('owner@example.com');
    expect(printed).toContain('SMS_API_KEY=********');
    expect(printed).toContain('SMS_PROVIDER=mock');
    expect(printed).toContain('CONTENT_DIR=/opt/kl/content');
    expect(printed).toContain('BACKUP_S3_KEY — left out');
  });
});

describe('superuserStdin', () => {
  const password = 'x'.repeat(SUPERUSER_PASSWORD_MIN);

  it('is two lines, email then password', () => {
    expect(superuserStdin({ email: 'owner@example.com', password })).toBe(
      `owner@example.com\n${password}\n`,
    );
  });

  it('refuses a password shorter than what.md §15 allows, without echoing it', () => {
    const short = 'short-password-19ch';
    expect(short.length).toBe(19);
    expect(() => superuserStdin({ email: 'owner@example.com', password: short })).toThrow(
      /KL_ADMIN_PASSWORD is shorter than 20/,
    );
    try {
      superuserStdin({ email: 'owner@example.com', password: short });
    } catch (error) {
      expect((error as Error).message).not.toContain(short);
    }
  });

  it('refuses a missing email and a line break anywhere', () => {
    expect(() => superuserStdin({ email: '', password })).toThrow(/KL_ADMIN_EMAIL/);
    expect(() => superuserStdin({ email: 'a@b.c\nx', password })).toThrow(/KL_ADMIN_EMAIL/);
    expect(() => superuserStdin({ email: 'a@b.c', password: `${password}\n` })).toThrow(
      /line break/,
    );
  });
});
