import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { APIItemState } from '@extension-base/api/types/networks';
import { describe, expect, it } from 'vitest';
import type { RequestSwap, TokenGroup } from '@extension-base/background/types/types';
import {
  validateAuthoritativePolkaswapExecution,
  validatePolkaswapExecution,
} from '@/defi/polkaswapExecutionGuard';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/sora';

const asset = (groupId: string, id: string, symbol: string, transferable: string): TokenGroup => ({
  balances: [{
    icon: symbol,
    id,
    name: SORA_NETWORK_NAME,
    precision: 18,
    state: APIItemState.READY,
    symbol,
    total: transferable,
    transferable,
    type: 'normal',
  }],
  groupId,
  icon: symbol,
  mainNetwork: SORA_NETWORK_NAME,
  providers: [],
  relayChain: 'sora' as never,
  symbol,
  tokenName: symbol,
});

const request = {
  amountA: '2',
  amountB: '1',
  assetAId: 'kusd-group',
  assetBId: 'xor-group',
  disclaimerAccepted: true,
  isExchangeB: false,
  isMobile: false,
  marketType: 'SMART',
  network: SORA_NETWORK_NAME,
  slippage: 0.5,
  symbolA: 'KUSD',
  symbolB: 'XOR',
} as RequestSwap;

describe('Polkaswap final execution guard', () => {
  it('keeps every final handler gate ahead of the direct swap execution call', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/background/handlers/Extension.ts'),
      'utf8'
    );
    const start = source.indexOf('private async makeSwap(options: RequestSwap)');
    const end = source.indexOf('private createPolkamarktService()', start);
    const handler = source.slice(start, end);
    const disclaimer = handler.indexOf('!this.state.soraDisclaimerService.isAccepted()');
    const runtime = handler.indexOf('if (!runtimeReady)');
    const rebuildQuote = handler.indexOf('await createSwap(options, apiSora, this.state)');
    const balanceGuard = handler.indexOf('validatePolkaswapExecution({');
    const authoritativeGuard = handler.indexOf('validateAuthoritativePolkaswapExecution({');
    const accountBinding = handler.lastIndexOf('isCapturedSoraPairStillSelected(');
    const unlock = handler.indexOf('!this.state.keyringService.unlockPair(currentSelectedAddress)');
    const execute = handler.indexOf('apiSora.swap.execute(');

    expect(handler).toContain("isActionEnabled('polkaswap')");
    expect(handler).not.toContain('options.disclaimerAccepted');
    expect(handler).toContain('networkFee: this.state.soraFees.value[Operation.Swap]');
    expect(disclaimer).toBeGreaterThan(-1);
    expect(runtime).toBeGreaterThan(disclaimer);
    expect(rebuildQuote).toBeGreaterThan(runtime);
    expect(balanceGuard).toBeGreaterThan(rebuildQuote);
    expect(authoritativeGuard).toBeGreaterThan(balanceGuard);
    expect(handler).toContain('await apiSora.calcStaticNetworkFees()');
    expect(handler).toContain('apiSora.assets.getAccountAsset(assetA.address)');
    expect(handler.match(/isActionEnabled\('polkaswap'\)/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(handler.match(/soraDisclaimerService\.isAccepted\(\)/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(accountBinding).toBeGreaterThan(authoritativeGuard);
    expect(unlock).toBeGreaterThan(authoritativeGuard);
    expect(execute).toBeGreaterThan(authoritativeGuard);
    expect(execute).toBeGreaterThan(accountBinding);
    expect(execute).toBeGreaterThan(unlock);
    expect(handler.slice(execute)).toContain('status: false');
  });

  it('validates raw authoritative balances by exact runtime asset address', () => {
    const runtimeAsset = (address: string, transferable: string) => ({
      address,
      decimals: 18,
      balance: { transferable },
    });
    const exact = validateAuthoritativePolkaswapExecution({
      source: runtimeAsset('kusd-address', '2000000000000000000'),
      destination: runtimeAsset('xor-destination', '0'),
      xor: runtimeAsset(SORA_XOR_ASSET_ID, '100000000000000000'),
      sourceAddress: 'kusd-address',
      destinationAddress: 'xor-destination',
      sourceAmount: '2',
      networkFee: '0.01',
    });
    const substituted = validateAuthoritativePolkaswapExecution({
      source: runtimeAsset('other-kusd-address', '999000000000000000000'),
      destination: runtimeAsset('xor-destination', '0'),
      xor: runtimeAsset(SORA_XOR_ASSET_ID, '100000000000000000'),
      sourceAddress: 'kusd-address',
      destinationAddress: 'xor-destination',
      sourceAmount: '2',
      networkFee: '0.01',
    });

    expect(exact).toBeNull();
    expect(substituted?.message).toBe('The selected SORA asset identity changed.');
  });

  it('accepts only the exact selected asset rows with enough source and XOR fee balance', () => {
    const balances = [
      asset('kusd-group', 'exact-kusd-id', 'KUSD', '2'),
      asset('xor-group', SORA_XOR_ASSET_ID, 'XOR', '0.1'),
    ];

    expect(validatePolkaswapExecution({ balances, networkFee: '0.01', request })).toBeNull();
  });

  it('rejects a same-symbol group substitution and missing exact XOR identity', () => {
    const balances = [
      asset('other-kusd-group', 'other-kusd-id', 'KUSD', '999'),
      asset('xor-group', 'fake-xor-id', 'XOR', '999'),
    ];

    expect(validatePolkaswapExecution({ balances, networkFee: '0.01', request })?.message)
      .toBe('The selected SORA asset is no longer available.');
  });

  it('rechecks the source amount and current XOR fee at confirmation time', () => {
    const lowSource = [
      asset('kusd-group', 'exact-kusd-id', 'KUSD', '1.99'),
      asset('xor-group', SORA_XOR_ASSET_ID, 'XOR', '0.1'),
    ];
    const lowFee = [
      asset('kusd-group', 'exact-kusd-id', 'KUSD', '2'),
      asset('xor-group', SORA_XOR_ASSET_ID, 'XOR', '0.001'),
    ];

    expect(validatePolkaswapExecution({ balances: lowSource, networkFee: '0.01', request })?.message)
      .toBe('The selected SORA asset balance is insufficient.');
    expect(validatePolkaswapExecution({ balances: lowFee, networkFee: '0.01', request })?.message)
      .toBe('Add enough XOR to pay the current SORA network fee.');
  });
});
