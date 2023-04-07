type Value = number | string | boolean | Record<string, any> | any[];

export class LocalStorage {
  constructor(private prefix: string) {}

  public getWithoutParse(key: string): string | null {
    return localStorage.getItem(`${this.prefix}${key}`);
  }

  public get(key: string): Record<string, any> {
    const item = localStorage.getItem(`${this.prefix}${key}`);

    return item ? JSON.parse(item) : {};
  }

  public set(key: string, _value: Value) {
    const value = {
      value: _value,
    };

    localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(value));
  }

  public remove(key: string) {
    localStorage.removeItem(`${this.prefix}${key}`);
  }

  public clear() {
    for (const key in Object.keys(localStorage)) {
      if (key.startsWith(this.prefix)) localStorage.removeItem(key);
    }
  }
}
