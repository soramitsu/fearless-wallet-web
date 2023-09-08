import { assert } from '@polkadot/util';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import KeyringSigner from '@extension-base/signers/KeyringSigner';
import { SignerType } from '@extension-base/background/types/types';
import { keyringService } from '@extension-base/services';
import type { ApiProps, ExternalRequestPromise } from '@extension-base/background/types/types';
import type { HandleBasicTx } from '@extension-base/api/evm/transfer';
import { BeaconSigner } from '@/extension/background/extension-base/src/signers/BeaconSigner';

interface AbstractSignExtrinsicProps {
  address: string;
  apiProps: ApiProps;
  callback: HandleBasicTx;
  extrinsic: SubmittableExtrinsic<'promise'>;
  id?: string;
  password: string;
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

export const signExtrinsic = async ({
  address,
  apiProps,
  extrinsic,
  password,
  type,
}: SignExtrinsicProps): Promise<string | null> => {
  const isMobile = type === SignerType.MOBILE;
  const pair = keyringService.getPair(address);

  if (!isMobile) assert(pair, 'Unable to find pair');

  if (pair?.isLocked) {
    const isUnlock = keyringService.unlockPair(pair, password);

    if (!isUnlock) return 'Invalid password';
  }

  const nonce = (await apiProps.api?.rpc.system.accountNextIndex(address)) as unknown as number;

  const registry = apiProps.api!.registry;
  const signer = pair ? new KeyringSigner({ registry, keyPair: pair }) : new BeaconSigner();

  await extrinsic.signAsync(address, { signer, nonce });

  return null;
};
