import type { Injected } from '@polkadot/extension-inject/types';
import type { InjectedWindowProvider } from './types';

export function createSubstrateProvider({
  version,
  enable,
  checkIfPhishing,
}: {
  version: string;
  enable: (origin: string) => Promise<Injected>;
  checkIfPhishing: () => Promise<boolean>;
}): InjectedWindowProvider {
  let readiness: Promise<boolean> | undefined;
  const pending = new Map<string, Promise<Injected>>();

  return {
    version,
    enable(origin) {
      const current = pending.get(origin);
      if (current) return current;

      // A cold MV3 worker can take longer than the old three-second placeholder
      // timeout. Wait for its actual response, and let a later connect retry a
      // failed startup/storage read without requiring the dapp to reload.
      readiness ??= Promise.resolve().then(checkIfPhishing).catch((error) => {
        readiness = undefined;
        throw error;
      });
      const request = readiness.then((denied) => {
        if (denied) throw new Error('This site is blocked by the phishing protection');
        return enable(origin);
      }).finally(() => {
        pending.delete(origin);
      });
      pending.set(origin, request);
      return request;
    },
  };
}
