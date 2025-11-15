export class Storage<T = string> {
  protected namespace: string;

  constructor(namespace = 'sora') {
    this.namespace = namespace;
  }

  private buildKey(key: T): string {
    return `${this.namespace}.${String(key)}`;
  }

  public all(): Array<[string, string]> {
    const entries: Array<[string, string]> = [];

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);

      if (!key || !key.startsWith(this.namespace)) continue;

      const value = localStorage.getItem(key);

      if (value !== null) entries.push([key, value]);
    }

    return entries;
  }

  public get(key: T): string {
    return localStorage.getItem(this.buildKey(key)) ?? '';
  }

  public set(key: T, value: string): void {
    localStorage.setItem(this.buildKey(key), value);
    window.dispatchEvent(new Event('localStorageUpdated'));
  }

  public remove(key: T): void {
    localStorage.removeItem(this.buildKey(key));
    window.dispatchEvent(new Event('localStorageUpdated'));
  }

  public clear(): void {
    this.all().forEach(([key]) => localStorage.removeItem(key));
  }
}

export class AccountStorage<T = string> extends Storage<T> {
  constructor(identity: string) {
    if (!identity) {
      throw new Error('AccountStorage: identity is required');
    }
    super(`account:${identity}`);
  }
}
