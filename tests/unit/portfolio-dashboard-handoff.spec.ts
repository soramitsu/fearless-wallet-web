// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROUTE_NAMES,
  holdingAssetId,
  locationsLocation,
  moveLocation,
  needsWalletSwitch,
  receiveLocation,
  receiveOnSoraLocation,
  sendLocation,
  swapLocation,
  swapPairFromQuery,
} from '@/portfolio/dashboard/handoff';
import { parseHoldingKey, sameAssetId } from '@/portfolio/dashboard/holdingKey';

describe('route names', () => {
  // The Components enum is the router's own; reading its source keeps this test from loading every screen.
  const source = readFileSync(resolve(__dirname, '../../src/router/routes.ts'), 'utf8');
  const enumBody = /export enum Components \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
  const members = Object.fromEntries([...enumBody.matchAll(/(\w+) = '(\w+)'/g)].map(([, name, value]) => [name, value]));

  it('are the values of the router components they stand for', () => {
    Object.values(ROUTE_NAMES).forEach((name) => expect(members[name], name).toBe(name));
  });
});

describe('hand-offs', () => {
  const holding = { key: 'substrate:chain:asset-1', networkName: 'Polkadot' };

  it('open Send and Receive as the portfolio list does, with the asset id and the network name', () => {
    expect(sendLocation(holding)).toEqual({ name: 'SendForm', params: { assetId: 'asset-1', network: 'Polkadot' } });
    expect(receiveLocation(holding)).toEqual({ name: 'ReceiveForm', params: { assetId: 'asset-1', network: 'Polkadot' } });
    expect(sendLocation({ key: 'nonsense', networkName: 'X' })).toBeUndefined();
    expect(holdingAssetId(holding)).toBe('asset-1');
  });

  it('open the cross-chain screen with the first move chosen, as the asset page does', () => {
    expect(moveLocation({ originChainId: 'chain', assetKey: 'substrate:chain:asset-1' })).toEqual({
      name: 'CrossChain',
      query: { originChainId: 'chain', assetKey: 'substrate:chain:asset-1' },
    });
  });

  it('open Polkaswap with the pay asset, and the asset to receive when one was picked', () => {
    expect(swapLocation({ from: 'abc' })).toEqual({ name: 'Polkaswap', query: { from: 'abc' } });
    expect(swapLocation({ from: 'abc', to: 'def' })).toEqual({ name: 'Polkaswap', query: { from: 'abc', to: 'def' } });
  });

  it('open Receive on SORA for the asset a route ends with', () => {
    expect(receiveOnSoraLocation('cd092a5a', 'SORA Mainnet')).toEqual({ name: 'ReceiveForm', params: { assetId: 'cd092a5a', network: 'SORA Mainnet' } });
  });

  it('open Where it lives for a token, with one holding chosen when there is one', () => {
    expect(locationsLocation('group:dot')).toEqual({ name: 'TokenLocations', query: { token: 'group:dot' } });
    expect(locationsLocation('group:dot', 'a|b')).toEqual({ name: 'TokenLocations', query: { token: 'group:dot', holding: 'a|b' } });
  });

  it('switch wallet first for a holding of a wallet that is not the selected one', () => {
    expect(needsWalletSwitch('savings', 'main')).toBe(true);
    expect(needsWalletSwitch('main', 'main')).toBe(false);
  });
});

describe('the pair a hand-off to Polkaswap carries', () => {
  it('is read back from the query', () => {
    expect(swapPairFromQuery({ from: 'b774c386-5cce-454a-a845-1ec0381538ec', to: 'cd092a5a-4eb6-4318-9f11-4bf8454d67a2' })).toEqual({
      from: 'b774c386-5cce-454a-a845-1ec0381538ec',
      to: 'cd092a5a-4eb6-4318-9f11-4bf8454d67a2',
    });
    expect(swapPairFromQuery({ from: 'abc' })).toEqual({ from: 'abc' });
    expect(swapPairFromQuery({ from: ['abc', 'second'], to: ['def'] })).toEqual({ from: 'abc', to: 'def' });
  });

  it('is ignored when it is missing, or when an id is not one a SORA asset can have', () => {
    expect(swapPairFromQuery({})).toBeUndefined();
    expect(swapPairFromQuery({ to: 'abc' })).toBeUndefined();
    expect(swapPairFromQuery({ from: '' })).toBeUndefined();
    expect(swapPairFromQuery({ from: 'a b' })).toBeUndefined();
    expect(swapPairFromQuery({ from: '<script>' })).toBeUndefined();
    expect(swapPairFromQuery({ from: 'a'.repeat(101) })).toBeUndefined();
    expect(swapPairFromQuery({ from: 7 })).toBeUndefined();
  });

  it('keeps the pay asset and drops a receive asset that is bad or the same', () => {
    expect(swapPairFromQuery({ from: 'abc', to: 'a b' })).toEqual({ from: 'abc' });
    expect(swapPairFromQuery({ from: 'abc', to: 'abc' })).toEqual({ from: 'abc' });
  });
});

describe('holding keys', () => {
  it('read back into the network and asset they name', () => {
    expect(parseHoldingKey('substrate:91b171bb:887a17c7-1370')).toEqual({ ecosystem: 'substrate', chainId: '91b171bb', assetId: '887a17c7-1370' });
  });

  it('decode an asset id that holds a colon, which the key writes percent-encoded', () => {
    expect(parseHoldingKey('substrate:chain:a%3Ab')).toEqual({ ecosystem: 'substrate', chainId: 'chain', assetId: 'a:b' });
  });

  it('name nothing when they are not three parts, or do not decode', () => {
    for (const key of ['', 'a:b', 'a:b:c:d', 'a::c', ':b:c', 'a:b:%E0%A4%A']) expect(parseHoldingKey(key), key).toBeUndefined();
  });

  it('compare EVM contract ids without case and every other id exactly', () => {
    expect(sameAssetId('evm', '0xAbC', '0xabc')).toBe(true);
    expect(sameAssetId('ethereum', '0xAbC', '0xabc')).toBe(true);
    expect(sameAssetId('substrate', 'AbC', 'abc')).toBe(false);
    expect(sameAssetId('substrate', 'abc', 'abc')).toBe(true);
  });
});
