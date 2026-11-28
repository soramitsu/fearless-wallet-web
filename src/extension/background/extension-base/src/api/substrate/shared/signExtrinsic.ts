import { captureWalletResetGuard } from '@extension-base/api/walletResetGuard';
import KeyringSigner from '@extension-base/signers/KeyringSigner';
import type State from '@extension-base/background/handlers/State';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { ApiProps } from '@extension-base/background/types/types';

interface SignExtrinsicProps {
  address: string;
  apiProps: ApiProps;
  /** The registry chainId of the network the extrinsic is for: its genesis hash without 0x. */
  chainId: string;
  extrinsic: SubmittableExtrinsic<'promise'>;
  isMobile: boolean;
  finalGuard?: () => void;
}

/**
 * The extrinsic is signed for the genesis of the node it was built with. A node of another chain (a wrong custom or
 * registry node) would have an amount encoded with this network's decimals move that chain's funds instead.
 */
function assertNetworkGenesis({ api }: ApiProps, chainId: string, extrinsic: SubmittableExtrinsic<'promise'>): void {
  let genesisHash: string | undefined;

  try {
    genesisHash = api?.genesisHash.toHex().toLowerCase();
  } catch {
    // The node has not reported it yet.
  }

  // Built through another connection, the extrinsic would carry that connection's genesis instead.
  if (
    !/^[0-9a-f]{64}$/i.test(chainId) ||
    genesisHash !== `0x${chainId.toLowerCase()}` ||
    extrinsic.registry !== api?.registry
  )
    throw new Error('substrate_network_genesis_mismatch');
}

export const signExtrinsic = async (
  { address, apiProps, chainId, extrinsic, isMobile, finalGuard }: SignExtrinsicProps,
  state: State
): Promise<void> => {
  const resetGuard = captureWalletResetGuard(state);
  const assertCurrent = () => { resetGuard(); finalGuard?.(); };
  assertCurrent();
  assertNetworkGenesis(apiProps, chainId, extrinsic);
  const keyPair = state.keyringService.getPair(address);

  const nonce = (await apiProps.api?.rpc.system.accountNextIndex(address)) as unknown as number;
  const registry = apiProps.api!.registry;
  const signer = new KeyringSigner({ registry, keyPair, isMobile, finalGuard: assertCurrent });

  assertCurrent();
  await extrinsic.signAsync(address, { signer, nonce });
  assertCurrent();
};
