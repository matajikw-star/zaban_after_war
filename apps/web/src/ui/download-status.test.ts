import { describe, expect, it } from 'vitest';
import { strings } from '../strings.ts';
import type { DownloadState } from '../sync/download.ts';
import { downloadCanRetry, downloadPercent, downloadStatusText } from './download-status.ts';

function error(reason: string): DownloadState {
  return { name: 'error', reason, attempt: 1, retryAt: 0 };
}

describe('downloadStatusText', () => {
  it('says "waiting" before the first run only to an entitled user', () => {
    expect(downloadStatusText({ name: 'none' }, true)).toBe(strings.download.waiting);
    expect(downloadStatusText({ name: 'none' }, false)).toBe(strings.download.none);
  });

  it('prints the percent while downloading', () => {
    const state: DownloadState = {
      name: 'downloading',
      version: 'v',
      received: 63,
      total: 100,
      percent: 63,
      failures: 0,
    };
    expect(downloadStatusText(state, true)).toBe(strings.download.progress('۶۳٪'));
    expect(downloadPercent(state)).toBe(63);
    expect(downloadPercent({ name: 'installed', version: 'v' })).toBeNull();
  });

  it('names the cause of a failure in words, the connection ones alike', () => {
    for (const reason of [
      'NETWORK',
      'DOWNLOAD_INTERRUPTED',
      'DOWNLOAD_TRUNCATED',
      'DOWNLOAD_STALLED',
    ]) {
      expect(downloadStatusText(error(reason), true)).toBe(strings.download.errorOffline);
    }
    expect(downloadStatusText(error('RATE_LIMITED'), true)).toBe(strings.download.errorRateLimited);
    expect(downloadStatusText(error('STORAGE_FULL'), true)).toBe(strings.download.errorStorage);
    expect(downloadStatusText(error('SERVER_PAYMENT_DISABLED_MOCK_SMS'), true)).toBe(
      strings.download.errorDisabled,
    );
    expect(downloadStatusText(error('HASH_MISMATCH'), true)).toBe(strings.download.errorOther);
  });
});

describe('downloadCanRetry', () => {
  it('offers a retry on a failure a tap can help, never on a 429 or the staging gate', () => {
    expect(downloadCanRetry(error('NETWORK'))).toBe(true);
    expect(downloadCanRetry(error('HASH_MISMATCH'))).toBe(true);
    expect(downloadCanRetry(error('RATE_LIMITED'))).toBe(false);
    expect(downloadCanRetry(error('SERVER_PAYMENT_DISABLED_MOCK_SMS'))).toBe(false);
    expect(downloadCanRetry({ name: 'installed', version: 'v' })).toBe(false);
  });
});

describe('a failed update check while the paid package is on the device', () => {
  // A filtered or captive network keeps navigator.onLine true, so the runner checks the manifest,
  // fails, and the machine sits in `error`. The words the user studies are all there: say so.
  it('says the words are ready, whatever the cause, and offers no retry', () => {
    for (const reason of ['NETWORK', 'DOWNLOAD_STALLED', 'HASH_MISMATCH', 'STORAGE_FULL']) {
      expect(downloadStatusText(error(reason), true, true)).toBe(strings.download.installed);
      expect(downloadCanRetry(error(reason), true)).toBe(false);
    }
  });

  it('still names the failure when no paid package is on the device', () => {
    expect(downloadStatusText(error('NETWORK'), true, false)).toBe(strings.download.errorOffline);
    expect(downloadCanRetry(error('NETWORK'), false)).toBe(true);
  });
});
