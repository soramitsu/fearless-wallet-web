type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

type Value = JsonValue;

export class LocalStorage {
  constructor(private prefix: string) {}

  public getWithoutParse(key: string): string | null {
    return localStorage.getItem(`${this.prefix}${key}`);
  }

  public setDefault(key: string, value: string) {
    localStorage.setItem(`${this.prefix}${key}`, value);
  }

  public get<T extends Record<string, unknown> = Record<string, unknown>>(key: string): T {
    const item = localStorage.getItem(`${this.prefix}${key}`);

    return item ? (JSON.parse(item) as T) : ({} as T);
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
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(this.prefix)) localStorage.removeItem(key);
    }
  }
}
