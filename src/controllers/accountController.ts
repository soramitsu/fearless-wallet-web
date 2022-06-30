import LocalStorageController from '@/controllers/localStorageController';
import { Hash } from '@/util/hash';
import { Node } from '@/store/networks/types';

interface PasswordValue {
  value: string;
  options: Record<string, string>;
}

export default class AccountController {
  private readonly postfix = 'sora';
  private readonly radix = 2;
  private readonly lsAccount = new LocalStorageController('account');
  private readonly passwordLifeTime = 1000 * 60 * 60 * 24; // 24 hours
  private readonly passwordStorageName = 'password';
  private readonly hideZeroBalanceStorageName = 'hide-zero-balance';
  private readonly subsequenceTokensStorageName = 'subsequence-tokens';
  private readonly autoSelectNodesStorageName = 'auto-select-nodes';
  private readonly activeNodeStorageName = 'active-node';
  private readonly customNodesStorageName = 'custom-nodes';

  private getAccountPasswordValue(): PasswordValue {
    return this.lsAccount.get(this.passwordStorageName) as PasswordValue;
  }

  private getPasswordHash(password: string): string {
    const salt = Hash.sha256(password.length.toString(this.radix));

    return `${password}${salt}${this.postfix}`;
  }

  public savePassword(password: string): void {
    const hashPasswordString = this.getPasswordHash(password);
    const hashPassword = Hash.sha256(hashPasswordString);

    this.lsAccount.set(this.passwordStorageName, hashPassword, {}, { saveDateCreated: true });
  }

  public updatedPasswordDateCreated(date?: number): void {
    const { value, options } = this.getAccountPasswordValue();
    const opt = options ?? {};

    if (date !== undefined) opt.dateCreated = date.toString();

    if (value) this.lsAccount.set(this.passwordStorageName, value, opt, { saveDateCreated: date === undefined });
  }

  public isSamePassword(password: string): boolean {
    const { value } = this.getAccountPasswordValue();

    if (value === undefined) return false;

    const hashPasswordString = this.getPasswordHash(password);

    return Hash.isSameAs(hashPasswordString, value);
  }

  public isSavedPassword(): boolean {
    const { value } = this.getAccountPasswordValue();

    return value !== undefined;
  }

  public isCorrectPasswordAge(): boolean {
    const { options } = this.getAccountPasswordValue();

    if (!options) return false;

    const { dateCreated } = options;

    return Date.now() < +dateCreated + this.passwordLifeTime;
  }

  public getHideZeroBalanceValue(): boolean {
    const lsVisible = this.lsAccount.get(this.hideZeroBalanceStorageName);

    return lsVisible.value ?? false;
  }

  public setHideZeroBalanceValue(value: boolean): void {
    this.lsAccount.set(this.hideZeroBalanceStorageName, value);
  }

  public getSubsequenceTokens(): string[] {
    const subsequenceTokens = this.lsAccount.get(this.subsequenceTokensStorageName);

    return subsequenceTokens.value?.split(',') ?? [];
  }

  public setSubsequenceTokens(value: string[]): void {
    this.lsAccount.set(this.subsequenceTokensStorageName, value.join());
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
    const nodes = this.getCustomNodes();
    const networkNodes = nodes[network] ?? [];

    const oldValueIndex = networkNodes.findIndex(({ name, url }) => name === oldValue.name && url === oldValue.url);

    if (oldValueIndex !== -1) {
      networkNodes.splice(oldValueIndex, 1, value);
    } else {
      networkNodes.push(value);
    }

    nodes[network] = networkNodes;

    this.lsAccount.set(this.customNodesStorageName, nodes);
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
