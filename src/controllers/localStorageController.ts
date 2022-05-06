type Value = number | string | Record<string, string | number>;

interface Options {
  dateCreated?: string;
}

interface OptionsProp {
  saveDateCreated?: boolean;
}

export default class LocalStorage {
  private prefix;

  constructor(prefix = 'store') {
    this.prefix = `${prefix}_`;
  }

  public get(key: string): string | null {
    return localStorage.getItem(`${this.prefix}${key}`);
  }

  public set(key: string, _value: Value, _options: Options = {}, _optionsProp: OptionsProp = {}) {
    const { saveDateCreated } = _optionsProp;
    const options: Options = { ..._options };

    if (saveDateCreated) {
      const dateCreated = Date.now().toString();

      options.dateCreated = dateCreated;
    }

    const value = Object.keys(options).length
      ? {
          value: _value,
          options,
        }
      : {
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
