import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { IS_EXTENSION } from '@/consts/global';

export interface LegacyPasswordPrompt {
  deferredAt: number;
}

/** `fw:legacyPasswordPrompt`: set when the user chose "Skip for now" on the per-account password
 * prompt. Accounts still waiting for their old password stay listed in Account access. */
export default class LegacyPasswordPromptStore extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<LegacyPasswordPrompt> {
  constructor() {
    super(EXTENSION_PREFIX);
  }

  public getAndWait(key: string): Promise<LegacyPasswordPrompt | undefined> {
    return super.getAndWait(key);
  }

  public setAndWait(key: string, value: LegacyPasswordPrompt): Promise<void> {
    return super.setAndWait(key, value);
  }

  public remove(key: string, update?: () => void): void {
    super.remove(key, update);
  }
}
