// Public session metadata only. Exercise the actual BaseExtensionStore callbacks.
export const sessionStorage = {
  data: {} as Record<string, unknown>,
  chrome: {
    runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` },
    storage: { local: {
      get: (_keys: unknown, callback: (value: Record<string, unknown>) => void) => callback(structuredClone(sessionStorage.data)),
      set: (data: Record<string, unknown>, callback: () => void) => {
        Object.assign(sessionStorage.data, structuredClone(data));
        callback();
      },
    } },
  },
};
