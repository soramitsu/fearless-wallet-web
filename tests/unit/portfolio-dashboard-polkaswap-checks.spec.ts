import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { derivePolkaswapFacts, polkaswapChecks, type PolkaswapWalletFacts } from '@/portfolio/dashboard/polkaswapChecks';

const GOOD: PolkaswapWalletFacts = { hasSoraAccount: true, signable: true, runtimeAvailable: true, usableAssets: true, disclaimerAccepted: true };
const RELEASE_4_2_0 = { polkaswap: true, crossChainXcm: false, crossChainSoraBridge: false, crossChainLiberland: false };
const okOf = (result: ReturnType<typeof polkaswapChecks>) => Object.fromEntries(result.checks.map(({ id, ok }) => [id, ok]));

describe('polkaswap checks', () => {
  it('say what the 4.2.0 release says: swaps on, moves off, a SORA account that can sign', () => {
    const result = polkaswapChecks({ facts: GOOD, actions: RELEASE_4_2_0 });

    expect(okOf(result)).toEqual({ account: true, moves: false, swaps: true, disclaimer: true });
    expect(result.blockers).toEqual([]);
  });

  it('count moves as on when any kind of move is on', () => {
    expect(okOf(polkaswapChecks({ facts: GOOD, actions: { ...RELEASE_4_2_0, crossChainLiberland: true } })).moves).toBe(true);
  });

  it('name what keeps the swap screen from working', () => {
    expect(polkaswapChecks({ facts: { ...GOOD, hasSoraAccount: false }, actions: RELEASE_4_2_0 }).blockers).toEqual(['account']);
    expect(polkaswapChecks({ facts: { ...GOOD, signable: false }, actions: RELEASE_4_2_0 }).blockers).toEqual(['signer']);
    expect(polkaswapChecks({ facts: { ...GOOD, usableAssets: false, runtimeAvailable: false }, actions: RELEASE_4_2_0 }).blockers).toEqual(['runtime', 'assets']);
    expect(polkaswapChecks({ facts: GOOD, actions: { ...RELEASE_4_2_0, polkaswap: false } }).blockers).toEqual(['disabled']);
  });

  it('do not block on the disclaimer, which the swap screen asks for, but show it as not accepted', () => {
    const result = polkaswapChecks({ facts: { ...GOOD, disclaimerAccepted: false }, actions: RELEASE_4_2_0 });

    expect(result.blockers).toEqual([]);
    expect(okOf(result).disclaimer).toBe(false);
  });

  it('claim nothing about a wallet that is not the selected one, or before release policy has loaded', () => {
    expect(okOf(polkaswapChecks({ facts: undefined, actions: RELEASE_4_2_0 }))).toEqual({ account: null, moves: false, swaps: true, disclaimer: null });
    expect(okOf(polkaswapChecks({ facts: GOOD, actions: undefined }))).toEqual({ account: true, moves: null, swaps: null, disclaimer: true });
    expect(polkaswapChecks({ facts: undefined, actions: undefined }).blockers).toEqual([]);
  });

  it('count a sign-in account with no SORA balances, or one that cannot sign, as no account', () => {
    expect(okOf(polkaswapChecks({ facts: { ...GOOD, hasSoraAccount: false }, actions: RELEASE_4_2_0 })).account).toBe(false);
    expect(okOf(polkaswapChecks({ facts: { ...GOOD, signable: false }, actions: RELEASE_4_2_0 })).account).toBe(false);
  });
});

describe('derivePolkaswapFacts', () => {
  const SORA = 'SORA Mainnet';
  const XOR = 'b774c386-5cce-454a-a845-1ec0381538ec';
  const row = (name: string, id: string, transferable: string, extra: Record<string, unknown> = {}) => ({ name: name.toLowerCase(), id, transferable, ...extra });
  const group = (...balances: Array<ReturnType<typeof row>>) => ({ balances }) as never;
  const connected = { active: true, disabled: false, networkStatus: 'CONNECTED' };
  const facts = (overrides: Record<string, unknown> = {}) =>
    derivePolkaswapFacts({
      account: {},
      balances: [group(row(SORA, XOR, '5', { isUtility: true })), group(row(SORA, 'val', '2')), group(row('Polkadot', 'dot', '9'))],
      soraNetwork: connected,
      soraNetworkName: SORA,
      soraXorAssetId: XOR,
      showDisclaimer: false,
      ...overrides,
    });

  it('finds a wallet that can swap: SORA rows, XOR for the fee, a second asset, SORA connected, disclaimer accepted', () => {
    expect(facts()).toEqual({ hasSoraAccount: true, signable: true, runtimeAvailable: true, usableAssets: true, disclaimerAccepted: true });
  });

  it('has no SORA account without SORA balance rows, or without a wallet', () => {
    expect(facts({ balances: [group(row('Polkadot', 'dot', '9'))] })).toMatchObject({ hasSoraAccount: false, signable: false });
    expect(facts({ account: undefined })).toMatchObject({ hasSoraAccount: false, signable: false });
  });

  it('cannot sign for a watch-only, injected or hardware account', () => {
    for (const flag of ['isExternal', 'isInjected', 'isHardware']) expect(facts({ account: { [flag]: true } })).toMatchObject({ hasSoraAccount: true, signable: false });
  });

  it('needs XOR to pay the fee, and a second SORA asset', () => {
    expect(facts({ balances: [group(row(SORA, XOR, '0', { isUtility: true })), group(row(SORA, 'val', '2'))] }).usableAssets).toBe(false);
    expect(facts({ balances: [group(row(SORA, XOR, '5', { isUtility: true }))] }).usableAssets).toBe(false);
    expect(facts({ balances: [group(row(SORA, XOR, '5')), group(row(SORA, 'val', '0'))] }).usableAssets).toBe(true);
  });

  it('knows XOR by its asset id when the row is not flagged as the utility asset', () => {
    expect(facts({ balances: [group(row(SORA, XOR.toUpperCase(), '5')), group(row(SORA, 'val', '2'))] }).usableAssets).toBe(true);
  });

  it('needs SORA connected', () => {
    expect(facts({ soraNetwork: undefined }).runtimeAvailable).toBe(false);
    expect(facts({ soraNetwork: { ...connected, disabled: true } }).runtimeAvailable).toBe(false);
    expect(facts({ soraNetwork: { ...connected, active: false } }).runtimeAvailable).toBe(false);
    expect(facts({ soraNetwork: { ...connected, networkStatus: NETWORK_STATUS.DISCONNECTED } }).runtimeAvailable).toBe(false);
  });

  it('reads the disclaimer as accepted when the alert is not showing', () => {
    expect(facts({ showDisclaimer: true }).disclaimerAccepted).toBe(false);
  });
});
