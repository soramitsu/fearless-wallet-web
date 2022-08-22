type Value = number | string | boolean | Record<string, any> | any[];

interface Options {
  dateCreated?: string;
}

interface OptionsProps {
  saveDateCreated?: boolean;
}

export default class LocalStorage {
  private prefix;

  constructor(prefix = 'store') {
    this.prefix = `${prefix}_`;
  }

  public get(key: string): Record<string, any> {
    const item = localStorage.getItem(`${this.prefix}${key}`);

    return item ? JSON.parse(item) : {};
  }

  public set(key: string, _value: Value, _options: Options = {}, _optionsProp: OptionsProps = {}) {
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
