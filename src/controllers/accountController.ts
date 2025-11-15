import type { NftSettings } from '@extension-base/services/nft-service/types';
import type { Node, NetworkName, WalletAddress } from '@/interfaces';
import type { Lang } from '@/locales';
import type { HiddenAssets } from '@/stores/accounts/types';
import { LocalStorage } from '@/controllers/localStorageController';
import { isNonEmptyString, reduceObjectEntries } from '@/util/storage';

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
  private readonly agreeSwapDisclaimer = 'agree-swap-disclaimer';
  private readonly hidingPoolsBanner = 'hiding-pools-banner';
  private readonly hiddenWarningNetworks = 'hidden-warning-networks';
  private readonly nftSettings = 'nftSettings';

  public setAssetTipData(count: number, time: number) {
    this.lsAccount.set(this.assetTipData, { count, time });
  }

  public getHiddenWarningNetworks(): string[] {
    const array = this.lsAccount.get(this.hiddenWarningNetworks);

    return (array.value as string[] | undefined) ?? [];
  }

  public setHiddenWarningNetwork(networkName: NetworkName): void {
    const array = this.getHiddenWarningNetworks();

    if (array.includes(networkName)) return;

    this.lsAccount.set(this.hiddenWarningNetworks, [...array, networkName]);
  }

  public getHidingPoolsBanner(): boolean {
    const { value } = this.lsAccount.get(this.hidingPoolsBanner);

    return (value as boolean | undefined) ?? false;
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

  public getLang(): Lang {
    const lang = this.lsAccount.get(this.langStorageName);

    return (lang.value as Lang | undefined) ?? 'en-EN';
  }

  public setLang(lang: Lang): void {
    this.lsAccount.set(this.langStorageName, lang);
  }

  public setNftSettings(settings: NftSettings) {
    this.lsAccount.set(this.nftSettings, settings);
  }

  public getNftSettings(): NftSettings {
    const value = this.lsAccount.get(this.nftSettings).value as NftSettings | undefined;

    return value ?? { spam: false, airdrop: false };
  }

  public getHiddenAssets(): HiddenAssets {
    return reduceObjectEntries<string[]>(this.lsAccount.get(this.hiddenAssets).value, (assets, address) => {
      if (!Array.isArray(assets) || !isNonEmptyString(address)) return null;

      const sanitized = assets.filter((assetId): assetId is string => isNonEmptyString(assetId));

      return sanitized.length ? sanitized : null;
    }) as HiddenAssets;
  }

  public setHiddenAssets(hiddenAssets: Record<WalletAddress, string[]>): void {
    this.lsAccount.set(this.hiddenAssets, hiddenAssets);
  }

  private getSequenceAssets(): Record<string, string> {
    return reduceObjectEntries<string>(this.lsAccount.get(this.sequenceAssetsStorageName).value, (sequence) =>
      typeof sequence === 'string' ? sequence : null
    );
  }

  public getAssetTipData(): { count: number; time: number } {
    const value = this.lsAccount.get(this.assetTipData).value as { count: number; time: number } | undefined;

    return value ?? { count: 0, time: 0 };
  }

  public getSequenceAssetsByAddress(address: string): string[] {
    const sequencesAssets = this.getSequenceAssets();
    const value = sequencesAssets[address];

    return value ? value.split(',') : [];
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
    return reduceObjectEntries<boolean>(this.lsAccount.get(this.autoSelectNodesStorageName).value, (enabled) =>
      typeof enabled === 'boolean' ? enabled : null
    );
  }

  public getCustomSort(): Record<string, boolean> {
    const customSort = this.lsAccount.get(this.customSort).value as Record<string, boolean> | undefined;

    return customSort ?? ({} as Record<string, boolean>);
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
    return reduceObjectEntries<Node>(this.lsAccount.get(this.activeNodeStorageName).value, (node) => {
      const sanitized = this.sanitizeNode(node);

      return sanitized ?? null;
    });
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

  private sanitizeNode(candidate: unknown): Node | null {
    if (!candidate || typeof candidate !== 'object') return null;

    const { name, url } = candidate as Partial<Node>;

    if (!isNonEmptyString(name) || !isNonEmptyString(url)) return null;

    return { name, url };
  }

  public getCustomNodes(): Record<string, Node[]> {
    return reduceObjectEntries<Node[]>(this.lsAccount.get(this.customNodesStorageName).value, (nodes) => {
      if (!Array.isArray(nodes)) return null;

      const sanitized = nodes.map((node) => this.sanitizeNode(node)).filter((node): node is Node => node !== null);

      return sanitized.length ? sanitized : null;
    });
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

    if (!networkNodes) return;

    const nodeIndex = networkNodes.findIndex(({ name, url }) => name === value.name && url === value.url);

    if (nodeIndex === -1) return;

    networkNodes.splice(nodeIndex, 1);

    nodes[network] = networkNodes;

    this.lsAccount.set(this.customNodesStorageName, nodes);
  }
}

export const accountController = new AccountController();
