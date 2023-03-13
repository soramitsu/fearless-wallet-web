import type { Node, NetworkName } from '@/interfaces';
import type { Lang } from '@/locales';
import LocalStorageController from '@/controllers/localStorageController';
import store from '@/store';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
class AccountController {
  private readonly lsAccount = new LocalStorageController('account');
  private readonly langStorageName = 'lang';
  private readonly sequenceAssetsStorageName = 'sequence-assets';
  private readonly autoSelectNodesStorageName = 'auto-select-nodes';
  private readonly activeNodeStorageName = 'active-node';
  private readonly customNodesStorageName = 'custom-nodes';
  private readonly selectedFiatStorageName = 'selected-fiat';
  private readonly selectedWalletStorageName = 'selected-wallet';
  private readonly selectedNetworkStorageName = 'selected-network';
  private readonly customSort = 'customSort';

  private getSequenceAssets(): Record<string, Record<NetworkName, string>> {
    const sequencesAssets = this.lsAccount.get(this.sequenceAssetsStorageName);

    return sequencesAssets.value ?? {};
  }

  public getLang(): Lang {
    const lang = this.lsAccount.get(this.langStorageName);

    return lang.value ?? 'en-EN';
  }

  public setLang(lang: Lang): void {
    this.lsAccount.set(this.langStorageName, lang);
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

    store.dispatch(NetworksActionTypes.FETCH_ASSETS_PRICE);
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

  public getSequenceAssetsByAddress(address: string, network: string): string[] {
    const sequencesAssets = this.getSequenceAssets();

    return (sequencesAssets?.[address]?.[network]?.split(',') as string[]) ?? [];
  }

  public setSequenceAssets(
    sequence: string[] | Record<NetworkName, string[]>,
    address: string,
    network?: string
  ): void {
    const prevSequence = this.getSequenceAssets();

    if (Array.isArray(sequence)) {
      const prevSequenceByAddress = prevSequence[address];

      const newSequence = {
        ...prevSequence,
        [address]: {
          ...prevSequenceByAddress,
          [network!]: sequence.join(),
        },
      };

      this.lsAccount.set(this.sequenceAssetsStorageName, newSequence);
    } else {
      const newSequence = {
        ...prevSequence,
        [address]: sequence,
      };

      this.lsAccount.set(this.sequenceAssetsStorageName, newSequence);
    }
  }

  public getAutoSelectNodesValue(): Record<string, boolean> {
    const autoSelectNodes = this.lsAccount.get(this.autoSelectNodesStorageName);

    return autoSelectNodes.value ?? {};
  }

  public setCustomSort(address: string) {
    this.lsAccount.set(this.customSort, { [address]: true });
  }

  public getCustomSort(): Record<string, boolean> {
    return this.lsAccount.get(this.customSort).value ?? {};
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
