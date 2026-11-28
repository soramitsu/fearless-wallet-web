import { describe, expect, it } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import {
  ARRIVAL_COOLDOWN_MS,
  ARRIVAL_SETTLE_MS,
  collectHoldings,
  createArrivalTracker,
  type Holding,
} from '@/feel/arrivals';

// Brand kit v3 SPEC part 2, "What counts as arriving".
const holding = (key: string, amount: string, extra: Partial<Holding> = {}): Holding => ({
  key,
  symbol: key.toUpperCase(),
  amount,
  known: true,
  quiet: false,
  ...extra,
});
const visible = (now: number) => ({ now, visible: true, settling: false });

/** A tracker that has seen the wallet once and settled. */
function settled(account = 'alice', holdings: Holding[] = [holding('dot', '1')]) {
  const tracker = createArrivalTracker();
  expect(tracker.observe(account, holdings, visible(0))).toBeNull();
  return { tracker, after: ARRIVAL_SETTLE_MS + 1 };
}

describe('tokens arriving', () => {
  it('fires when a known balance of the same wallet and asset grows, with how much more', () => {
    const { tracker, after } = settled();
    expect(tracker.observe('alice', [holding('dot', '3.5')], visible(after))).toEqual({
      key: 'dot',
      symbol: 'DOT',
      amount: '2.5',
      others: 0,
    });
  });

  it('never fires on the first value seen: a new or imported wallet, a first sync, a new network', () => {
    const tracker = createArrivalTracker();
    expect(tracker.observe('alice', [holding('dot', '7')], visible(0))).toBeNull();
    expect(tracker.observe('alice', [holding('dot', '7'), holding('ksm', '2')], visible(ARRIVAL_SETTLE_MS + 1))).toBeNull();
  });

  it('treats a placeholder or a failed update as unknown, so a first load after it is not an arrival', () => {
    const { tracker, after } = settled('alice', [holding('dot', '0', { known: false })]);
    expect(tracker.observe('alice', [holding('dot', '5')], visible(after))).toBeNull();
    expect(tracker.observe('alice', [holding('dot', '6')], visible(after + ARRIVAL_COOLDOWN_MS))).not.toBeNull();
  });

  it('never fires for a hidden, unverified or untrusted asset, but keeps its amount', () => {
    const { tracker, after } = settled('alice', [holding('spam', '1', { quiet: true })]);
    expect(tracker.observe('alice', [holding('spam', '1000', { quiet: true })], visible(after))).toBeNull();
    // Shown again later at the same amount: nothing arrived since.
    expect(tracker.observe('alice', [holding('spam', '1000')], visible(after + ARRIVAL_COOLDOWN_MS))).toBeNull();
  });

  it('never fires for a decrease or the same amount (a send, a fee, a price change)', () => {
    const { tracker, after } = settled('alice', [holding('dot', '5')]);
    expect(tracker.observe('alice', [holding('dot', '4.9')], visible(after))).toBeNull();
    expect(tracker.observe('alice', [holding('dot', '4.9')], visible(after + 10))).toBeNull();
  });

  it('starts over for another wallet, and lets its first snapshots settle', () => {
    const { tracker, after } = settled('alice', [holding('dot', '1')]);
    // The other wallet's own value is its first.
    expect(tracker.observe('bob', [holding('dot', '9')], visible(after))).toBeNull();
    // Within the settle time a late snapshot may still be the previous wallet's: it only sets the value.
    expect(tracker.observe('bob', [holding('dot', '10')], visible(after + 10))).toBeNull();
    expect(tracker.observe('bob', [holding('dot', '11')], visible(after + ARRIVAL_SETTLE_MS + 20))).not.toBeNull();
    // Back to alice: everything is a first value again.
    expect(tracker.observe('alice', [holding('dot', '50')], visible(after + 2 * ARRIVAL_SETTLE_MS + 40))).toBeNull();
  });

  it('shows nothing while the page is hidden or the balance is loading, and does not replay it later', () => {
    const { tracker, after } = settled();
    expect(tracker.observe('alice', [holding('dot', '2')], { now: after, visible: false, settling: false })).toBeNull();
    expect(tracker.observe('alice', [holding('dot', '2')], visible(after + 10))).toBeNull();
    expect(tracker.observe('alice', [holding('dot', '3')], { now: after + 20, visible: true, settling: true })).toBeNull();
  });

  it('shows at most one effect in any 3 s, naming one asset and counting the others', () => {
    const { tracker, after } = settled('alice', [holding('dot', '1'), holding('ksm', '1'), holding('eth', '1')]);
    expect(tracker.observe('alice', [holding('dot', '2'), holding('ksm', '2'), holding('eth', '1')], visible(after))).toEqual({
      key: 'dot',
      symbol: 'DOT',
      amount: '1',
      others: 1,
    });
    expect(tracker.observe('alice', [holding('dot', '3'), holding('ksm', '2'), holding('eth', '1')], visible(after + ARRIVAL_COOLDOWN_MS - 1))).toBeNull();
    expect(tracker.observe('alice', [holding('dot', '4'), holding('ksm', '2'), holding('eth', '1')], visible(after + 2 * ARRIVAL_COOLDOWN_MS))).not.toBeNull();
  });

  it('compares exact decimals, however many places', () => {
    const { tracker, after } = settled('alice', [holding('eth', '0.000000000000000001')]);
    expect(tracker.observe('alice', [holding('eth', '0.000000000000000002')], visible(after))?.amount).toBe('0.000000000000000001');
  });

  it('forgets everything on reset, as when the selected wallet changes', () => {
    const { tracker, after } = settled();
    tracker.reset(after);
    expect(tracker.observe('alice', [holding('dot', '2')], visible(after + 1))).toBeNull();
  });
});

