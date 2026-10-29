import { NftService } from '@extension-base/services/nft-service';
import type State from '@extension-base/background/handlers/State';
import type { RequestNftTransfer } from '@extension-base/background/types/types';

vi.mock('@extension-base/stores/Storage', () => ({
  storage: { get: vi.fn(async () => ({})), set: vi.fn() },
}));
vi.mock('@extension-base/api/evm/transfer', () => ({ calcEvmFees: vi.fn() }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ getBalanceItem: vi.fn() }));

const erc721Transfer = 'safeTransferFrom(address,address,uint256)';
const erc1155Transfer = 'safeTransferFrom(address,address,uint256,uint256,bytes)';

function fixture(type: string, failure = false) {
  const wait = vi.fn(async () => ({}));
  const transfer = vi.fn(async () => {
    if (failure) throw new Error('transfer rejected');
    return { hash: '0xtransaction', wait };
  });
  const contract = {
    isApprovedForAll: vi.fn(async () => false),
    setApprovalForAll: vi.fn(async () => ({})),
    [erc721Transfer]: transfer,
    [erc1155Transfer]: transfer,
    connect: vi.fn(),
  };
  contract.connect.mockReturnValue(contract);
  const state = {
    getEvmApi: vi.fn(() => undefined),
    evmContractService: { getContract: vi.fn(async () => contract) },
    keyringService: {
      unlockPair: vi.fn(),
      // Synthetic test key; no account or network access is involved.
      accountExportPrivateKey: vi.fn(() => ({ privateKey: '0x' + '01'.repeat(32) })),
    },
  } as unknown as State;
  const service = new NftService(state);
  vi.spyOn(service, 'checkSend').mockResolvedValue({ fee: '0.001', data: '0x' });
  vi.spyOn(service, 'getNftForActiveNetworks').mockResolvedValue();
  const tx = {
    type,
    from: '0x' + '11'.repeat(20),
    to: '0x' + '22'.repeat(20),
    contract: '0x' + '33'.repeat(20),
    network: 'Ethereum',
    tokenId: '7',
  } as RequestNftTransfer;
  return { contract, service, transfer, tx, wait };
}

describe('NFT transfer authority', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['ERC721', 'ERC1155'])('sends only the requested %s token without granting collection access', async (type) => {
    const { contract, service, transfer, tx } = fixture(type);
    await expect(service.sendNft(tx)).resolves.toMatchObject({ status: true, hash: '0xtransaction' });
    expect(transfer).toHaveBeenCalledExactlyOnceWith(
      ...[tx.from, tx.to, tx.tokenId, ...(type === 'ERC1155' ? [1, '0x'] : [])]
    );
    expect(contract.setApprovalForAll).not.toHaveBeenCalled();
    expect(contract.isApprovedForAll).not.toHaveBeenCalled();
  });

  it('does not pass encoded estimation calldata as ERC1155 receiver data', async () => {
    const { service, transfer, tx } = fixture('ERC1155');
    vi.mocked(service.checkSend).mockResolvedValue({ fee: '0.001', data: '0xdeadbeef' });
    await service.sendNft(tx);
    expect(transfer).toHaveBeenCalledExactlyOnceWith(tx.from, tx.to, tx.tokenId, 1, '0x');
  });

  it('retains the broadcast hash if waiting for confirmation fails', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { service, tx, wait } = fixture('ERC721');
    const error = new Error('confirmation unavailable');
    wait.mockRejectedValueOnce(error);
    await expect(service.sendNft(tx)).resolves.toMatchObject({ status: true, hash: '0xtransaction' });
    await Promise.resolve();
    expect(info).toHaveBeenCalledWith('NFT confirmation unavailable', error);
    expect(service.getNftForActiveNetworks).not.toHaveBeenCalled();
  });

  it('does not send another signed transaction after the transfer fails', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { contract, service, tx } = fixture('ERC721', true);
    await expect(service.sendNft(tx)).resolves.toMatchObject({ status: false });
    expect(contract.setApprovalForAll).not.toHaveBeenCalled();
  });
});
