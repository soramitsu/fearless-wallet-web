import { u8aEq, u8aToHex } from '@polkadot/util';
import { blake2AsU8a, decodeAddress, ethereumEncode } from '@polkadot/util-crypto';
import { captureMobileSigningContext } from '@extension-base/services/wallet-connect-service/mobileSigningContext';
import type { MobileSigningContext } from '@extension-base/services/wallet-connect-service/mobileSigningContext';
import type State from '@extension-base/background/handlers/State';
import type { AccountJson, RequestSign, SignRequest } from '@extension-base/background/types/types';
import type { KeyringPair } from '@subwallet/keyring/types';

type SigningKey = { type: KeyringPair['type']; publicKey: string; identity: string };
export type SubstrateSigningAccount = {
  address: string;
  identity: string;
  name: string;
  kind: 'local' | 'mobile' | 'external';
  isExternal: boolean;
  isHardware: boolean;
  wcTopic: string | null;
  genesisHash: string | null;
  ecosystem: string | null;
  key: SigningKey | null;
  mobileSession: MobileSigningContext | null;
};

function identity(address: string): Uint8Array {
  const bytes = decodeAddress(address);
  if (![20, 32].includes(bytes.length)) throw new Error('Unsupported Substrate signing account');
  return bytes;
}

function signingKey(pair: KeyringPair | null, expected: Uint8Array): SigningKey {
  if (!pair || !['sr25519', 'ed25519', 'ecdsa', 'ethereum'].includes(pair.type))
    throw new Error('Substrate signing key is unavailable');
  const publicKey = pair.publicKey;
  const asymmetric = pair.type === 'ecdsa' || pair.type === 'ethereum';
  if (!(asymmetric ? [33, 65] : [32]).includes(publicKey.length))
    throw new Error('Substrate signing public key is invalid');
  const derived =
    pair.type === 'ethereum'
      ? identity(ethereumEncode(publicKey))
      : pair.type === 'ecdsa'
        ? blake2AsU8a(publicKey)
        : publicKey;
  if (!u8aEq(derived, expected) || !u8aEq(identity(pair.address), expected) || !u8aEq(pair.addressRaw, expected))
    throw new Error('Substrate signing key does not match the reviewed account');
  return { type: pair.type, publicKey: u8aToHex(publicKey), identity: u8aToHex(expected) };
}

export function captureSubstrateSigningAccount(
  state: State,
  request: RequestSign,
  account: AccountJson
): SubstrateSigningAccount {
  const expected = identity(account.address);
  if (!u8aEq(identity(request.payload.address), expected))
    throw new Error('Substrate payload account does not match the reviewed account');
  const records = state.keyringService.getAllAccounts().filter((entry) => {
    try {
      return u8aEq(identity(entry.address), expected);
    } catch {
      return false;
    }
  });
  if (records.length !== 1) throw new Error('Substrate signing account is missing or ambiguous');
  const record = records[0];
  if (!record.publicKey || !u8aEq(record.publicKey, expected))
    throw new Error('Substrate account record identity is invalid');
  const meta = record.meta;
  if (
    meta.genesisHash &&
    'genesisHash' in request.payload &&
    (typeof meta.genesisHash !== 'string' ||
      meta.genesisHash.toLowerCase() !== request.payload.genesisHash.toLowerCase())
  )
    throw new Error('Substrate request does not match the account-bound genesis hash');
  for (const name of ['isMobile', 'isExternal', 'isHardware']) {
    if (meta[name] !== undefined && typeof meta[name] !== 'boolean')
      throw new Error('Substrate account signer classification is invalid');
  }
  const isExternal = meta.isExternal === true,
    isHardware = meta.isHardware === true;
  const kind = meta.isMobile === true ? 'mobile' : isExternal || isHardware ? 'external' : 'local';
  if (
    (kind === 'mobile' && (isExternal || isHardware || typeof meta.wcTopic !== 'string' || !meta.wcTopic)) ||
    (meta.walletEcosystem !== undefined && !['substrate', 'evm'].includes(meta.walletEcosystem))
  )
    throw new Error('Substrate account signer classification is unavailable');
  return {
    address: record.address,
    identity: u8aToHex(expected),
    name: typeof meta.name === 'string' ? meta.name : '',
    kind,
    isExternal,
    isHardware,
    wcTopic: typeof meta.wcTopic === 'string' ? meta.wcTopic : null,
    genesisHash: typeof meta.genesisHash === 'string' ? meta.genesisHash : null,
    ecosystem: meta.walletEcosystem ?? null,
    mobileSession:
      kind === 'mobile'
        ? captureMobileSigningContext(state.walletConnectDappService, {
            topic: meta.wcTopic as string,
            address: request.payload.address,
            method: 'genesisHash' in request.payload ? 'polkadot_signTransaction' : 'polkadot_signMessage',
            ...('genesisHash' in request.payload
              ? { chainId: `polkadot:${request.payload.genesisHash.slice(2, 34).toLowerCase()}` }
              : {}),
          })
        : null,
    key: kind === 'local' ? signingKey(state.keyringService.getPair(record.address), expected) : null,
  };
}

export function validateSubstrateSigningAccount(
  state: State,
  request: Pick<SignRequest, 'request' | 'account' | 'signingAccount'>
): void {
  const current = captureSubstrateSigningAccount(state, request.request, request.account);
  if (!request.signingAccount || JSON.stringify(current) !== JSON.stringify(request.signingAccount))
    throw new Error('Substrate signing account changed; request approval again');
}

export function assertSubstrateSigningPair(
  request: SignRequest,
  pair: KeyringPair | null
): asserts pair is KeyringPair {
  if (
    !request.signingAccount?.key ||
    JSON.stringify(signingKey(pair, identity(request.account.address))) !== JSON.stringify(request.signingAccount.key)
  )
    throw new Error('Substrate signing key changed; request approval again');
}
