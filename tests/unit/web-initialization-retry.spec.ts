import { describe, expect, it, vi } from 'vitest';
import { retryableInitialization } from '@/bootstrap/retryableInitialization';

describe('wallet initialization recovery', () => {
  it('shares concurrent work and retries a failed attempt after reload', async () => {
    const initialize = vi.fn().mockRejectedValueOnce(new Error('No wallet window')).mockResolvedValue(undefined);
    const ready = retryableInitialization(initialize);
    const first = ready();
    expect(ready()).toBe(first);
    await expect(first).rejects.toThrow('No wallet window');
    await ready();
    await ready();
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});
