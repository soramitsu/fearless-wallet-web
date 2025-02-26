import { saveAs } from 'file-saver';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@/extension/background/extension-base/src/types';

export const downloadJsonAccount = (fileName: string, json: KeyringPair$Json, meta: FWKeyringMeta = json.meta) => {
  const metaCopy = { ...meta };

  delete metaCopy['ethereumAddress'];
  delete metaCopy['isMasterAccount'];
  delete metaCopy['isMasterPassword'];
  delete metaCopy['isMobile'];

  const jsonSubstrate = JSON.stringify({ ...json, meta: metaCopy });

  const blobSubstrate = new Blob([jsonSubstrate], { type: 'application/json; charset=utf-8' });

  saveAs(blobSubstrate, `${fileName}.json`);
};
