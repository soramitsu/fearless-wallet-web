// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { CustomTokenJson } from '../evm/types/ether';
import { DEFAULT_EVM_TOKENS } from './evm/defaultEvmToken';

export const DEFAULT_SUPPORTED_TOKENS: CustomTokenJson = {
  ...DEFAULT_EVM_TOKENS,
};
