import type { NftSettings } from '@extension-base/services/nft-service/types';
import type { Node, NetworkName, WalletAddress } from '@/interfaces';
import type { HiddenAssets } from '@/stores/accounts/types';
import type { AssetPreference } from '@/portfolio/assetIdentity';
import { isLang, type Lang } from '@/locales/languages';
import { LocalStorage } from '@/controllers/localStorageController';

export type Legacy305Preferences = {
  hiddenIds: string[];
  sequence: string[];
  customSort: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keeps the entries of a stored map whose values parse; anything else in storage is ignored, never rewritten. */
function recordOf<T>(value: unknown, parse: (item: unknown) => T | undefined): Record<string, T> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, parse(item)] as const)
      .filter((entry): entry is readonly [string, T] => entry[1] !== undefined)
  );
}

const parseStringArray = (item: unknown): string[] | undefined =>
  Array.isArray(item) ? item.filter((id): id is string => typeof id === 'string') : undefined;
const parseString = (item: unknown): string | undefined => (typeof item === 'string' ? item : undefined);
const parseBoolean = (item: unknown): boolean | undefined => (typeof item === 'boolean' ? item : undefined);
const parseAssetPreference = (item: unknown): AssetPreference | undefined =>
  item === 'auto' || item === 'shown' || item === 'hidden' ? item : undefined;
const parseAssetPreferences = (item: unknown): Record<string, AssetPreference> | undefined =>
  isRecord(item) ? recordOf(item, parseAssetPreference) : undefined;

const ownValue = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

class AccountController {
  private readonly lsAccount = new LocalStorage('account_');
  private readonly langStorageName = 'lang';
  private readonly sequenceAssetsStorageName = 'sequence-assets';
  private readonly autoSelectNodesStorageName = 'auto-select-nodes';
  private readonly activeNodeStorageName = 'active-node';
  private readonly customNodesStorageName = 'custom-nodes';
  private readonly customSort = 'custom-sort';
  private readonly assetTipData = 'asset-tip-data';
  private readonly hiddenAssets = 'hidden-assets';
  private readonly assetPreferences = 'asset-preferences-v1';
  private readonly agreeSwapDisclaimer = 'agree-swap-disclaimer';
  private readonly hidingPoolsBanner = 'hiding-pools-banner';
  private readonly hiddenWarningNetworks = 'hidden-warning-networks';
  private readonly nftSettings = 'nftSettings';

  public setAssetTipData(count: number, time: number) {
    this.lsAccount.set(this.assetTipData, { count, time });
  }

  public getHiddenWarningNetworks(): string[] {
    const array = this.lsAccount.get<string[]>(this.hiddenWarningNetworks);

    return array.value ?? [];
  }

  public setHiddenWarningNetwork(networkName: NetworkName): void {
    const array = this.getHiddenWarningNetworks();

    this.lsAccount.set(this.hiddenWarningNetworks, [...array, networkName]);
  }

  public getHidingPoolsBanner(): boolean {
    const { value } = this.lsAccount.get<boolean>(this.hidingPoolsBanner);

    return value ?? false;
  }

  public setHidingPoolsBanner(): void {
    this.lsAccount.set(this.hidingPoolsBanner, true);
  }

  public getAgreeSwapDisclaimer(): boolean {
    const { value } = this.lsAccount.get(this.agreeSwapDisclaimer);

    return value !== undefined;
  }

  public setAgreeSwapDisclaimer(): void {
    this.lsAccount.set(this.agreeSwapDisclaimer, true);
  }

  public clearAgreeSwapDisclaimer(): void {
    this.lsAccount.remove(this.agreeSwapDisclaimer);
  }

  public getLang(): Lang {
    const lang = this.lsAccount.get<unknown>(this.langStorageName);

    return isLang(lang.value) ? lang.value : 'en-EN';
  }

  public setLang(lang: Lang): void {
    this.lsAccount.set(this.langStorageName, lang);
  }

  public setNftSettings(settings: NftSettings) {
    this.lsAccount.set(this.nftSettings, settings);
  }

  public getNftSettings(): Partial<NftSettings> {
    return this.lsAccount.get<Partial<NftSettings>>(this.nftSettings).value ?? {};
  }

  /**
   * Reads a stored value without trusting it. Corrupt JSON or an unexpected shape gives the fallback, and the
   * stored text is left exactly as it is.
   */
  private safeGet<T>(key: string, parse: (value: unknown) => T, fallback: T): T {
    try {
      const { value } = this.lsAccount.get<unknown>(key);

      return value === undefined ? fallback : parse(value);
    } catch {
      return fallback;
    }
  }

