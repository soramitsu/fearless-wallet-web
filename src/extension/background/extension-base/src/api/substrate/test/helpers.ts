import { Option, u32 } from '@polkadot/types';
import { FPNumber } from '@sora-substrate/math';
import type { CodecString } from '@sora-substrate/math';
import type { Exposure } from '@polkadot/types/interfaces/staking';
import type { ValidatorExposure } from './types';

const formatEra = (data: Option<u32>): number => {
  const era = data.unwrap();

  return era.toNumber();
};

const toCodecString = (value: any): CodecString => new FPNumber(value).toCodecString();

const formatValidatorExposure = (codec: Exposure): ValidatorExposure => {
  return {
    total: toCodecString(codec.total),
    own: toCodecString(codec.own),
    others: codec.others.map((item) => ({ who: item.who.toString(), value: toCodecString(item.value) })),
  };
};

export { formatEra, toCodecString, formatValidatorExposure };
