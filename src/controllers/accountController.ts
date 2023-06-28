import type { Node, NetworkName, WalletAddress } from '@/interfaces';
import type { Lang } from '@/locales';
import { LocalStorage } from '@/controllers/localStorageController';
import { AccountJson } from '@/extension/background/extension-base/src/background/types/types';

class AccountController {
  private readonly lsAccount = new LocalStorage('account_');
  private readonly langStorageName = 'lang';
  private readonly sequenceAssetsStorageName = 'sequence-assets';
  private readonly autoSelectNodesStorageName = 'auto-select-nodes';
  private readonly activeNodeStorageName = 'active-node';
  private readonly customNodesStorageName = 'custom-nodes';
  private readonly selectedFiatStorageName = 'selected-fiat';
  private readonly selectedWalletStorageName = 'selected-wallet';
  private readonly selectedNetworkStorageName = 'selected-network';
  private readonly customSort = 'custom-sort';
  private readonly accounts = 'accounts';
  private readonly hiddenAssets = 'hidden-assets';
  private readonly agreeSwapDisclaimer = 'agree-swap-disclaimer';
  private readonly hiddenWarningNetworks = 'hidden-warning-networks';
  private readonly hidingSoraCardBannerTime = 'hiding-sora-card-banner-time';

  public getHidingSoraCardBannerTime(): number {
    return +(this.lsAccount.get(this.hidingSoraCardBannerTime).value ?? 0);
  }

  public setHidingSoraCardBannerTime(time: number) {
    this.lsAccount.set(this.hidingSoraCardBannerTime, time);
  }

  public getHiddenWarningNetworks(): string[] {
    const array = this.lsAccount.get(this.hiddenWarningNetworks);

    return array.value ?? [];
  }

  public setHiddenWarningNetwork(networkName: NetworkName): void {
    const array = this.getHiddenWarningNetworks();

    this.lsAccount.set(this.hiddenWarningNetworks, [...array, networkName]);
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

    return lang.value ?? 'en-EN';
  }

  public setLang(lang: Lang): void {
    this.lsAccount.set(this.langStorageName, lang);
  }

  public getSelectedWallet(): { address: string; ethereumAddress: string; name: string } {
    const lsFiat = this.lsAccount.get(this.selectedWalletStorageName);
    const account = this.getAccounts().filter((el) => el.address == lsFiat.value);

    if (account.length) {
      return {
        address: account[0].address,
        ethereumAddress: account[0].ethereumAddress,
        name: account[0].name ?? '',
      };
    }

    return {
      address: '',
      ethereumAddress: '',
      name: '',
    };
  }

  public getSelectedWalletAddress(): string {
    const lsFiat = this.lsAccount.get(this.selectedWalletStorageName);

    return lsFiat.value ?? '';
  }

  public setSelectedWalletAddress(address = ''): void {
    this.lsAccount.set(this.selectedWalletStorageName, address);
  }

  public getSelectedFiat(): string {
    const lsFiat = this.lsAccount.get(this.selectedFiatStorageName);

    return lsFiat.value ?? 'usd';
  }

  public setSelectedFiat(fiat: string): void {
    this.lsAccount.set(this.selectedFiatStorageName, fiat);
  }

  public getHiddenAssets(): Record<WalletAddress, string[]> {
    return this.lsAccount.get(this.hiddenAssets).value ?? {};
  }

  public setHiddenAssets(hiddenAssets: Record<WalletAddress, string[]>): void {
    this.lsAccount.set(this.hiddenAssets, hiddenAssets);
  }

  public getAccounts(): AccountJson[] {
    return this.lsAccount.get(this.accounts).value ?? [];
  }

  public setAccounts(accounts: AccountJson[]) {
    this.lsAccount.set(this.accounts, accounts);
  }

  public getSelectedNetwork(): Record<string, string> {
    const lsNetwork = this.lsAccount.get(this.selectedNetworkStorageName);

    return lsNetwork.value ?? {};
  }

  public setSelectedNetwork(address: string, network: string): void {
    const prevValue = this.getSelectedNetwork();
    const newValue = {
      ...prevValue,
      [address]: network,
    };

    this.lsAccount.set(this.selectedNetworkStorageName, newValue);
  }

  private getSequenceAssets(): Record<string, string> {
    const sequencesAssets = this.lsAccount.get(this.sequenceAssetsStorageName);

    return sequencesAssets.value ?? {};
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
    const autoSelectNodes = this.lsAccount.get(this.autoSelectNodesStorageName);

    return autoSelectNodes.value ?? {};
  }

  public getCustomSort(): Record<string, boolean> {
    return this.lsAccount.get(this.customSort).value ?? {};
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
    const activeNodes = this.lsAccount.get(this.activeNodeStorageName);

    return activeNodes.value ?? {};
  }

  public getActiveNodesByNetwork(network: string): Node {
    const activeNodes = this.getActiveNodes();

    return activeNodes[network] ?? {};
  }

  public setActiveNode(value: Node, network: string): void {
    const activeNodes = this.getActiveNodes();

    activeNodes[network] = value;

    this.lsAccount.set(this.activeNodeStorageName, activeNodes);
  }

  public getCustomNodes(): Record<string, Node[]> {
    const customNodes = this.lsAccount.get(this.customNodesStorageName);

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
