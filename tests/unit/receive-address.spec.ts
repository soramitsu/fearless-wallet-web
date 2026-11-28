import { encodeAddress } from '@polkadot/util-crypto';
import { Address } from '@ton/core';
import { EVM_ADDRESS, SUBSTRATE_ADDRESS, TON_ADDRESS } from '../fixtures/legacy-305/generate';
import type { AccountJson } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { SelectedWallet } from '@/stores/accounts/types';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { receiveAddressForNetwork } from '@/helpers/receiveAddress';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address } from '@/util/iroha';
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));

const wallet = {
  address: SUBSTRATE_ADDRESS, ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate,
  name: 'Main', isSubstrate: true, isTon: false, hasEthereum: false,
} satisfies SelectedWallet;
const solana = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const mainnetBtc = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const testnetBtc = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const network = (ecosystem: NetworkJson['ecosystem'], chainId = 'chain') =>
  ({ ecosystem, chainId, name: 'Registry chain', addressPrefix: 2 }) as NetworkJson;
const accountWith = (ecosystem: WalletEcosystem, address: string, chainId?: string): AccountJson => {
  const universalWallet = buildUniversalWalletKeyringMeta({ address: wallet.address, meta: wallet });
  universalWallet.publicAccounts.push({ accountId: ecosystem, ecosystem, address, chainId, isDefault: true });
  return { ...wallet, universalWallet };
};

describe('the receiving address for a network', () => {
  it('encodes the wallet’s public key with the chain’s SS58 prefix', () => {
    expect(receiveAddressForNetwork(wallet, undefined, network('substrate'))).toBe(encodeAddress(SUBSTRATE_ADDRESS, 2));
    expect(receiveAddressForNetwork({ ...wallet, address: 'incorrect' }, undefined, network('substrate'))).toBe('');
  });

  it('resolves EVM networks by registry ecosystem and supports standalone and universal accounts', () => {
    expect(receiveAddressForNetwork(wallet, accountWith(WalletEcosystem.Evm, EVM_ADDRESS), network('ethereumBased'))).toBe(EVM_ADDRESS);
    const evm = { ...wallet, address: EVM_ADDRESS, walletEcosystem: WalletEcosystem.Evm };
    expect(receiveAddressForNetwork(evm, undefined, network('ethereum'))).toBe(EVM_ADDRESS);
    expect(receiveAddressForNetwork(evm, undefined, network('substrate'))).toBe('');
  });

  it('uses a Solana account and rejects an incompatible wallet or stale field', () => {
    expect(receiveAddressForNetwork(wallet, accountWith(WalletEcosystem.Solana, solana), network('solana'))).toBe(solana);
    expect(receiveAddressForNetwork({ ...wallet, solanaAddress: SUBSTRATE_ADDRESS }, undefined, network('solana'))).toBe('');
    expect(receiveAddressForNetwork(wallet, undefined, network('ethereum'))).toBe('');
  });

  it('requires a Bitcoin address for the selected network', () => {
    const bitcoin = { ...wallet, bitcoinAddress: mainnetBtc };
    expect(receiveAddressForNetwork(bitcoin, undefined, network('bitcoin', 'bitcoin:mainnet'))).toBe(mainnetBtc);
    expect(receiveAddressForNetwork(bitcoin, undefined, network('bitcoin', 'bitcoin:testnet'))).toBe('');
    const account = accountWith(WalletEcosystem.Bitcoin, testnetBtc, 'bitcoin:testnet');
    expect(receiveAddressForNetwork(bitcoin, account, network('bitcoin', 'bitcoin:testnet'))).toBe(testnetBtc);
  });

  it('uses the TON member of a universal wallet and sets the test-only flag on testnet', () => {
    const account = accountWith(WalletEcosystem.Ton, TON_ADDRESS);
    expect(receiveAddressForNetwork(wallet, account, network('ton', '-239'))).toBe(TON_ADDRESS);
    const testnet = receiveAddressForNetwork(wallet, account, network('ton', '-3'));
    expect(Address.parseFriendly(testnet)).toMatchObject({ isTestOnly: true, isBounceable: false });
    expect(Address.parse(testnet).equals(Address.parse(TON_ADDRESS))).toBe(true);
    expect(receiveAddressForNetwork(wallet, accountWith(WalletEcosystem.Ton, testnet), network('ton', '-239'))).toBe('');
  });

  it('uses the requested Iroha discriminant and rejects unrecognized chains', () => {
    const key = '01'.repeat(32);
    const nexus = network('iroha', UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId);
    const taira = network('iroha', UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId);
    const tairaAddress = encodeIrohaI105Address(key, 'taira');
    const account = accountWith(WalletEcosystem.Iroha, tairaAddress, taira.chainId);
    expect(receiveAddressForNetwork(wallet, account, taira)).toBe(tairaAddress);
    expect(receiveAddressForNetwork(wallet, account, nexus)).toBe('');
    expect(receiveAddressForNetwork({ ...wallet, irohaPublicKeyHex: key }, account, nexus)).toBe(encodeIrohaI105Address(key, 'nexus'));
    expect(receiveAddressForNetwork({ ...wallet, irohaPublicKeyHex: key }, account, network('iroha', 'unrecognized'))).toBe('');
  });
});
