import { describe, expect, it, vi } from 'vitest';
import { createFinishOnboarding } from './finish.ts';

const INPUT = { minutesPerDay: 20, examDate: null, fieldCode: null };

function deps() {
  return {
    setProfile: vi.fn().mockResolvedValue(undefined),
    queueBeacon: vi.fn().mockResolvedValue(undefined),
    installId: 'device-1',
    persistStorage: vi.fn().mockResolvedValue(true),
    navigate: vi.fn(),
  };
}

describe('createFinishOnboarding', () => {
  it('writes the profile, queues onboarding_done, asks for persistence, and navigates home', async () => {
    const d = deps();
    const finish = createFinishOnboarding(d);

    await finish(INPUT);

    expect(d.setProfile).toHaveBeenCalledWith({
      minutesPerDay: 20,
      examDate: null,
      fieldCode: null,
    });

    expect(d.queueBeacon).toHaveBeenCalledTimes(1);
    const [installId, events] = d.queueBeacon.mock.calls[0] as [string, { name: string }[]];
    expect(installId).toBe('device-1');
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('onboarding_done');

    expect(d.persistStorage).toHaveBeenCalledTimes(1);
    expect(d.navigate).toHaveBeenCalledWith('/');
  });

  it('is idempotent: a second call writes nothing again', async () => {
    const d = deps();
    const finish = createFinishOnboarding(d);

    await finish(INPUT);
    await finish({ minutesPerDay: 45, examDate: 1_800_000_000_000, fieldCode: 'ns' });

    expect(d.setProfile).toHaveBeenCalledTimes(1);
    expect(d.queueBeacon).toHaveBeenCalledTimes(1);
    expect(d.navigate).toHaveBeenCalledTimes(1);
  });

  it('still navigates home when persistStorage resolves false', async () => {
    const d = deps();
    d.persistStorage.mockResolvedValue(false);
    const finish = createFinishOnboarding(d);

    await finish(INPUT);

    expect(d.navigate).toHaveBeenCalledWith('/');
  });

  it('writes an explicit null exam date and field code when the user skipped them', async () => {
    const d = deps();
    const finish = createFinishOnboarding(d);

    await finish({ minutesPerDay: 10, examDate: null, fieldCode: null });

    expect(d.setProfile).toHaveBeenCalledWith({
      minutesPerDay: 10,
      examDate: null,
      fieldCode: null,
    });
  });
});
