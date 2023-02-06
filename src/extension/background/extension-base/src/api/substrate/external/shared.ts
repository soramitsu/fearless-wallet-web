// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ApiProps, PrepareExternalRequest, SignerExternal } from '../../../background/types';
import { HandleBasicTx } from '../../evm/transfer';
import { NetworkJson } from '../../evm/types/ether';

export interface ExternalProps extends PrepareExternalRequest {
  apiProps: ApiProps;
  network: NetworkJson;
  callback: HandleBasicTx;
  signerType: SignerExternal;
}
