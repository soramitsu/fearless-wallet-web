import { describe, expect, it, vi } from 'vitest';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';
import type { RequestTypes } from '@extension-base/background/types/types';

vi.mock('@/consts/global', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/consts/global')>(), IS_EXTENSION: true, IS_EXTENSION_SMOKE: false,
}));
vi.mock('@sora-substrate/util', () => ({}));
vi.mock('@extension-base/api/evm/transfer', () => ({}));
vi.mock('@extension-base/api/bitcoin/transfer', () => ({}));
vi.mock('@extension-base/api/iroha/transfer', () => ({}));
vi.mock('@extension-base/api/iroha/productionTransferCodec', () => ({}));
vi.mock('@extension-base/api/solana/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/sora', () => ({}));
vi.mock('@extension-base/api/substrate/crossChain', () => ({}));
vi.mock('@extension-base/api/substrate/typeRegistry', () => ({}));
vi.mock('@extension-base/api/ton/transfer', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/utils', () => ({ getEip155MessageAddress: () => 'old-evm' }));
vi.mock('@extension-base/services/wallet-connect-service/consts', () => ({}));
vi.mock('@extension-base/services/request-service/handlers/solanaSigning', () => ({}));
vi.mock('@extension-base/services/polkamarkt-service', () => ({}));
vi.mock('@extension-base/background/helpers/balance', () => ({}));
vi.mock('@extension-base/background/helpers', () => ({}));
vi.mock('@extension-base/background/handlers/utils', () => ({}));
vi.mock('@/helpers', () => ({}));
vi.mock('@/consts/currencies', () => ({}));
vi.mock('@/consts/networks', () => ({ ALL_NETWORKS: 'all' }));
vi.mock('@/cross-chain/requestValidation', () => ({}));
vi.mock('@/defi/polkaswapExecutionGuard', () => ({}));
vi.mock('@extension-base/const', () => ({}));
vi.mock('@extension-base/background/handlers/ExtensionBase', () => ({
  default: class { constructor(protected state: State) {} },
}));

function setup() {
  const old = { address: 'old-root', meta: { ethereumAddress: 'old-evm', solanaAddress: 'old-solana' } };
  const fresh = { address: 'fresh-root', meta: { walletSecurityGeneration: 1 } };
  const unlockPair = vi.fn();
  const makeStaking = vi.fn().mockResolvedValue({ status: true });
  const sign = vi.fn();
  const queued = { account: { address: old.address, publicKey: 'old-solana' }, method: 'personal_sign', data: [], request: { sign } };
  const state = {
    getAccountAddress: () => old.address,
    keyringService: { getAllAccounts: () => [old, fresh], tonKeyring: { getAccounts: () => [] }, unlockPair },
    requestService: { getSignRequest: () => queued },
    stakingService: { makeStaking },
  } as unknown as State;
  return { extension: new Extension(state), state, old, fresh, unlockPair, makeStaking, sign };
}

describe('background recovery-only enforcement', () => {
  it.each([
    ['pri(accounts.makeSwap)', {}],
    ['pri(accounts.makeCrossChain)', { from: 'old-root' }],
    ['pri(staking.makeStaking)', { params: { from: 'old-root' }, type: 'bond' }],
    ['pri(pools.makePool)', {}],
    ['pri(pools.demeter.mutate)', {}],
    ['pri(defi.polkamarkt.mutate)', {}],
    ['pri(walletConnect.request.approve)', { address: 'old-root' }],
    ['pri(walletConnect.session.approve)', { accounts: ['old-evm'] }],
    ['pri(authorize.approve)', { authorizedAccounts: ['old-root'] }],
    ['pri(authorize.update)', { authorizedAccounts: ['old-root'] }],
  ] as const)('rejects %s before accessing signing or network services', async (type, request) => {
    const { extension, unlockPair, sign } = setup();
    await expect(extension.handle('test', type, request as never)).rejects.toThrow('recovery-only');
    expect(unlockPair).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects direct EVM and Solana dApp approvals for old roots', async () => {
    const { extension } = setup();
    await expect(extension.signEvmApprove({ id: 'test' })).rejects.toThrow('recovery-only');
    await expect(extension.signSolanaApprove({ id: 'test' })).rejects.toThrow('recovery-only');
  });

  it('permits normal signing from a fresh root without upgrading other accounts', async () => {
    const { extension, state, fresh, unlockPair, makeStaking } = setup();
    state.getAccountAddress = () => fresh.address;
    const request = { type: 'bond', params: { from: fresh.address } } as RequestTypes['pri(staking.makeStaking)'];
    await expect(extension.makeStaking(request)).resolves.toEqual({ status: true });
    expect(unlockPair).toHaveBeenCalledExactlyOnceWith(fresh.address);
    expect(makeStaking).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('cannot use a fresh request address to authorize staking by a selected old wallet', async () => {
    const { extension, fresh, unlockPair, makeStaking } = setup();
    const request = { type: 'bondExtra', params: { from: fresh.address } } as RequestTypes['pri(staking.makeStaking)'];
    await expect(extension.makeStaking(request)).rejects.toThrow('recovery-only');
    expect(unlockPair).not.toHaveBeenCalled();
    expect(makeStaking).not.toHaveBeenCalled();
  });

  it('checks the resolved EVM signer before approving WalletConnect with a fresh parent', async () => {
    const { extension, state, fresh } = setup();
    const accountExportPrivateKey = vi.fn();
    Object.assign(state.keyringService, {
      getSubstrateAddress: () => fresh.address,
      getEthereumAddress: () => 'old-evm',
      accountExportPrivateKey,
    });
    await expect(extension.wcRequestApprove({ address: fresh.address, topic: 'test' })).rejects.toThrow('recovery-only');
    expect(accountExportPrivateKey).not.toHaveBeenCalled();
  });

  it('keeps explicit transfer and NFT transfer dispatch available for recovery', async () => {
    const { extension, state } = setup();
    const transfer = vi.fn().mockResolvedValue({ status: true });
    Object.assign(extension, { makeTransfer: transfer });
    Object.assign(state, { nftService: { sendNft: transfer } });
    await extension.handle('transfer', 'pri(accounts.makeTransfer)', { from: 'old-root' } as RequestTypes['pri(accounts.makeTransfer)']);
    await extension.handle('nft', 'pri(nft.send)', {} as RequestTypes['pri(nft.send)']);
    expect(transfer).toHaveBeenCalledTimes(2);
  });

  it.each(['unbond', 'redeem', 'payoutRewards'])('permits staking recovery action %s', async (type) => {
    const { extension, old, makeStaking } = setup();
    const request = { type, params: { from: old.address } } as RequestTypes['pri(staking.makeStaking)'];
    await expect(extension.makeStaking(request)).resolves.toEqual({ status: true });
    expect(makeStaking).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each(['bond', 'bondExtra', 'rebond', 'nominate', 'setController', 'setPayee'])('continues to reject staking action %s', async (type) => {
    const { extension, old, makeStaking } = setup();
    const request = { type, params: { from: old.address } } as RequestTypes['pri(staking.makeStaking)'];
    await expect(extension.makeStaking(request)).rejects.toThrow('recovery-only');
    expect(makeStaking).not.toHaveBeenCalled();
  });

  it.each([
    ['pri(pools.makePool)', { type: 'removeLiquidity' }],
    ['pri(pools.demeter.mutate)', { operation: 'withdraw' }],
    ['pri(pools.demeter.mutate)', { operation: 'claim' }],
    ['pri(defi.polkamarkt.mutate)', { action: 'sell' }],
    ['pri(defi.polkamarkt.mutate)', { action: 'claimMarket' }],
    ['pri(defi.polkamarkt.mutate)', { action: 'claimCreatorFees' }],
  ] as const)('dispatches a specific DeFi recovery operation through %s', async (type, request) => {
    const { extension, state } = setup();
    const mutate = vi.fn().mockResolvedValue({ status: true });
    Object.assign(state, {
      actionCapabilityService: { isActionEnabled: () => true },
      soraDisclaimerService: { isAccepted: () => true },
      poolsService: {
        makePool: mutate, mutateDemeter: mutate,
        getLiquiditySigningCapability: () => ({ available: true }),
        getDemeterSigningCapability: () => ({ available: true }),
      },
    });
    Object.assign(extension, { createPolkamarktService: () => ({ mutate }) });
    await expect(extension.handle('recovery', type, request as never)).resolves.toEqual({ status: true });
    expect(mutate).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each([
    ['pri(pools.makePool)', { type: 'addLiquidity' }],
    ['pri(pools.demeter.mutate)', { operation: 'deposit' }],
    ['pri(defi.polkamarkt.mutate)', { action: 'buy' }],
  ] as const)('continues to block new DeFi exposure through %s', async (type, request) => {
    await expect(setup().extension.handle('blocked', type, request as never)).rejects.toThrow('recovery-only');
  });

  it('does not bypass the liquidity kill switch for a recovery withdrawal', async () => {
    const { extension, state } = setup();
    Object.assign(state, { actionCapabilityService: { isActionEnabled: () => false } });
    await expect(extension.makePool({ type: 'removeLiquidity' } as never)).resolves.toMatchObject({
      status: false, errors: [expect.objectContaining({ message: expect.stringContaining('temporarily unavailable') })],
    });
  });

  it('includes standalone pre-update EVM accounts in the UI subscription', () => {
    const { extension, state } = setup();
    Object.assign(state.keyringService, { getPair: () => undefined });
    Object.assign(state, { networkService: { selectedNetworks: {} } });
    const address = `0x${'ab'.repeat(20)}`;
    const account = { json: { address, meta: { name: 'Existing EVM' } }, type: 'ethereum' };
    expect(extension.convertAccounts({ [address]: account } as never)).toEqual([
      expect.objectContaining({ address, ethereumAddress: address, walletEcosystem: 'evm' }),
    ]);
  });
});
