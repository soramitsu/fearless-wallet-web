import { decodeAddress, isEthereumAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import type { SessionTypes } from '@walletconnect/types';

type SessionReader = {
  getSession(topic: string): SessionTypes.Struct;
  getSessionRevision(topic: string): number;
};
type Intent = { topic: string; method: string; address: string; chainId?: string };

export type MobileSigningContext = {
  topic: string;
  revision: number;
  method: string;
  chainId: string;
  identity: string;
  expiry: number;
  peer: SessionTypes.Struct['peer'];
  namespaces: SessionTypes.Namespaces;
};

function identity(namespace: string, address: string): string {
  if (namespace === 'eip155') {
    if (!isEthereumAddress(address)) throw new Error('Invalid mobile EVM account');
    return address.toLowerCase();
  }
  const bytes = decodeAddress(address);
  if (![20, 32].includes(bytes.length)) throw new Error('Invalid mobile Substrate account');
  return u8aToHex(bytes);
}

export function captureMobileSigningContext(service: SessionReader, intent: Intent): MobileSigningContext {
  if (typeof intent.topic !== 'string' || !intent.topic) throw new Error('Mobile signing topic is unavailable');
  const namespace = intent.method.startsWith('polkadot_') ? 'polkadot' : 'eip155';
  if (
    ![
      'personal_sign',
      'eth_sign',
      'eth_sendTransaction',
      'eth_signTypedData',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
      'polkadot_signTransaction',
      'polkadot_signMessage',
    ].includes(intent.method) ||
    (!intent.chainId && intent.method !== 'polkadot_signMessage')
  )
    throw new Error('Unsupported mobile signing intent');
  const expected = identity(namespace, intent.address);
  const session = service.getSession(intent.topic);
  if (
    session.topic !== intent.topic ||
    session.acknowledged !== true ||
    !Number.isSafeInteger(session.expiry) ||
    session.expiry <= Date.now() / 1000 ||
    typeof session.peer?.publicKey !== 'string' ||
    !session.peer.publicKey
  )
    throw new Error('Mobile session is unavailable or expired');
  const chains = new Set<string>();
  for (const [key, grant] of Object.entries(session.namespaces)) {
    if (!Array.isArray(grant.methods) || !grant.methods.includes(intent.method) || !Array.isArray(grant.accounts))
      continue;
    for (const account of grant.accounts) {
      const match = /^(eip155|polkadot):([^:]+):([^:]+)$/.exec(account);
      if (!match || match[1] !== namespace) continue;
      const chain = `${namespace}:${match[2]}`;
      if (
        namespace === 'eip155'
          ? !/^[1-9][0-9]*$/.test(match[2]) || BigInt(match[2]) >= 2n ** 256n
          : !/^[0-9a-f]{32}$/.test(match[2])
      )
        continue;
      if (
        (key !== namespace && key !== chain) ||
        (intent.chainId && intent.chainId !== chain) ||
        (grant.chains !== undefined && (!Array.isArray(grant.chains) || !grant.chains.includes(chain)))
      )
        continue;
      try {
        if (identity(namespace, match[3]) === expected) chains.add(chain);
      } catch {
        /* Invalid account grants cannot authorize. */
      }
    }
  }
  if (!chains.size) throw new Error('Mobile method, chain and account are not authorized');
  // Raw bytes have no chain binding. Select a stable, approved transport route;
  // never infer a transaction or an unapproved chain from those bytes.
  const chainId = [...chains].sort()[0];
  return structuredClone({
    topic: intent.topic,
    revision: service.getSessionRevision(intent.topic),
    method: intent.method,
    chainId,
    identity: expected,
    expiry: session.expiry,
    peer: session.peer,
    namespaces: session.namespaces,
  });
}

export function validateMobileSigningContext(
  service: SessionReader,
  context: MobileSigningContext,
  intent: Intent
): void {
  if (!context || JSON.stringify(captureMobileSigningContext(service, intent)) !== JSON.stringify(context))
    throw new Error('Mobile signing session changed; request approval again');
}
