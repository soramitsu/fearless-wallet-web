import { isEthereumAddress } from '@polkadot/util-crypto';
import type State from '@extension-base/background/handlers/State';
import type { EvmRequestPayload, EvmSigningContext } from '@extension-base/services/request-service/types';

// RPC methods define parameter positions. An address-shaped message must never
// decide which key signs it (personal_sign is [message, address]).
export function evmSigningAddress(method: string, params: unknown): string {
  if (
    ![
      'eth_sendTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v1',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
    ].includes(method)
  )
    throw new Error('Unsupported EVM signing method');
  if (!Array.isArray(params)) throw new Error('Invalid EVM signing parameters');
  const candidate =
    method === 'eth_sendTransaction' ? params[0]?.from : method === 'personal_sign' ? params[1] : params[0];
  if (typeof candidate !== 'string' || !isEthereumAddress(candidate)) throw new Error('Invalid EVM signing account');
  return candidate;
}

function chainId(value: unknown): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'number' && !Number.isSafeInteger(value)) ||
    !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(String(value))
  )
    throw new Error('Invalid EVM chain ID');
  const id = BigInt(value);
  if (id <= 0n || id >= 2n ** 256n) throw new Error('Invalid EVM chain ID');
  return id.toString();
}

export async function captureEvmSigningContext(
  state: State,
  url: string,
  method: string,
  params: unknown
): Promise<EvmSigningContext> {
  const address = evmSigningAddress(method, params);
  const auth = await state.getAuthInfo(url);
  if (
    !auth?.isAllowed ||
    !isEthereumAddress(auth.evmAuthorizedAccount || '') ||
    auth.evmAuthorizedAccount.toLowerCase() !== address.toLowerCase()
  )
    throw new Error('EVM account is not authorized for this site');
  const selected = auth.currentEvmNetworkKey?.toLowerCase();
  const network = Object.values(state.networkService.networkMap).find(
    (entry) => selected && (entry.name.toLowerCase() === selected || entry.genesisHash.toLowerCase() === selected)
  );
  if (!network || network.ecosystem !== 'ethereum' || network.disabled) throw new Error('EVM network is unavailable');
  const networkChainId = chainId(network.chainId);
  const data = params as unknown[];
  let claimedChainId: unknown;
  if (method === 'eth_sendTransaction') claimedChainId = (data[0] as { chainId?: unknown }).chainId;
  else if (method.startsWith('eth_signTypedData')) {
    const typed = typeof data[1] === 'string' ? JSON.parse(data[1]) : data[1];
    claimedChainId = typed?.domain?.chainId;
  }
  if (claimedChainId !== undefined && chainId(claimedChainId) !== networkChainId)
    throw new Error('EVM request chain does not match the selected network');
  const keyring = state.keyringService;
  const root = keyring.getSubstrateAddress(address);
  if (keyring.getEthereumAddress(root).toLowerCase() !== address.toLowerCase())
    throw new Error('EVM signing account is unavailable');
  const account = [...keyring.getAllAccounts(), ...keyring.getAddresses()].find((entry) => entry.address === root);
  if (!account) throw new Error('EVM signing account is unavailable');
  const native = network.assets.find((asset) => asset.isNative);
  return {
    account: { address, name: account.meta.name, isMobile: keyring.isMobileAccount(root) },
    network: {
      name: network.name,
      chainId: networkChainId,
      genesisHash: network.genesisHash,
      ...(native ? { symbol: native.symbol, decimals: native.precision } : {}),
    },
  };
}

export async function validateEvmSigningContext(state: State, request: EvmRequestPayload): Promise<void> {
  const current = await captureEvmSigningContext(state, request.url, request.method, request.data);
  if (JSON.stringify(current) !== JSON.stringify({ account: request.account, network: request.network })) {
    throw new Error('EVM signing context changed; request approval again');
  }
}
