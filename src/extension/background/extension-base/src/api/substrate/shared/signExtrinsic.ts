// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Signer, SubmittableExtrinsic } from '@polkadot/api/types';
import { keyring } from '@polkadot/ui-keyring';
import { assert } from '@polkadot/util';
import { ApiProps, ExternalRequestPromise, SignerType } from '../../../background/types/types';
import KeyringSigner from '../../../signers/KeyringSigner';
import { unlockAccount } from '../../../utils/keyring';
import { HandleBasicTx } from '../../evm/transfer';
import registry from '../typeRegistry';

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
  id: string;
  setState: (promise: ExternalRequestPromise) => void;
  type: SignerType.PASSWORD;
}

type SignExtrinsicProps = PasswordSignExtrinsicProps | ExternalSignExtrinsicProps;

export const signExtrinsic = async ({
  address,
  apiProps,
  extrinsic,
  password,
  type,
}: SignExtrinsicProps): Promise<string | null> => {
  let signer: Signer | undefined;

  if (type === SignerType.PASSWORD) {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    if (pair.isLocked) {
      const passwordError: string | null = unlockAccount(address, password);

      if (passwordError) return passwordError;
    }

    const registry = apiProps.api!.registry;

    signer = new KeyringSigner({ registry, keyPair: pair });
  }

  await extrinsic.signAsync(address, { signer: signer });

  return null;
};
