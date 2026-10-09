import { assert } from '@polkadot/util';
import type { TokenGroup } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { Asset } from '@extension-base/types';
import type { NetworkName } from '@/interfaces';
import { isSameString } from '@/helpers';

export function getAssetInfo(assetId: string, state: State): Asset {
  return state.networkService.assetsMap.find(({ id }) => id === assetId)!;
}

export function getAssetBalance(network: NetworkName, tokenBalance: TokenGroup): BalanceItem {
  return tokenBalance.balances.find(({ name }) => isSameString(name, network))!;
}

export function withErrorLog(fn: () => unknown): void {
  try {
    const p = fn();

    if (p && typeof p === 'object' && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch(console.error);
    }
  } catch (e) {
    console.error(e);
  }
}

export function stripUrl(url: string): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid dApp URL');
  }

  assert(
    ['http:', 'https:', 'ipfs:', 'ipns:'].includes(parsed.protocol),
    'Invalid dApp URL scheme; expected http, https, ipfs, or ipns'
  );
  assert(parsed.hostname && !parsed.username && !parsed.password, 'Invalid credential-bearing or hostless dApp URL');

  // Permissions are origin scoped. Keeping the scheme prevents an HTTPS grant
  // from being reused by an HTTP page on the same host.
  return `${parsed.protocol}//${parsed.host}`;
}

// Browser-internal tabs have no dApp authorization target. Keep stripUrl strict
// for permission requests while allowing the header's read-only status to settle.
export function getTabAuthorizationTarget(url?: string): { key: string; hostname: string } | undefined {
  if (!url) return undefined;
  try {
    return { key: stripUrl(url), hostname: new URL(url).hostname };
  } catch {
    return undefined;
  }
}

export async function isOpenClient() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
  const contexts: Array<{ contextType: string }> = await chrome.runtime.getContexts({});

  const index = contexts.findIndex(({ contextType }) => contextType === 'TAB' || contextType === 'POPUP');

  return index !== -1;
}
