import { Interface, parseUnits } from 'ethers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NftService } from '@extension-base/services/nft-service';
import ERC721 from '@extension-base/services/evm-contract-service/evm-contracts/ERC721.json';
import ERC1155 from '@extension-base/services/evm-contract-service/evm-contracts/ERC1155.json';
import type State from '@extension-base/background/handlers/State';
import type { NftTx } from '@extension-base/services/nft-service/types';

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } }));
vi.mock('@extension-base/api/evm/transfer', () => ({ calcEvmFees: (price: bigint, base: bigint, gas: bigint) => (price + base) * gas }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ getBalanceItem: (items: Record<string, unknown>, network: string) => items[network] }));
const transfer721 = 'safeTransferFrom(address,address,uint256)';
const transfer1155 = 'safeTransferFrom(address,address,uint256,uint256,bytes)';
function fixture(type = 'ERC721') {
  const tx: NftTx = { type, from: '0x' + '11'.repeat(20), to: '0x' + '22'.repeat(20), contract: '0x' + '33'.repeat(20), network: 'Polygon', tokenId: '7' };
  const contract = { interface: new Interface(type === 'ERC1155' ? ERC1155 : ERC721) };
  const balance = { id: 'native', total: '100', transferable: '1' };
  const api = { getFeeData: vi.fn(async () => ({ maxFeePerGas: parseUnits('10', 'gwei'), gasPrice: null as bigint | null })), estimateGas: vi.fn(async () => 50_000n), provider: { getBlock: vi.fn(async () => ({ baseFeePerGas: parseUnits('4', 'gwei') })) } };
  const state = { getEvmApi: () => ({ api }), evmContractService: { getContract: vi.fn(async () => contract) }, keyringService: { getSubstrateAddress: () => 'wallet', unlockPair: vi.fn(), accountExportPrivateKey: vi.fn() }, networkService: { getNetworkJson: () => ({ assets: [{ id: 'native', symbol: 'matic', isUtility: true }] }) }, balanceService: { getAccountBalance: () => [{ symbol: 'matic', relayChain: 'ethereum', balances: { Polygon: balance } }] } };
  return { service: new NftService(state as unknown as State), state, api, contract, tx, balance };
}
afterEach(() => vi.restoreAllMocks());
describe('NFT fee preparation', () => {
  it.each(['ERC721', 'ERC1155'])('simulates the actual %s transfer against its contract from its owner', async (type) => {
    const { service, api, contract, tx } = fixture(type);
    const result = await service.checkSend(tx);
    expect(result.error).toBeUndefined();
    expect(api.estimateGas).toHaveBeenCalledWith(expect.objectContaining({ from: tx.from, to: tx.contract, value: 0n }));
    const call = contract.interface.parseTransaction({ data: result.data })!;
    expect(call.signature).toBe(type === 'ERC721' ? transfer721 : transfer1155);
    expect([...call.args]).toEqual([tx.from, tx.to, 7n, ...(type === 'ERC1155' ? [1n, '0x'] : [])]);
    expect(result.fee).toBe('0.0005');
  });
  it('uses legacy gasPrice when EIP-1559 pricing is unavailable', async () => {
    const { service, api, tx } = fixture();
    api.getFeeData.mockResolvedValue({ maxFeePerGas: null, gasPrice: parseUnits('2', 'gwei') } as never);
    expect((await service.checkSend(tx)).fee).toBe('0.0001');
  });
  it('does not fund fees from a different asset sharing the native token symbol', async () => {
    const { service, state, balance, tx } = fixture();
    balance.transferable = '0';
    const original = state.balanceService.getAccountBalance();
    vi.spyOn(state.balanceService, 'getAccountBalance').mockReturnValue([
      { symbol: 'matic', relayChain: 'ethereum', balances: { Polygon: { id: '0x-token', total: '100', transferable: '100' } } },
      ...original,
    ]);
    expect((await service.checkSend(tx)).error).toBe('insufficientFunds');
  });
  it('uses spendable balance rather than locked total balance', async () => {
    const { service, balance, tx } = fixture();
    balance.transferable = '0.0001';
    expect((await service.checkSend(tx)).error).toBe('insufficientFunds');
  });
  it('accepts a spendable balance exactly equal to the maximum fee', async () => {
    const { service, balance, tx } = fixture();
    balance.transferable = '0.0005';
    expect((await service.checkSend(tx)).error).toBeUndefined();
  });
  it.each(['rpc', 'pricing', 'gas'])('fails closed when %s cannot produce a usable estimate', async (failure) => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { service, api, tx } = fixture();
    if (failure === 'rpc') api.estimateGas.mockRejectedValue(new Error('offline'));
    if (failure === 'pricing') api.getFeeData.mockResolvedValue({ maxFeePerGas: null, gasPrice: null } as never);
    if (failure === 'gas') api.estimateGas.mockResolvedValue(0n);
    expect((await service.checkSend(tx)).error).toBe('estimationFailed');
  });
  it('rejects an unsupported token standard before unlocking or exporting a key', async () => {
    const { service, state, tx } = fixture('UNKNOWN');
    await expect(service.sendNft(tx as never)).resolves.toMatchObject({ status: false });
    expect(state.keyringService.unlockPair).not.toHaveBeenCalled();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('rejects an invalid recipient before contacting the provider', async () => {
    const { service, api, tx } = fixture();
    expect((await service.checkSend({ ...tx, to: 'not-an-address' })).error).toBe('incorrectRecipient');
    expect(api.estimateGas).not.toHaveBeenCalled();
  });
});
