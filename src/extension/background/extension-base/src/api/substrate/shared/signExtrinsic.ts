import KeyringSigner from '@extension-base/signers/KeyringSigner';
import type State from '@extension-base/background/handlers/State';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { ApiProps } from '@extension-base/background/types/types';

interface SignExtrinsicProps {
  address: string;
  apiProps: ApiProps;
  extrinsic: SubmittableExtrinsic<'promise'>;
  isMobile: boolean;
}

export const signExtrinsic = async (
  { address, apiProps, extrinsic, isMobile }: SignExtrinsicProps,
  state: State
): Promise<void> => {
  const keyPair = state.keyringService.getPair(address);

  const nonce = (await apiProps.api?.rpc.system.accountNextIndex(address)) as unknown as number;
  const registry = apiProps.api!.registry;
  const signer = new KeyringSigner({ registry, keyPair, isMobile });

  await extrinsic.signAsync(address, { signer, nonce });
};
