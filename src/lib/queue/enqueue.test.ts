import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('./boss', async () => {
  const actual = await vi.importActual<typeof import('./boss')>('./boss');
  return {
    ...actual,
    getBoss: async () => ({ send: mockSend }),
  };
});

import { enqueueNewEnrollmentJobs } from './enqueue';

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValueOnce('job_wp_1');
  mockSend.mockResolvedValueOnce('job_oe_1');
});

describe('enqueueNewEnrollmentJobs', () => {
  it('sends two jobs with event-id-scoped singletonKeys for dedupe', async () => {
    const res = await enqueueNewEnrollmentJobs({
      memberId: 'mem_1',
      eventId: 'evt_abc',
    });
    expect(res).toEqual({
      welcomePacketJobId: 'job_wp_1',
      ownerEnrollmentJobId: 'job_oe_1',
    });
    expect(mockSend).toHaveBeenCalledTimes(2);

    const calls = mockSend.mock.calls.map((c) => ({
      queue: c[0],
      payload: c[1],
      options: c[2],
    }));
    const wp = calls.find((c) => c.queue === 'welcome-packet');
    const oe = calls.find((c) => c.queue === 'notify-owner-new-enrollment');
    expect(wp).toBeDefined();
    expect(oe).toBeDefined();
    expect(wp!.payload).toEqual({ memberId: 'mem_1', eventId: 'evt_abc' });
    expect(oe!.payload).toEqual({ memberId: 'mem_1', eventId: 'evt_abc' });
    expect(wp!.options.singletonKey).toBe('welcome-packet:evt_abc');
    expect(oe!.options.singletonKey).toBe('notify-owner-new-enrollment:evt_abc');
    // Retry configuration is present (pg-boss v10 defaults to zero retries).
    expect(wp!.options.retryLimit).toBeGreaterThan(0);
    expect(oe!.options.retryLimit).toBeGreaterThan(0);
  });

  it('returns null job ids when pg-boss dedupes via singletonKey on replay', async () => {
    mockSend.mockReset();
    mockSend.mockResolvedValueOnce(null); // pg-boss returns null when singleton collides
    mockSend.mockResolvedValueOnce(null);
    const res = await enqueueNewEnrollmentJobs({
      memberId: 'mem_1',
      eventId: 'evt_replay',
    });
    expect(res).toEqual({
      welcomePacketJobId: null,
      ownerEnrollmentJobId: null,
    });
  });
});
