import { Meta } from '@/interfaces/meta';
import type { KeyringPair$Meta, KeyringPair$Json } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';

export function firstCharToUp(string: string) {
  return `${string.charAt(0).toUpperCase()}${string.slice(1)}`;
}

export function getMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as Meta;
}

export function isKeyringPairs$Json(json: KeyringPair$Json | KeyringPairs$Json): json is KeyringPairs$Json {
  return json.encoding.content.includes('batch-pkcs8');
}
