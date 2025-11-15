import type { u128 } from '@polkadot/types-codec';

/** Minimal subset of ORML account data fields used by the app. */
export type OrmlAccountDataLike = {
  free?: u128;
  reserved?: u128;
  frozen?: u128;
};
