// Exact decimal arithmetic for Iroha `Quantity` strings (no floating point).

const MAX_IROHA_QUANTITY_SCALE = 28;
const MAX_IROHA_QUANTITY = (1n << 511n) - 1n;

type IrohaDecimal = {
  mantissa: bigint;
  scale: number;
};

function parseIrohaQuantity(value: string): IrohaDecimal {
  const match = typeof value === 'string' ? /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(value) : null;

  if (!match || (match[2] ?? '').length > MAX_IROHA_QUANTITY_SCALE) throw new Error('invalid_iroha_quantity');

  const fraction = match[2] ?? '';
  const mantissa = BigInt(`${match[1]}${fraction}`);

  if (mantissa > MAX_IROHA_QUANTITY) throw new Error('invalid_iroha_quantity');

  return { mantissa, scale: fraction.length };
}

// Canonical form: no trailing fractional zeros and no trailing dot.
function formatIrohaQuantity({ mantissa, scale }: IrohaDecimal): string {
  let value = mantissa;
  let normalizedScale = scale;

  while (normalizedScale > 0 && value % 10n === 0n) {
    value /= 10n;
    normalizedScale -= 1;
  }
  if (value > MAX_IROHA_QUANTITY) throw new Error('iroha_quantity_overflow');
  if (normalizedScale === 0) return value.toString();

  const digits = value.toString().padStart(normalizedScale + 1, '0');

  return `${digits.slice(0, -normalizedScale)}.${digits.slice(-normalizedScale)}`;
}

function canonicalizeIrohaQuantity(value: string): string {
  return formatIrohaQuantity(parseIrohaQuantity(value));
}

function addIrohaQuantities(...values: string[]): string {
  const parsed = values.map(parseIrohaQuantity);
  const scale = Math.max(0, ...parsed.map((item) => item.scale));
  const mantissa = parsed.reduce((sum, item) => sum + item.mantissa * 10n ** BigInt(scale - item.scale), 0n);

  return formatIrohaQuantity({ mantissa, scale });
}

function multiplyIrohaQuantity(value: string, factor: number): string {
  if (!Number.isSafeInteger(factor) || factor < 0) throw new Error('invalid_iroha_quantity_factor');

  const parsed = parseIrohaQuantity(value);

  return formatIrohaQuantity({ mantissa: parsed.mantissa * BigInt(factor), scale: parsed.scale });
}

function compareIrohaQuantities(left: string, right: string): number {
  const a = parseIrohaQuantity(left);
  const b = parseIrohaQuantity(right);
  const scale = Math.max(a.scale, b.scale);
  const difference = a.mantissa * 10n ** BigInt(scale - a.scale) - b.mantissa * 10n ** BigInt(scale - b.scale);

  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

function getIrohaQuantityScale(value: string): number {
  return parseIrohaQuantity(canonicalizeIrohaQuantity(value)).scale;
}

export {
  addIrohaQuantities,
  canonicalizeIrohaQuantity,
  compareIrohaQuantities,
  getIrohaQuantityScale,
  multiplyIrohaQuantity,
  parseIrohaQuantity,
};
