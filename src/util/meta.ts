import { Meta } from '@/interfaces/meta';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';

export function getMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as Meta;
}
