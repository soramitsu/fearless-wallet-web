import { evmSigningAddress } from '@extension-base/services/request-service/handlers/evmSigningContext';
import type State from '@extension-base/background/handlers/State';
import type { SignClientTypes } from '@walletconnect/types';
import type { WalletConnectSigningContext, WalletConnectTransactionRequest } from './types';
import { evmMessageBytes } from '@/util/evmMessageBytes';
import { evmTypedData } from '@/util/evmTypedData';
import { evmTransaction } from '@/util/evmTransaction';

function origin(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('WalletConnect requester origin is unavailable');
  return url.origin;
}

// Proposal namespaces express what a peer asked for. Only the current approved
// session namespace can authorize a method and a complete chain/account tuple.
export function captureWalletConnectSigningContext(
  state: State,
  event: SignClientTypes.EventArguments['session_request']
): WalletConnectSigningContext {
  const {
    topic,
    params: { chainId, request },
  } = event;
  const match = /^eip155:([1-9][0-9]*)$/.exec(chainId);
  if (!match || BigInt(match[1]) >= 2n ** 256n) throw new Error('Invalid WalletConnect EVM chain');
  const address = evmSigningAddress(request.method, request.params);
  const session = state.walletConnectService.getSession(topic);
  if (
    session.topic !== topic ||
    session.acknowledged !== true ||
    !Number.isSafeInteger(session.expiry) ||
    session.expiry <= Date.now() / 1000
  )
    throw new Error('WalletConnect session is unavailable or expired');
  const approved = Object.entries(session.namespaces).some(
    ([key, grant]) =>
      (key === 'eip155' || key === chainId) &&
      grant.methods.includes(request.method) &&
      (!grant.chains || grant.chains.includes(chainId)) &&
      grant.accounts.some((account) => account.toLowerCase() === `${chainId}:${address}`.toLowerCase())
  );
  if (!approved) throw new Error('WalletConnect method, chain and account are not authorized');
  const requester = origin(session.peer.metadata.url);
  if (!session.peer.publicKey) throw new Error('WalletConnect peer identity is unavailable');
  const verified = event.verifyContext?.verified;
  if (
    verified?.isScam ||
    verified?.validation === 'INVALID' ||
    (verified?.validation === 'VALID' && origin(verified.origin) !== requester)
  )
    throw new Error('WalletConnect requester verification does not match the session');

  const networks = Object.values(state.networkService.networkMap).filter(
    (entry) => entry.chainId === match[1] && entry.ecosystem === 'ethereum' && !entry.disabled
  );
  if (networks.length !== 1) throw new Error('WalletConnect network is unavailable or ambiguous');
  const network = networks[0];
  const root = state.keyringService.getSubstrateAddress(address);
  if (state.keyringService.getEthereumAddress(root).toLowerCase() !== address.toLowerCase())
    throw new Error('WalletConnect signing account is unavailable');
  const account = [...state.keyringService.getAllAccounts(), ...state.keyringService.getAddresses()].find(
    (entry) => entry.address === root
  );
  if (!account) throw new Error('WalletConnect signing account is unavailable');
  if (request.method === 'personal_sign' || request.method === 'eth_sign')
    evmMessageBytes(request.method, request.params);
  const typed = request.method.startsWith('eth_signTypedData')
    ? evmTypedData(request.method, request.params)
    : undefined;
  const tx = request.method === 'eth_sendTransaction' ? evmTransaction(request.params[0]) : undefined;
  const claimed = typed?.domain.chainId ?? tx?.chainId;
  if (claimed !== undefined && BigInt(claimed) !== BigInt(match[1]))
    throw new Error('WalletConnect request chain does not match the session');
  const native = network.assets.find((asset) => asset.isNative);
  return {
    session: {
      topic,
      peerPublicKey: session.peer.publicKey,
      origin: requester,
      revision: state.walletConnectService.getSessionRevision(topic),
    },
    account: { address, name: account.meta.name, isMobile: state.keyringService.isMobileAccount(root) },
    network: {
      name: network.name,
      chainId: match[1],
      genesisHash: network.genesisHash,
      provider: network.currentProvider,
      ...(native ? { symbol: native.symbol, decimals: native.precision } : {}),
    },
  };
}

export function validateWalletConnectSigningContext(
  state: State,
  request: WalletConnectTransactionRequest
): WalletConnectSigningContext {
  if (!request.context) throw new Error('WalletConnect request needs a new approval context');
  const current = captureWalletConnectSigningContext(state, request);
  if (JSON.stringify(current) !== JSON.stringify(request.context))
    throw new Error('WalletConnect context changed; request approval again');
  return current;
}
