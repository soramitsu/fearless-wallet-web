type Value = number | string | Record<string, string | number>;

interface Options {
  dateCreated?: string;
}

interface OptionsProp {
  saveDateCreated?: boolean;
}

export default class LocalStorage {
  prefix;

  constructor(prefix = 'store') {
    this.prefix = `${prefix}_`;
  }

  get(key: string): string | null {
    return localStorage.getItem(`${this.prefix}${key}`);
  }

  set(key: string, _value: Value, _options: Options = {}, _optionsProp: OptionsProp = {}) {
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

  remove(key: string) {
    localStorage.removeItem(`${this.prefix}${key}`);
  }

  clear() {
    for (const key in Object.keys(localStorage)) {
      if (key.startsWith(this.prefix)) localStorage.removeItem(key);
    }
  }
}
