import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { assertReviewedRecipient } from '@/cross-chain/recipient';
import { validateReviewedCrossChainRequest } from '@/cross-chain/requestValidation';
import { createAssetKey } from '@/portfolio/assetIdentity';
import { defineReviewedCrossChainRoute, type ReviewedCrossChainExecution } from '@/cross-chain/reviewedRoutes';

// Polkadot SS58 form of the well-known development account //Alice and its public key.
const ALICE = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
const ALICE_HEX = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
const EVM_LOWER = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const EVM_CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const EVM_BAD_CHECKSUM = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

const relayExecution = (receiverKind: 'AccountId32' | 'AccountKey20'): Readonly<ReviewedCrossChainExecution> => ({
  kind: 'relay-native-xcm-v3',
  originChainId: 'origin-chain',
  destinationChainId: 'destination-chain',
  assetXcmId: 'token',
  assetPrecision: 6,
  pallet: 'polkadotXcm',
  call: 'limitedReserveTransferAssets',
  callCandidates: [],
  destinationFee: '0',
  relayNetwork: 'Polkadot',
  destinationParaId: 2000,
  receiverKind,
  assetParents: 0,
  assetInteriors: [],
});

describe('reviewed cross-chain recipient', () => {
  const substrate = relayExecution('AccountId32');
  const evm = relayExecution('AccountKey20');

  it('accepts an exact 32-byte account as SS58 or as hex', () => {
    expect(assertReviewedRecipient(substrate, ALICE)).toBe(ALICE);
    expect(assertReviewedRecipient(substrate, ALICE_HEX)).toBe(ALICE_HEX);
  });

  it.each([
    ['empty string', ''],
    ['undefined', undefined],
    ['a number', 5],
    ['surrounding whitespace', ` ${ALICE}`],
    ['trailing newline', `${ALICE}\n`],
    ['the zero account', `0x${'00'.repeat(32)}`],
    ['a 33-byte key as hex', `0x${'11'.repeat(33)}`],
    ['a 20-byte account as hex', EVM_LOWER],
    ['garbage text', 'not-an-address-at-all'],
    ['a corrupted SS58 checksum', `${ALICE.slice(0, -1)}6`],
  ])('refuses %s for a 32-byte destination account', (_label, value) => {
    expect(() => assertReviewedRecipient(substrate, value)).toThrow('cross_chain_recipient_invalid');
  });

  it('accepts a 20-byte account in lower case or with a valid EIP-55 checksum', () => {
    expect(assertReviewedRecipient(evm, EVM_LOWER)).toBe(EVM_LOWER);
    expect(assertReviewedRecipient(evm, EVM_CHECKSUMMED)).toBe(EVM_CHECKSUMMED);
  });

  it.each([
    ['a mixed-case address with a wrong checksum', EVM_BAD_CHECKSUM],
    ['the zero address', `0x${'00'.repeat(20)}`],
    ['an SS58 address', ALICE],
    ['a 32-byte hex account', ALICE_HEX],
    ['a missing 0x prefix', EVM_LOWER.slice(2)],
    ['an empty string', ''],
  ])('refuses %s for a 20-byte destination account', (_label, value) => {
    expect(() => assertReviewedRecipient(evm, value)).toThrow('cross_chain_recipient_invalid');
  });
});

describe('reviewed cross-chain request grammar', () => {
  const network = (name: string, chainId: string): NetworkJson =>
    ({
      assets: [{ id: 'token', precision: 6, symbol: 'USDT' }],
      chainId,
      ecosystem: 'substrate',
      name,
      xcm: {
        availableAssets: [{ id: 'token', symbol: 'USDT' }],
        availableDestinations: [],
        xcmVersion: 'v3',
      },
    }) as unknown as NetworkJson;

  const origin = network('Origin', 'origin-chain');
  const destination = network('Destination', 'destination-chain');
  origin.xcm!.availableDestinations = [
    { assets: [{ id: 'token', symbol: 'USDT' }] as never, bridgeParachainId: '', chainId: 'destination-chain' },
  ];
  const route = defineReviewedCrossChainRoute({
    providerId: 'wallet-xcm',
    originChainId: 'origin-chain',
    destinationChainId: 'destination-chain',
    originEcosystem: 'substrate',
    destinationEcosystem: 'substrate',
    originAssetId: 'token',
    assetKeyAssetId: 'token',
    originXcmAssetId: 'token',
    destinationXcmAssetId: 'token',
    symbol: 'USDT',
    precision: 6,
    minimum: null,
    execution: relayExecution('AccountId32') as never,
  });
  const tokenBalance = {
    balances: [{ id: 'token', name: 'Origin', symbol: 'USDT', transferable: '1000' }],
    groupId: 'token',
    icon: 'usdt',
    mainNetwork: 'Origin',
    providers: [],
    relayChain: 'polkadot',
    symbol: 'USDT',
    tokenName: 'USDT',
  } as unknown as TokenGroup;
  const valid = {
    amount: '5',
    assetId: 'token',
    assetKey: createAssetKey({ ecosystem: 'substrate', chainId: 'origin-chain', assetId: 'token' }),
    destination,
    origin,
    providerId: 'wallet-xcm' as const,
    requireAmount: true,
    reviewedRoutes: [route],
    routeId: route.id,
    to: ALICE,
    tokenBalance,
  };

  it('accepts a plain decimal amount with a valid recipient', () => {
    expect(validateReviewedCrossChainRequest(valid).routeId).toBe(route.id);
    expect(validateReviewedCrossChainRequest({ ...valid, amount: '5.123456' }).routeId).toBe(route.id);
    expect(validateReviewedCrossChainRequest({ ...valid, amount: '5.' }).routeId).toBe(route.id);
  });

  it.each(['0x10', '0b11', '1,5', '1e3', '1.2.3', '1 000', '-1', '+1', '1_0', '.5', 'Infinity', 'NaN'])(
    'refuses the non-decimal amount %s',
    (amount) => {
      expect(() => validateReviewedCrossChainRequest({ ...valid, amount })).toThrow('cross_chain_amount_invalid');
    }
  );

  it('refuses more decimals than the asset has instead of truncating them silently', () => {
    expect(() => validateReviewedCrossChainRequest({ ...valid, amount: '5.1234567' })).toThrow(
      'cross_chain_amount_precision_exceeded'
    );
  });

  it('refuses an amount that is zero', () => {
    expect(() => validateReviewedCrossChainRequest({ ...valid, amount: '0' })).toThrow('cross_chain_amount_invalid');
    expect(() => validateReviewedCrossChainRequest({ ...valid, amount: '0.000000' })).toThrow(
      'cross_chain_amount_invalid'
    );
  });

  it.each([undefined, '', ' ', `0x${'00'.repeat(32)}`, `0x${'11'.repeat(33)}`])(
    'refuses a priced or signed request without a usable recipient (%s)',
    (to) => {
      expect(() => validateReviewedCrossChainRequest({ ...valid, to })).toThrow('cross_chain_recipient_invalid');
    }
  );

  it('does not demand a recipient while no amount is being priced', () => {
    expect(
      validateReviewedCrossChainRequest({ ...valid, amount: undefined, requireAmount: false, to: undefined }).routeId
    ).toBe(route.id);
  });
});
