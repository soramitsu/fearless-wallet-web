// Install before navigating, so the first requests run in the extension document rather than in a provisional
// about:blank execution context. Poll plain progress snapshots; never hold a CDP awaitPromise across navigation.
export const coldProbeSource = `(() => {
  const state = globalThis.__fwColdStartProbe = { phase: 'connecting' };
  if (!globalThis.chrome?.runtime?.connect) {
    state.error = 'Extension runtime was unavailable in the extension document';
    state.phase = 'complete';
    return;
  }
  const port = chrome.runtime.connect({ name: 'fw-fearless-extension' });
  const pending = new Map();
  let dropped = null;
  port.onMessage.addListener((reply) => {
    if (!reply.subscription) pending.get(reply.id)?.(reply.error ? { error: reply.error } : reply.response);
  });
  port.onDisconnect.addListener(() => {
    dropped = chrome.runtime.lastError?.message ?? 'disconnected';
    for (const finish of [...pending.values()]) finish({ unanswered: true, dropped });
  });
  const ask = (message, id) => new Promise((resolve) => {
    const timer = setTimeout(() => finish({ unanswered: message, dropped }), 60000);
    const finish = (value) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(value);
    };
    pending.set(id, finish);
    if (dropped) finish({ unanswered: message, dropped });
    else try { port.postMessage({ id, message, request: null }); }
    catch { finish({ unanswered: message, dropped: 'postMessage failed' }); }
  });
  (async () => {
    state.phase = 'first-responses';
    const [hasMasterPassword, hasAccounts, keyringIsLocked] = await Promise.all([
      ask('pri(keyring.hasMasterPassword)', 'c1'),
      ask('pri(keyring.hasAccounts)', 'c2'),
      ask('pri(keyring.keyringIsLocked)', 'c3')
    ]);
    Object.assign(state, { hasMasterPassword, hasAccounts, keyringIsLocked });
    state.phase = 'settling';
    await new Promise((resolve) => setTimeout(resolve, 1500));
    state.phase = 'later-responses';
    const [hasMasterPasswordLater, keyringIsLockedLater] = await Promise.all([
      ask('pri(keyring.hasMasterPassword)', 'c4'), ask('pri(keyring.keyringIsLocked)', 'c5')
    ]);
    Object.assign(state, { hasMasterPasswordLater, keyringIsLockedLater, phase: 'complete' });
    port.disconnect();
  })().catch(() => { state.error = 'Cold-start probe failed'; state.phase = 'complete'; });
})()`;
