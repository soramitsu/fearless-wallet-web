import type { TransformAccountPayload } from '@extension-base/background/types/types';
import type { InjectedAccount } from '@polkadot/extension-inject/types';
import type { SingleAddress } from '@subwallet/ui-keyring/observable/types';
import type { KeypairType as InjectedKeypairType } from '@polkadot/util-crypto/types';
import type { IrohaAccountInfo, IrohaChainId, IrohaNetworkKey } from '@extension-base/page/types';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address, parseIrohaI105Address, type IrohaNetworkInput } from '@/util/iroha';

export interface SolanaInjectedAccount {
  address: string;
  name: string;
  publicKey: string;
}

const SOLANA_PUBLIC_KEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const toInjectedKeypairType = (type: SingleAddress['type']): InjectedKeypairType | undefined =>
  type === 'ton' ? undefined : (type as InjectedKeypairType);

const isSolanaPublicKey = (value: unknown): value is string =>
  typeof value === 'string' && SOLANA_PUBLIC_KEY_RE.test(value);

const IROHA_CHAIN_BY_NETWORK: Record<IrohaNetworkKey, IrohaChainId> = {
  nexus: 'sora:nexus',
  taira: 'iroha:taira',
};

const isIrohaNetworkKey = (value: unknown): value is IrohaNetworkKey => value === 'taira' || value === 'nexus';

const isIrohaPublicKeyHex = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:0x)?[0-9a-fA-F]{64}$/.test(value);

const getSolanaAddress = ({
  json: {
    address,
    meta: { solanaAddress, walletEcosystem },
  },
}: SingleAddress): string | undefined => {
  if (isSolanaPublicKey(solanaAddress)) return solanaAddress;
  if (walletEcosystem === WalletEcosystem.Solana && isSolanaPublicKey(address)) return address;

  return undefined;
};

export function transformAccounts({ accounts, accountAuthType }: TransformAccountPayload): InjectedAccount[] {
  const authTypeFilter = ({ type }: SingleAddress): boolean => {
    if (accountAuthType === 'substrate') return type !== 'ethereum';

    if (accountAuthType === 'evm') return type === 'ethereum';

    return true;
  };

  return Object.values(accounts)
    .filter(authTypeFilter)
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map(
      ({
        json: {
          address,
          meta: { name },
        },
        type,
      }): InjectedAccount => ({ address, name, type: toInjectedKeypairType(type) })
    );
}

export function transformAddresses({ accounts, accountAuthType }: TransformAccountPayload): InjectedAccount[] {
  return Object.values(accounts)
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map((item): InjectedAccount => {
      const {
        json: {
          address,
          meta: { name, ethereumAddress },
        },
        type,
      } = item;

      return {
        address: accountAuthType === 'evm' ? (ethereumAddress as string) : address,
        name,
        type: toInjectedKeypairType(type),
        genesisHash: '',
      };
    });
}

export function transformSolanaAccounts({ accounts }: TransformAccountPayload): SolanaInjectedAccount[] {
  return Object.values(accounts)
    .map((account) => {
      const address = getSolanaAddress(account);

      if (!address) return undefined;

      return {
        address,
        publicKey: address,
        name: account.json.meta.name ?? '',
      };
    })
    .filter((account): account is SolanaInjectedAccount => !!account)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function transformIrohaAccounts(
  { accounts }: TransformAccountPayload,
  network: IrohaNetworkKey = 'nexus'
): IrohaAccountInfo[] {
  if (!isIrohaNetworkKey(network)) return [];

  return Object.values(accounts)
    .map((account) => getIrohaAccount(account, network))
    .filter((account): account is IrohaAccountInfo => !!account)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getIrohaAccount(account: SingleAddress, network: IrohaNetworkKey): IrohaAccountInfo | undefined {
  const {
    json: {
      address,
      meta: { irohaAddress, irohaPublicKeyHex, name, walletEcosystem },
    },
  } = account;

  let resolvedAddress: string | undefined;
  let publicKeyHex: string | undefined;

  if (isIrohaPublicKeyHex(irohaPublicKeyHex)) {
    publicKeyHex = irohaPublicKeyHex.replace(/^0x/u, '').toLowerCase();
    resolvedAddress = encodeIrohaI105Address(publicKeyHex, network);
  } else {
    const candidate = typeof irohaAddress === 'string' && irohaAddress.length > 0 ? irohaAddress : address;

    if (walletEcosystem !== WalletEcosystem.Iroha && candidate === address) return undefined;

    try {
      const parsed = parseIrohaI105Address(candidate, network as IrohaNetworkInput);

      publicKeyHex = parsed.publicKeyHex;
      resolvedAddress = parsed.i105;
    } catch {
      return undefined;
    }
  }

  return {
    address: resolvedAddress,
    chain: IROHA_CHAIN_BY_NETWORK[network],
    name: name ?? '',
    network,
    publicKeyHex,
  };
}
