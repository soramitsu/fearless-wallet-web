import { describe, expect, it, vi } from 'vitest';
import { openDappPage } from '../../scripts/extension-smoke-dapp.mjs';

function fixture(states: { href: string; readyState: string }[]) {
  let document = states[0];
  const checked: typeof states = [];
  const installed: typeof states = [];
  const cdp = {
    send: vi.fn(async (method: string) => method === 'Target.createTarget' ? { targetId: 'dapp' } : { sessionId: 'session' }),
  };
  const helpers = {
    evaluate: vi.fn(async () => {
      installed.push(document);
      return true;
    }),
    waitForExpression: vi.fn(async (_cdp: unknown, _session: string, expression: string) => {
      // Evaluate the actual readiness predicate over successive browser states.
      // No sleep or timing assumption: the initial completed document is distinct
      // from the requested document's loading and completed states.
      const ready = new Function('location', 'document', `return (${expression});`);
      for (document of states) {
        checked.push(document);
        if (ready({ href: document.href }, { readyState: document.readyState })) return true;
      }
      throw new Error('Requested document did not load');
    }),
  };
  return { cdp, checked, helpers, installed };
}

describe('extension smoke dApp navigation', () => {
  const url = 'http://127.0.0.1:12345/dapp.html';

  it('installs helpers only after the requested document commits and completes', async () => {
    const states = [
      { href: 'about:blank', readyState: 'complete' },
      { href: url, readyState: 'loading' },
      { href: url, readyState: 'complete' },
    ];
    const f = fixture(states);

    await expect(openDappPage(f.cdp, url, f.helpers)).resolves.toBe('session');
    expect(f.checked).toEqual(states);
    expect(f.installed).toEqual([states[2]]);
    expect(f.cdp.send).toHaveBeenCalledWith('Target.createTarget', { url });
  });

  it('does not install helpers into a different completed document or hide navigation failure', async () => {
    const f = fixture([
      { href: 'about:blank', readyState: 'complete' },
      { href: 'http://127.0.0.1:12345/other.html', readyState: 'complete' },
    ]);

    await expect(openDappPage(f.cdp, url, f.helpers)).rejects.toThrow('Requested document did not load');
    expect(f.installed).toEqual([]);
  });
});
