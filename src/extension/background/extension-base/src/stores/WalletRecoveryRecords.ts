import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from './BaseExtension';
import BaseWebStore from './BaseWeb';
import { IS_EXTENSION } from '@/consts/global';
import { encodeRecoveryValue } from '@/util/recoveryData';

export type RecoveryRecordSummary = { key: string; name: string; address: string };

export default class WalletRecoveryRecords extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<unknown> {
  constructor() { super(EXTENSION_PREFIX); }

  private async records(): Promise<Record<string, unknown>> {
    let records: Record<string, unknown> = {};
    await super.allMap(values => { records = values; });
    // Enumerate raw wallet records, including unloaded/malformed data. Never
    // include password authority, a password journal, SDK or unrelated secrets.
    return Object.fromEntries(Object.entries(records).filter(([key]) => /^(account|archivedAccount|deletedWallet|ton):/u.test(key)));
  }

  async inventory(): Promise<RecoveryRecordSummary[]> {
    return Object.entries(await this.records()).map(([key, value]) => {
      const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const meta = record.meta && typeof record.meta === 'object' ? record.meta as Record<string, unknown> : {};
      return { key, name: typeof record.name === 'string' ? record.name : typeof meta.name === 'string' ? meta.name : '',
        address: typeof record.address === 'string' ? record.address : '' };
    });
  }

  async export(): Promise<{ json: string }> {
    const records = await this.records();
    const data = encodeRecoveryValue(records);
    return { json: JSON.stringify({ format: 'fearless-wallet-recovery-data', version: 1, data }, null, 2) };
  }
}
