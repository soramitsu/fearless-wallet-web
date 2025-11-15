import { FPNumber } from '@/lib/fpNumber';

let cachedCrypto: Crypto | null | undefined;

const hasGetRandomValues = (candidate: unknown): candidate is Crypto =>
  typeof candidate === 'object' && candidate !== null && typeof (candidate as Crypto).getRandomValues === 'function';

const resolveNodeWebCrypto = (): Crypto | null => {
  if (typeof process === 'undefined' || typeof process.versions?.node !== 'string') return null;

  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;

  if (hasGetRandomValues(globalCrypto)) return globalCrypto;

  // Legacy Node.js builds (<=16) expose `webcrypto` via the crypto module.
  const loadModule = (moduleName: string): Crypto | null => {
    const nodeRequire =
      typeof require === 'function' ? require : (globalThis as { require?: (module: string) => unknown }).require;

    if (typeof nodeRequire !== 'function') return null;

    try {
      const cryptoModule = nodeRequire(moduleName) as { webcrypto?: Crypto } | undefined;

      if (cryptoModule && hasGetRandomValues(cryptoModule.webcrypto)) {
        return cryptoModule.webcrypto;
      }
    } catch {
      // Ignore and try the next candidate.
    }

    return null;
  };

  return loadModule('node:crypto') ?? loadModule('crypto');
};

const getWebCrypto = (): Crypto | null => {
  if (cachedCrypto !== undefined) return cachedCrypto;

  const { crypto, msCrypto } = globalThis as { crypto?: Crypto; msCrypto?: Crypto };

  if (hasGetRandomValues(crypto)) {
    cachedCrypto = crypto;
  } else if (hasGetRandomValues(msCrypto)) {
    cachedCrypto = msCrypto;
  } else {
    cachedCrypto = resolveNodeWebCrypto();
  }

  return cachedCrypto ?? null;
};

const getSecureRandomUint32 = (): number => {
  const crypto = getWebCrypto();

  if (!crypto) throw new Error('Secure random generator is not available in this environment.');

  const buffer = new Uint32Array(1);

  crypto.getRandomValues(buffer);

  return buffer[0];
};

const getSecureRandomInt = (min: number, max: number): number => {
  if (!Number.isInteger(min) || !Number.isInteger(max)) throw new Error('Bounds must be integers.');

  if (max <= min) throw new Error('Maximum bound must be greater than minimum bound.');

  const range = max - min;
  const maxUint32 = 0xffffffff + 1;
  const limit = Math.floor(maxUint32 / range) * range;

  let random: number;

  do {
    random = getSecureRandomUint32();
  } while (random >= limit);

  return min + (random % range);
};

const shuffleArray = <T>(values: ReadonlyArray<T>): T[] => {
  const array = [...values];

  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = getSecureRandomInt(0, i + 1);
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  return array;
};

interface Options {
  decimalsValue?: number;
  returnOriginNumber?: boolean;
  removeTrailingZeros?: boolean;
}

function getOptions(options: Options) {
  return {
    decimalsValue: options.decimalsValue ?? 2,
    returnOriginNumber: options.returnOriginNumber ?? true,
    removeTrailingZeros: options.removeTrailingZeros ?? false,
  };
}

function formattedNumber(number: number, options: Options = {}): string {
  const { decimalsValue, returnOriginNumber, removeTrailingZeros } = getOptions(options);

  const decimals = 10 ** decimalsValue;
  const roundValue = Math.round(decimals * number) / decimals;

  // if roundValue is equal 0 and number is not equal 0, return origin number
  if (returnOriginNumber && roundValue === 0 && number >= 0.000000001) return number.toFixed(9);

  if (removeTrailingZeros || roundValue === 0) return roundValue.toString();

  return roundValue.toFixed(decimalsValue);
}

function addNumbers(values: (string | number)[]): string {
  return values.reduce((sum, number) => sum.add(new FPNumber(number)), FPNumber.ZERO).toString();
}

export { formattedNumber, addNumbers, getSecureRandomInt, shuffleArray };
