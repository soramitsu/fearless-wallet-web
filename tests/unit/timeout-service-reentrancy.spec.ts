import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TimeoutService } from '@extension-base/services/timeout-service';
import type State from '@extension-base/background/handlers/State';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('debounces only the matching key and preserves independent work', () => {
  const service = new TimeoutService({} as State);
  const superseded = vi.fn(), latest = vi.fn(), independent = vi.fn();
  service.lazyNext('account', superseded, 10);
  service.lazyNext('network', independent, 15);
  service.lazyNext('account', latest, 20);
  vi.advanceTimersByTime(20);
  expect(superseded).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledOnce();
  expect(independent).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves work rescheduled by its own callback', () => {
  const service = new TimeoutService({} as State);
  const next = vi.fn();
  service.lazyNext('refresh', () => service.lazyNext('refresh', next, 10), 10);
  vi.advanceTimersByTime(20);
  expect(next).toHaveBeenCalledOnce();
});

it('allows a reentrant callback to cancel or replace its successor', () => {
  const service = new TimeoutService({} as State);
  const cancelled = vi.fn(), replacement = vi.fn();
  service.lazyNext('refresh', () => {
    service.lazyNext('refresh', cancelled, 10);
    service.clearTimeout('refresh');
    service.lazyNext('refresh', replacement, 20);
  }, 10);
  vi.advanceTimersByTime(30);
  expect(cancelled).not.toHaveBeenCalled();
  expect(replacement).toHaveBeenCalledOnce();
});

it('leaves a scheduled successor intact even if the callback throws', () => {
  const service = new TimeoutService({} as State);
  const next = vi.fn();
  service.lazyNext('refresh', () => {
    service.lazyNext('refresh', next, 10);
    throw new Error('callback failed');
  }, 10);
  expect(() => vi.advanceTimersByTime(10)).toThrow('callback failed');
  vi.advanceTimersByTime(10);
  expect(next).toHaveBeenCalledOnce();
});
