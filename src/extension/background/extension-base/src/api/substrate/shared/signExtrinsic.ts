import { assert } from '@polkadot/util';
import KeyringSigner from '@extension-base/signers/KeyringSigner';
import { SignerType } from '@extension-base/background/types';
import { state } from '@extension-base/background/handlers';
import { BeaconSigner } from '@extension-base/signers/BeaconSigner';
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

export const signExtrinsic = async ({ address, apiProps, extrinsic, type }: SignExtrinsicProps): Promise<void> => {
  const isMobile = type === SignerType.MOBILE;
  const pair = state.keyringService.getPair(address);

  if (!isMobile) assert(pair, 'Unable to find pair');

  const nonce = (await apiProps.api?.rpc.system.accountNextIndex(address)) as unknown as number;
  const registry = apiProps.api!.registry;
  const signer = pair ? new KeyringSigner({ registry, keyPair: pair }) : new BeaconSigner();

  await extrinsic.signAsync(address, { signer, nonce });
};