  /** The 3.0.5 per-group hide list. Read-only: the 3.0.5 preference keys are never written again. */
  public getHiddenAssets(): HiddenAssets {
    return this.safeGet(this.hiddenAssets, (value) => recordOf(value, parseStringArray), {});
  }

  public getAssetPreferences(): Record<WalletAddress, Record<string, AssetPreference>> {
    return this.safeGet(this.assetPreferences, (value) => recordOf(value, parseAssetPreferences), {});
  }

  public setAssetPreferences(preferences: Record<WalletAddress, Record<string, AssetPreference>>): void {
    this.lsAccount.set(this.assetPreferences, preferences);
  }

  /** Everything 3.0.5 stored about one wallet's asset list, for the read-only rebuild in `legacyPreferences305`. */
  public getLegacy305Preferences(address: WalletAddress): Legacy305Preferences {
    return {
      hiddenIds: ownValue(this.getHiddenAssets(), address) ?? [],
      sequence: this.getSequenceAssetsByAddress(address),
      customSort: ownValue(this.getCustomSort(), address) === true,
    };
  }

  private getSequenceAssets(): Record<string, string> {
    return this.safeGet(this.sequenceAssetsStorageName, (value) => recordOf(value, parseString), {});
  }

  public getAssetTipData(): { count: number; time: number } {
    const sequencesAssets = this.lsAccount.get<{ count: number; time: number }>(this.assetTipData);

    return sequencesAssets.value ?? { count: 0, time: 0 };
  }

  /** The 3.0.5 custom order, as the group ids 3.0.5 joined with commas. Read-only. */
  public getSequenceAssetsByAddress(address: string): string[] {
    return ownValue(this.getSequenceAssets(), address)?.split(',') ?? [];
  }

  public getAutoSelectNodesValue(): Record<string, boolean> {
    const autoSelectNodes = this.lsAccount.get<Record<string, boolean>>(this.autoSelectNodesStorageName);

    return autoSelectNodes.value ?? {};
  }

  /** The 3.0.5 custom-order switch. Read-only. */
  public getCustomSort(): Record<string, boolean> {
    return this.safeGet(this.customSort, (value) => recordOf(value, parseBoolean), {});
  }

  public setAutoSelectNodes(value: boolean, network: string): void {
    const autoSelectNodes = this.getAutoSelectNodesValue();

    autoSelectNodes[network] = value;

    this.lsAccount.set(this.autoSelectNodesStorageName, autoSelectNodes);
  }

  public getActiveNodes(): Record<string, Node> {
    const activeNodes = this.lsAccount.get<Record<string, Node>>(this.activeNodeStorageName);

    return activeNodes.value ?? {};
  }

  public getActiveNodesByNetwork(network: string): Node {
    const activeNodes = this.getActiveNodes();

    return activeNodes[network] ?? { name: '', url: '' };
  }

  public setActiveNode(value: Node, network: string): void {
    const activeNodes = this.getActiveNodes();

    activeNodes[network] = value;

    this.lsAccount.set(this.activeNodeStorageName, activeNodes);
  }

  public getCustomNodes(): Record<string, Node[]> {
    const customNodes = this.lsAccount.get<Record<string, Node[]>>(this.customNodesStorageName);

    return customNodes.value ?? {};
  }

  public getCustomNodesByNetwork(network: string): Node[] {
    const customNodes = this.getCustomNodes();

    return customNodes[network] ?? [];
  }

  public updateCustomNodes(value: Node, network: string, oldValue: Node): void {
    const customNodes = this.getCustomNodes();
    const networkNodes = customNodes[network] ?? [];

    const oldValueIndex = networkNodes.findIndex(({ name, url }) => name === oldValue.name && url === oldValue.url);

    if (oldValueIndex !== -1) {
      networkNodes.splice(oldValueIndex, 1, value);
    } else {
      networkNodes.push(value);
    }

    customNodes[network] = networkNodes;

    this.lsAccount.set(this.customNodesStorageName, customNodes);
  }

  public deleteNode(value: Node, network: string): void {
    const nodes = this.getCustomNodes();
    const networkNodes = nodes[network];

    const nodeIndex = networkNodes.findIndex(({ name, url }) => name === value.name && url === value.url);

    networkNodes.splice(nodeIndex, 1);

    nodes[network] = networkNodes;

    this.lsAccount.set(this.customNodesStorageName, nodes);
  }
}

export const accountController = new AccountController();
