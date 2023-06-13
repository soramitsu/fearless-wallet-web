// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { CustomTokenJson } from '@extension-base/api/evm/types/ether';
import { DEFAULT_EVM_TOKENS } from '@extension-base/api/tokens/evm/defaultEvmToken';

export const DEFAULT_SUPPORTED_TOKENS: CustomTokenJson = {
  ...DEFAULT_EVM_TOKENS,
};
