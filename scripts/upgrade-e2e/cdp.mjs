// A DevTools connection used by the upgrade tests. A replaced target is a failed request, not an empty answer or
// a three-minute stall. Keep request payloads out of errors: they can contain the test wallet's recovery material.
export function cdp(url, { WebSocketImpl = WebSocket, timeoutMs = 180000, connectTimeoutMs = 15000 } = {}) {
  const ws = new WebSocketImpl(url);
  let id = 0;
  let closed = false;
  let open;
  let failOpen;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    open = resolve;
    failOpen = reject;
  });
  const connectTimer = setTimeout(() => {
    fail('DevTools connection timed out');
    ws.close();
  }, connectTimeoutMs);

  function fail(reason) {
    closed = true;
    clearTimeout(connectTimer);
    failOpen(new Error(reason));
    for (const request of pending.values()) request.fail(reason);
    pending.clear();
  }

  ws.onopen = () => {
    clearTimeout(connectTimer);
    open();
  };
  ws.onclose = () => fail('DevTools connection closed');
  ws.onerror = () => fail('DevTools connection failed');
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.fail(`DevTools protocol error ${message.error.code}`);
    else request.resolve(message);
  };

  const send = async (method, params = {}) => {
    // Capture the caller, rather than reporting only a timer's stack when a request fails.
    const error = new Error();
    await ready;
    if (closed) throw new Error(`DevTools connection closed before ${method}`);
    return new Promise((resolve, reject) => {
      const next = ++id;
      const failRequest = (reason) => {
        clearTimeout(timer);
        pending.delete(next);
        error.message = `${reason} (${method})`;
        reject(error);
      };
      const timer = setTimeout(() => failRequest(`No answer within ${timeoutMs} ms`), timeoutMs);
      pending.set(next, {
        fail: failRequest,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
      try {
        ws.send(JSON.stringify({ id: next, method, params }));
      } catch {
        failRequest('DevTools request could not be sent');
      }
    });
  };
  return {
    ready,
    send,
    close: () => {
      fail('DevTools connection closed');
      ws.close();
    },
    eval: async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.result?.exceptionDetails)
        throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
      return result.result?.result?.value;
    },
  };
}
