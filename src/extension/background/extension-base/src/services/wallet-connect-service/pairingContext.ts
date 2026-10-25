import { decodeAddress, isEthereumAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { captureSessionSigningContext } from './sessionSigningContext';
import type { NetworkJson } from '@extension-base/types';
import type { SessionTypes, EngineTypes } from '@walletconnect/types';

const methods = {
  polkadot: ['polkadot_signTransaction', 'polkadot_signMessage'],
  eip155: [
    'personal_sign',
    'eth_sendTransaction',
    'eth_sign',
    'eth_signTypedData',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ],
};

export function mobilePairingProposal(networks: NetworkJson[]): EngineTypes.ConnectParams {
  const chains = { polkadot: new Set<string>(), eip155: new Set<string>() };
  for (const network of networks) {
    if (network.disabled) continue;
    if (network.ecosystem === 'ethereum') {
      if (/^[1-9][0-9]*$/.test(network.chainId) && BigInt(network.chainId) < 2n ** 256n)
        chains.eip155.add(`eip155:${network.chainId}`);
    } else if (network.ecosystem === 'substrate' || network.ecosystem === 'ethereumBased') {
      const raw = network.chainId?.replace(/^0x/, '');
      if (!/^[0-9a-fA-F]{64}$/.test(raw)) continue;
      if (network.genesisHash && network.genesisHash.toLowerCase() !== `0x${raw.toLowerCase()}`) continue;
      chains.polkadot.add(`polkadot:${raw.slice(0, 32).toLowerCase()}`);
    }
  }
  if (!chains.polkadot.size) throw new Error('No supported mobile Substrate network is available');
  const optionalNamespaces: EngineTypes.ConnectParams['optionalNamespaces'] = {};
  for (const namespace of ['polkadot', 'eip155'] as const) {
    if (chains[namespace].size)
      optionalNamespaces[namespace] = {
        chains: [...chains[namespace]].sort(),
        methods: [...methods[namespace]],
        events: namespace === 'eip155' ? ['accountsChanged', 'chainChanged'] : [],
      };
  }
  return { requiredNamespaces: {}, optionalNamespaces };
}

type Reader = { getSession(topic: string): SessionTypes.Struct; getSessionRevision(topic: string): number };
export function captureMobilePairingAccount(reader: Reader, approved: SessionTypes.Struct) {
  const live = reader.getSession(approved.topic);
  const snapshot = (session: SessionTypes.Struct) =>
    JSON.stringify({
      topic: session.topic,
      acknowledged: session.acknowledged,
      expiry: session.expiry,
      peer: session.peer,
      namespaces: session.namespaces,
    });
  if (snapshot(live) !== snapshot(approved)) throw new Error('Mobile pairing session changed');
  const roots = new Map<string, string>(),
    evm = new Set<string>();
  const rootChains = new Set<string>(),
    evmChains = new Set<string>();
  for (const [key, grant] of Object.entries(live.namespaces)) {
    const namespace = key.split(':')[0];
    if (namespace !== 'polkadot' && namespace !== 'eip155') continue;
    if (!Array.isArray(grant.accounts) || !Array.isArray(grant.methods)) throw new Error('Invalid mobile grant');
    const method = methods[namespace].find((m) => grant.methods.includes(m));
    if (!method) continue;
    for (const account of grant.accounts) {
      const match = /^(polkadot|eip155):([^:]+):([^:]+)$/.exec(account);
      if (!match || match[1] !== namespace) throw new Error('Invalid mobile account');
      const chainId = `${namespace}:${match[2]}`;
      if ((key !== namespace && key !== chainId) || (grant.chains && !grant.chains.includes(chainId)))
        throw new Error('Invalid mobile account scope');
      captureSessionSigningContext(reader, { topic: live.topic, method, address: match[3], chainId });
      if (namespace === 'eip155') {
        evm.add(match[3].toLowerCase());
        evmChains.add(match[2]);
      } else {
        const bytes = decodeAddress(match[3]);
        // The stored mobile-wallet model has one 32-byte Substrate root. A
        // 20-byte Polkadot account is never used to infer an EIP-155 identity.
        if (bytes.length !== 32) continue;
        roots.set(u8aToHex(bytes), match[3]);
        rootChains.add(match[2]);
      }
    }
  }
  if (roots.size !== 1 || evm.size > 1)
    throw new Error('Mobile pairing requires one Substrate identity and at most one EVM identity');
  return {
    address: [...roots.values()][0],
    ethereumAddress: [...evm][0],
    chains: [...rootChains].sort().concat([...evmChains].sort()),
    name: typeof live.peer.metadata.name === 'string' ? live.peer.metadata.name : 'WalletConnect',
  };
}

export function sameMobileIdentity(left: string, right: string): boolean {
  try {
    if (isEthereumAddress(left) || isEthereumAddress(right))
      return isEthereumAddress(left) && isEthereumAddress(right) && left.toLowerCase() === right.toLowerCase();
    return u8aToHex(decodeAddress(left)) === u8aToHex(decodeAddress(right));
  } catch {
    return false;
  }
}
