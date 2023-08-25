// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { state } from '@extension-base/background/handlers';
import { ChainRegistry } from '@extension-base/types';
import type { Asset } from '@extension-base/types';

export const cacheRegistryMap: Record<string, ChainRegistry> = {};

export function getAssetInfo(assetId: string): Asset {
  return state.assetsMap.find(({ id }) => id === assetId)!;
}
