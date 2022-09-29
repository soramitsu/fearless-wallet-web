import type { Node } from '@/interfaces/nodes';
import LocalStorageController from '@/controllers/localStorageController';

class AccountController {
  private readonly lsAccount = new LocalStorageController('account');
  private readonly sequenceTokensStorageName = 'sequence-tokens';
  private readonly autoSelectNodesStorageName = 'auto-select-nodes';
  private readonly activeNodeStorageName = 'active-node';
  private readonly customNodesStorageName = 'custom-nodes';
  private readonly selectedFiatStorageName = 'selected-fiat';
  private readonly selectedWalletStorageName = 'selected-wallet-address';

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

  public getSequenceTokens(address?: string): string[] | Record<string, string> {
    const sequencesTokens = this.lsAccount.get(this.sequenceTokensStorageName);
    const value = sequencesTokens.value;

    if (address) {
      return (value?.[address]?.split(',') as string[]) ?? [];
    }

    return value ?? {};
  }

  public setSequenceTokens(sequence: string[], address: string): void {
    const prevSequence = this.getSequenceTokens();
    const newSequence = {
      ...prevSequence,
      [address]: sequence.join(),
    };

    this.lsAccount.set(this.sequenceTokensStorageName, newSequence);
  }

  public getAutoSelectNodesValue(): Record<string, boolean> {
    const autoSelectNodes = this.lsAccount.get(this.autoSelectNodesStorageName);

    return autoSelectNodes.value ?? {};
  }

  public getAutoSelectNodesValueByNetwork(network: string): boolean {
    const autoSelectNodes = this.getAutoSelectNodesValue();

    return autoSelectNodes[network] ?? true;
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
