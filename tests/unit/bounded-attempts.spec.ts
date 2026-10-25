import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedAttempts, withDeadline } from '@/bootstrap/boundedAttempts';

const policy = { attempts: 3, retryDelaysMs: [250, 1000] };

afterEach(() => vi.useRealTimers());

describe('bounded start-up attempts', () => {
  it('returns after the first success without leaving a timer behind', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn().mockResolvedValue(undefined);
    await boundedAttempts(attempt, policy);
    expect(attempt).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits between failed tries and succeeds on a later one', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue(undefined);
    const done = vi.fn();
    void boundedAttempts(attempt, policy).then(done);
    await vi.advanceTimersByTimeAsync(249);
    expect(attempt).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up after the last try with its error', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    const result = boundedAttempts(attempt, policy);
    const rejected = expect(result).rejects.toThrow('storage unavailable');
    await vi.advanceTimersByTimeAsync(1250);
    await rejected;
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never starts a try while the previous one is still running', async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(() => new Promise<void>(() => {}));
    void boundedAttempts(attempt, policy);
    await vi.advanceTimersByTimeAsync(60000);
    expect(attempt).toHaveBeenCalledOnce();
  });
});

describe('start-up deadline', () => {
  it('stops waiting for work that does not finish, without cancelling it', async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const work = new Promise<string>((resolve) => { finish = resolve; });
    const waiting = withDeadline(work, 15000, 'Wallet storage could not be read.');
    const rejected = expect(waiting).rejects.toThrow('Wallet storage could not be read.');
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    finish('loaded');
    await expect(withDeadline(work, 15000, 'unused')).resolves.toBe('loaded');
    expect(vi.getTimerCount()).toBe(0);
  });
});
