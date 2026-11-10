import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepAlive } from './mcp.js';

afterEach(() => { vi.useRealTimers(); });

describe('keepAlive', () => {
  it('sends progress every 10 seconds while a call runs, and stops after', () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    const stop = keepAlive({ _meta: { progressToken: 7 }, sendNotification: async (n) => { sent.push(n.params.progress); } });
    vi.advanceTimersByTime(35_000);
    stop();
    vi.advanceTimersByTime(30_000);
    expect(sent).toEqual([1, 2, 3]);
  });

  it('sends nothing when the client did not ask for progress', () => {
    vi.useFakeTimers();
    const sendNotification = vi.fn(async () => {});
    const stop = keepAlive({ sendNotification });
    vi.advanceTimersByTime(60_000);
    stop();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