describe('the holdings the rule reads', () => {
  const network = {
    name: 'Polkadot',
    chainId: '91b171bb',
    ecosystem: 'Substrate',
    assets: [{ id: 'dot', symbol: 'DOT', name: 'Polkadot', precision: 10 }],
  } as unknown as NetworkJson;
  const group = (balances: Array<Record<string, unknown>>): TokenGroup =>
    ({ groupId: 'dot', symbol: 'dot', relayChain: 'polkadot', balances }) as unknown as TokenGroup;

  it('keys each balance as the wallet list does and reads free + reserved as the amount', () => {
    const [dot] = collectHoldings([group([{ id: 'dot', name: 'Polkadot', symbol: 'DOT', total: '12.5', free: '10', state: APIItemState.READY }])], [network], new Set());

    expect(dot).toMatchObject({ symbol: 'DOT', amount: '12.5', known: true, quiet: false });
    expect(dot.key).toContain('91b171bb');
  });

  it('marks a hidden asset or one outside the registry and unverified as quiet, and a pending one as unknown', () => {
    const [hiddenDot] = collectHoldings([group([{ id: 'dot', name: 'Polkadot', symbol: 'DOT', total: '1', state: APIItemState.READY }])], [network], new Set(['substrate:91b171bb:dot']));
    const [airdrop] = collectHoldings(
      [group([{ id: 'unknown-token', name: 'Polkadot', symbol: 'FREE', total: '1', state: APIItemState.READY, assetMetadataTrust: 'unverified' }])],
      [network],
      new Set()
    );
    const [pending] = collectHoldings([group([{ id: 'dot', name: 'Polkadot', symbol: 'DOT', total: '0', state: APIItemState.PENDING }])], [network], new Set());

    expect(hiddenDot.key).toBe('substrate:91b171bb:dot');
    expect(hiddenDot.quiet).toBe(true);
    expect(airdrop.quiet).toBe(true);
    expect(pending.known).toBe(false);
  });

  it('skips balances on networks the wallet does not know', () => {
    expect(collectHoldings([group([{ id: 'dot', name: 'Elsewhere', total: '1', state: APIItemState.READY }])], [network], new Set())).toEqual([]);
  });
});
