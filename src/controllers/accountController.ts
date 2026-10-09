import type { NftSettings } from '@extension-base/services/nft-service/types';
import type { Node, NetworkName, WalletAddress } from '@/interfaces';
import type { HiddenAssets } from '@/stores/accounts/types';
import type { AssetPreference } from '@/portfolio/assetIdentity';
import { isLang, type Lang } from '@/locales/languages';
import { LocalStorage } from '@/controllers/localStorageController';

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
  private readonly assetPreferencesMigrated = 'asset-preferences-v1-migrated';
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

  public getHiddenAssets(): HiddenAssets {
    return this.lsAccount.get<HiddenAssets>(this.hiddenAssets).value ?? {};
  }

  public setHiddenAssets(hiddenAssets: Record<WalletAddress, string[]>): void {
    this.lsAccount.set(this.hiddenAssets, hiddenAssets);
  }

  public getAssetPreferences(): Record<WalletAddress, Record<string, AssetPreference>> {
    return (
      this.lsAccount.get<Record<WalletAddress, Record<string, AssetPreference>>>(this.assetPreferences).value ?? {}
    );
  }

  public setAssetPreferences(preferences: Record<WalletAddress, Record<string, AssetPreference>>): void {
    this.lsAccount.set(this.assetPreferences, preferences);
  }

  public getAssetPreferenceMigrationState(): Record<WalletAddress, boolean> {
    return this.lsAccount.get<Record<WalletAddress, boolean>>(this.assetPreferencesMigrated).value ?? {};
  }

  public setAssetPreferenceMigrationComplete(address: WalletAddress): void {
    this.lsAccount.set(this.assetPreferencesMigrated, {
      ...this.getAssetPreferenceMigrationState(),
      [address]: true,
    });
  }

  private getSequenceAssets(): Record<string, string> {
    const sequencesAssets = this.lsAccount.get<Record<string, string>>(this.sequenceAssetsStorageName);

    return sequencesAssets.value ?? {};
  }

  public getAssetTipData(): { count: number; time: number } {
    const sequencesAssets = this.lsAccount.get<{ count: number; time: number }>(this.assetTipData);

    return sequencesAssets.value ?? { count: 0, time: 0 };
  }

  public getSequenceAssetsByAddress(address: string): string[] {
    const sequencesAssets = this.getSequenceAssets();

    return (sequencesAssets?.[address]?.split(',') as string[]) ?? [];
  }

  public setSequenceAssets(sequence: string[], address: string): void {
    const prevSequence = this.getSequenceAssets();
    const newSequence = {
      ...prevSequence,
      [address]: sequence.join(),
    };

    this.lsAccount.set(this.sequenceAssetsStorageName, newSequence);
  }

  public getAutoSelectNodesValue(): Record<string, boolean> {
    const autoSelectNodes = this.lsAccount.get<Record<string, boolean>>(this.autoSelectNodesStorageName);

    return autoSelectNodes.value ?? {};
  }

  public getCustomSort(): Record<string, boolean> {
    return this.lsAccount.get<Record<string, boolean>>(this.customSort).value ?? {};
  }

  public setCustomSort(address: string) {
    this.lsAccount.set(this.customSort, { [address]: true });
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
