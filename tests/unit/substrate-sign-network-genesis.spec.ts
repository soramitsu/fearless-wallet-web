import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signExtrinsic } from '@extension-base/api/substrate/shared/signExtrinsic';
import { makeTransfer } from '@extension-base/api/substrate/transfer';
import type State from '@extension-base/background/handlers/State';

const mocks = vi.hoisted(() => ({ sendExtrinsic: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@extension-base/signers/KeyringSigner', () => ({
  default: class {
    constructor(readonly options: unknown) {}
  },
}));
vi.mock('@extension-base/api/substrate/shared/sendExtrinsic', () => ({ sendExtrinsic: mocks.sendExtrinsic }));

const KUSAMA = 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe';
const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KSM = 'ksm-asset';
const SENDER = 'EGVQCe73TpFyAZx5uKfE1222XfkT3BSKozjgcqzLBnc5eYo';
const RECIPIENT = 'HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F';

/** Kusama, whose saved node answers with `nodeGenesis`; a null chain id leaves it out of the registry. */
function kusama(nodeGenesis: string, registryChainId: string | null = KUSAMA) {
  const registry = {};
  const extrinsic = { registry, signAsync: vi.fn(async () => undefined) };
  const transferAllowDeath = vi.fn(() => extrinsic);
  const accountNextIndex = vi.fn(async () => 3);
  const api = {
    isReady: Promise.resolve(),
    genesisHash: { toHex: () => `0x${nodeGenesis}` },
    registry,
    rpc: { system: { accountNextIndex } },
    tx: { balances: { transferAllowDeath } },
  };
  const getPair = vi.fn(() => ({ meta: {} }));
  const state = {
    keyringService: {
      isResetting: false,
      walletResetRevision: 0,
      walletAuthenticationRevision: 0,
      getPair,
      getSubstrateAddress: () => SENDER,
    },
    balanceService: {
      getTokenBalance: () => ({ balances: [{ name: 'Kusama', id: KSM, precision: 12, type: 'normal' }] }),
    },
    networkService: {
      assetsMap: [{ id: KSM, symbol: 'KSM', type: 'normal' }],
      getNetworkJson: (name: string) =>
        name.toLowerCase() === 'kusama' && registryChainId !== null ? { name: 'Kusama', chainId: registryChainId } : undefined,
    },
    getSubstrateApiMap: { kusama: { api } },
  } as unknown as State;

  return { api, extrinsic, transferAllowDeath, accountNextIndex, getPair, state };
}

const sendFiveKsm = (state: State, callback = vi.fn()) =>
  makeTransfer({ amount: '5', assetId: KSM, callback, from: SENDER, isMobile: false, networkKey: 'Kusama', state, to: RECIPIENT });

describe('Substrate signing checks the network genesis', () => {
  beforeEach(() => mocks.sendExtrinsic.mockReset());

  it('refuses a Kusama send through a node that is a Polkadot node before the key or nonce is used', async () => {
    const { accountNextIndex, extrinsic, getPair, state, transferAllowDeath } = kusama(POLKADOT);
    const callback = vi.fn();

    await expect(sendFiveKsm(state, callback)).rejects.toThrow('substrate_network_genesis_mismatch');

    // 5 KSM in Kusama planck: on Polkadot these units would be 500 DOT.
    expect(transferAllowDeath).toHaveBeenCalledWith(RECIPIENT, '5000000000000');
    expect(getPair).not.toHaveBeenCalled();
    expect(accountNextIndex).not.toHaveBeenCalled();
    expect(extrinsic.signAsync).not.toHaveBeenCalled();
    expect(mocks.sendExtrinsic).not.toHaveBeenCalled();
    // The background handler reports the rejection to the popup.
    expect(callback).not.toHaveBeenCalled();
  });

  it('signs and sends when the node reports the network genesis, in any letter case', async () => {
    const { extrinsic, state } = kusama(KUSAMA, KUSAMA.toUpperCase());

    await sendFiveKsm(state);

    expect(extrinsic.signAsync).toHaveBeenCalledWith(SENDER, { signer: expect.anything(), nonce: 3 });
    expect(mocks.sendExtrinsic).toHaveBeenCalledOnce();
  });

  it('refuses a network the registry does not list', async () => {
    const { extrinsic, state } = kusama(KUSAMA, null);

    await expect(sendFiveKsm(state)).rejects.toThrow('substrate_network_genesis_mismatch');
    expect(extrinsic.signAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['an EVM chain id', '1'],
    ['an empty chain id', ''],
  ])('refuses %s', async (_name, chainId) => {
    const { api, extrinsic, state } = kusama(KUSAMA);

    await expect(
      signExtrinsic({ address: SENDER, apiProps: { api } as never, chainId, extrinsic: extrinsic as never, isMobile: false }, state)
    ).rejects.toThrow('substrate_network_genesis_mismatch');
    expect(extrinsic.signAsync).not.toHaveBeenCalled();
  });

  it('refuses while the node has not reported its genesis', async () => {
    const { api, extrinsic, getPair, state } = kusama(KUSAMA);
    Object.defineProperty(api, 'genesisHash', {
      get: () => {
        throw new Error('Api interface not available');
      },
    });

    await expect(
      signExtrinsic({ address: SENDER, apiProps: { api } as never, chainId: KUSAMA, extrinsic: extrinsic as never, isMobile: false }, state)
    ).rejects.toThrow('substrate_network_genesis_mismatch');
    expect(getPair).not.toHaveBeenCalled();
    expect(extrinsic.signAsync).not.toHaveBeenCalled();
  });

  it('refuses an extrinsic built through another connection', async () => {
    const { api, extrinsic, state } = kusama(KUSAMA);
    const otherConnection = { ...extrinsic, registry: {} };

    await expect(
      signExtrinsic(
        { address: SENDER, apiProps: { api } as never, chainId: KUSAMA, extrinsic: otherConnection as never, isMobile: false },
        state
      )
    ).rejects.toThrow('substrate_network_genesis_mismatch');
    expect(otherConnection.signAsync).not.toHaveBeenCalled();
  });
});
