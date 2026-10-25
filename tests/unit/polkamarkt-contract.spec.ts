import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/contracts/polkamarkt-v1.json';
import {
  deriveMarketStatus,
  fromCodecAmount,
  mergeAndSortMarkets,
  negotiateCapabilities,
  parseActivity,
  parseClaimable,
  parseIndexedMarket,
  parseRuntimeMarket,
  rawInteger,
  rawRpcPayload,
  toCodecAmount,
} from '@/defi/polkamarkt/contract';

const indexedNodes = fixture.catalog.legacyQueryResponse.data.markets.edges.map(({ node }) => node);

describe('shared Polkamarkt v1 contract', () => {
  it('uses the byte-identical cross-client fixture', () => {
    const bytes = readFileSync(resolve(__dirname, '../fixtures/contracts/polkamarkt-v1.json'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'e0eb0fba87e580ecd15c8722ce0876c5e10a994cc3c497d95b16bcc34ee021b4'
    );
  });

  it('derives open and closed status from the authoritative current block', () => {
    const markets = indexedNodes.map((node) => parseIndexedMarket(node, fixture.catalog.currentBlock));
    expect(markets.map((market) => market?.displayStatus)).toEqual(['open', 'closed']);
    expect(deriveMarketStatus('Open', '120', '151')).toBe('closed');
    expect(deriveMarketStatus('Resolved', '999', '1')).toBe('resolved');
  });

  it('merges runtime-only markets and sorts client-side without numeric coercion', async () => {
    const indexed = indexedNodes.flatMap((node) => {
      const market = parseIndexedMarket(node, fixture.catalog.currentBlock);
      return market ? [market] : [];
    });
    const runtimeEntry = fixture.catalog.runtimeEntries[1];
    const runtime = await parseRuntimeMarket(
      {
        conditions: vi.fn().mockResolvedValue({
          question: Array.from(new TextEncoder().encode(runtimeEntry.question)),
          oracle: Array.from(new TextEncoder().encode('SORA On-Chain Governance')),
        }),
        conditionDetails: vi.fn().mockResolvedValue({ category: Array.from(new TextEncoder().encode('AI')) }),
        marketVolume: vi.fn().mockResolvedValue('0'),
      },
      {
        marketState: vi.fn().mockResolvedValue({
          dpmCollateral: '0',
          impliedYesProbabilityBps: '5000',
          mechanism: 'DynamicPariMutuel',
        }),
      },
      runtimeEntry.marketId,
      runtimeEntry,
      fixture.catalog.currentBlock
    );
    expect(runtime).not.toBeNull();
    expect(mergeAndSortMarkets(indexed, [runtime!]).map((market) => market.id)).toEqual(
      fixture.catalog.expectedSortedMarketIds
    );
    expect(indexed[0].liquidityUsd).toBe('1000000000000000000.000000000000000001');
  });

  it('serializes arbitrary-precision balance parameters as raw JSON integers', () => {
    for (const quote of fixture.quotes) {
      const params = quote.domainParams;
      const amount = 'collateralIn' in params ? params.collateralIn : params.sharesIn;
      const payload = rawRpcPayload(1, quote.rpcMethod, [Number(params.marketId), params.outcome, rawInteger(amount)]);
      expect(payload).toContain(`"params":${quote.wireParamsJson}`);
      expect(payload).not.toContain(`"${amount}"`);
    }
  });

  it('keeps monetary conversions as exact decimal strings', () => {
    const value = '1.000000000000000001';
    expect(toCodecAmount(value)).toBe('1000000000000000001');
    expect(fromCodecAmount('1000000000000000001')).toBe(value);
  });

  it('negotiates capability drift fail-closed', () => {
    const capabilities = negotiateCapabilities({
      query: { polkamarkt: { markets: { entries: vi.fn() } } },
      rpc: { polkamarkt: { quoteBuy: vi.fn(), quoteSell: vi.fn() } },
      tx: { polkamarkt: { buy: vi.fn(), sell: vi.fn(), claimMarket: vi.fn() } },
    });
    expect(capabilities.browse).toBe(true);
    expect(capabilities.marketState).toBe(false);
    expect(capabilities.claimCreatorFees).toBe(false);
    expect(capabilities.reasons).toContain('Live market state is unavailable; trading is disabled.');
  });

  it('parses indexed positions, trades, and runtime trader/creator claims as strings', () => {
    const activity = parseActivity(fixture.accountActivity.indexerResponse);
    expect(activity.positions[0]).toMatchObject({ marketId: '7', shares: '1800000000000000002' });
    expect(activity.trades[0]).toMatchObject({ marketId: '7', collateral: '1000000000000000001' });
    expect(parseClaimable(fixture.accountActivity.runtimeClaimable, 'cnTrader', '7')).toMatchObject({
      traderPayout: '2200000000000000000',
      claimablePayout: '2200000000000000000',
      creatorFees: '5000000000000000',
      isCreator: true,
    });
  });

  it('keeps closed markets visible when no market is active', () => {
    const currentBlock = fixture.catalog.noActiveMarketCase.currentBlock;
    const indexed = indexedNodes.flatMap((node) => {
      const market = parseIndexedMarket(node, currentBlock);
      return market ? [market] : [];
    });
    expect(indexed.filter((market) => market.displayStatus === 'open')).toEqual([]);
    expect(indexed.map((market) => market.id)).toEqual(['7', '8']);
  });
});
