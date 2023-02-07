// Copyright 2017-2022 @polkadot/apps-config authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { typesBundleForPolkadot } from '@bifrost-finance/type-definitions';
import type { OverrideBundleDefinition } from '@polkadot/types/types';

export default (typesBundleForPolkadot as { spec: { bifrost: OverrideBundleDefinition } }).spec.bifrost;
