import { assert } from '@polkadot/util';
import KeyringSigner from '@extension-base/signers/KeyringSigner';
import { SignerType } from '@extension-base/background/types/types';
import State from '@extension-base/background/handlers/State';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { ApiProps, ExternalRequestPromise } from '@extension-base/background/types/types';
import type { HandleBasicTx } from '@extension-base/api/evm/transfer';

interface AbstractSignExtrinsicProps {
  address: string;
  apiProps: ApiProps;
  callback: HandleBasicTx;
  extrinsic: SubmittableExtrinsic<'promise'>;
  id?: string;
  password?: string;
  setState?: (promise: ExternalRequestPromise) => void;
  type: SignerType;
}

interface PasswordSignExtrinsicProps extends AbstractSignExtrinsicProps {
  type: SignerType.PASSWORD;
}

interface ExternalSignExtrinsicProps extends AbstractSignExtrinsicProps {
  type: SignerType.MOBILE;
}

type SignExtrinsicProps = PasswordSignExtrinsicProps | ExternalSignExtrinsicProps;

export const signExtrinsic = async (
  { address, apiProps, extrinsic, type }: SignExtrinsicProps,
  state: State
): Promise<void> => {
  const isMobile = type === SignerType.MOBILE;
  const keyPair = state.keyringService.getPair(address);

  if (!isMobile) assert(keyPair, 'Unable to find pair');

  const nonce = (await apiProps.api?.rpc.system.accountNextIndex(address)) as unknown as number;
  const registry = apiProps.api!.registry;
  const signer = new KeyringSigner({ registry, keyPair, isMobile });

  await extrinsic.signAsync(address, { signer, nonce });
};
