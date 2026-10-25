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

export async function fetchRemoteFeatureConfig(): Promise<unknown> {
  // Axios aborts its own request at the timeout; the race also bounds an adapter that does not.
  const request = axios.get<unknown>(URLS.FEATURES, { timeout: REMOTE_CONFIG_TIMEOUT_MS });

  return (await withTimeout(request, REMOTE_CONFIG_TIMEOUT_MS, () => new RemoteConfigTimeoutError())).data;
}
