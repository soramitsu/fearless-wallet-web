import axios from 'axios';
import { URLS } from '@/consts/urls';
import { withTimeout } from '@/util/endpointFailover';

/**
 * Background start-up waits for the remote feature configuration together with the network registry, which is
 * bounded the same way. A host that stalls instead of refusing must not keep every network from connecting: both
 * readers fall back to their remembered state when this rejects.
 */
export const REMOTE_CONFIG_TIMEOUT_MS = 10_000;

export class RemoteConfigTimeoutError extends Error {
  constructor() {
    super('remote_config_timeout');
  }
}

let pending: Promise<unknown> | undefined;

/**
 * The worker's start-up readers (action capabilities and the send and dApp-signing kill switches) all read this file
 * at once. A caller that asks while a fetch is under way shares it, so a start costs one request.
 */
export function fetchRemoteFeatureConfig(): Promise<unknown> {
  pending ??= fetchOnce().finally(() => {
    pending = undefined;
  });

  return pending;
}

async function fetchOnce(): Promise<unknown> {
  // Axios aborts its own request at the timeout; the race also bounds an adapter that does not.
  const request = axios.get<unknown>(URLS.FEATURES, { timeout: REMOTE_CONFIG_TIMEOUT_MS });

  return (await withTimeout(request, REMOTE_CONFIG_TIMEOUT_MS, () => new RemoteConfigTimeoutError())).data;
}
