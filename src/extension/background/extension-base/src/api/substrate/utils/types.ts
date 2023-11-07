import type { SubmittableExtrinsic } from '@polkadot/api/types';

export type Extrinsic = Nullable<SubmittableExtrinsic<'promise'>>;
