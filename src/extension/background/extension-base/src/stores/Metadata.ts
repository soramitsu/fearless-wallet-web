import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import { IS_EXTENSION } from '@/consts/global';

export default class MetadataStore extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<MetadataDef> {
  constructor() {
    super(EXTENSION_PREFIX && EXTENSION_PREFIX !== 'polkadot{.js}' ? `${EXTENSION_PREFIX}:metadata` : 'metadata');
  }

  public set(key: string, value: MetadataDef, update?: () => void): void {
    super.set(key, value, update);
  }

  public get(key: string, update: (value: MetadataDef) => void): void {
    super.get(key, update);
  }

  public remove(key: string, update?: () => void): void {
    super.remove(key, update);
  }

  public all(update: (key: string, value: MetadataDef) => void): void {
    super.all(update);
  }

  public allMap(update: (value: Record<string, MetadataDef>) => void): void {
    super.allMap(update);
  }
}
