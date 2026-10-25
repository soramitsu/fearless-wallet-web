import { decodeRecoveryValue, encodeRecoveryValue } from '@/util/recoveryData';

describe('retained storage data transport', () => {
  it('round-trips ciphertext and structured values without JSON coercion or dropped fields', () => {
    const buffer = new Uint8Array([0, 255, 9, 17]).buffer;
    const sparse = new Array(3); sparse[2] = undefined;
    const value = { encoded: '  exact ciphertext\n', missing: undefined, bigint: 91n, notFinite: NaN,
      negativeZero: -0, positiveInfinity: Infinity, negativeInfinity: -Infinity,
      array: sparse, buffer, view: new Uint8Array(buffer, 1, 2), dataView: new DataView(buffer, 1, 2),
      date: new Date(1790000000000), map: new Map(), set: new Set(), cycle: undefined as unknown };
    value.cycle = value;
    value.map.set(value, 'public map entry');
    value.set.add(value);
    Object.defineProperty(value, '__proto__', { value: { intact: true }, enumerable: true });
    const decoded = decodeRecoveryValue(JSON.parse(JSON.stringify(encodeRecoveryValue(value)))) as typeof value;
    expect(decoded).toEqual(value);
    expect(decoded.cycle).toBe(decoded);
    expect(decoded.view.buffer).toBe(decoded.buffer);
    expect(decoded.map.get(decoded)).toBe('public map entry');
    expect(decoded.set.has(decoded)).toBe(true);
    expect(Object.hasOwn(decoded, 'missing')).toBe(true);
    expect(0 in decoded.array).toBe(false);
    expect(2 in decoded.array).toBe(true);
    expect(Object.hasOwn(decoded, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
  });

  it('refuses unsupported data rather than silently omitting it from the backup', () => {
    expect(() => encodeRecoveryValue({ encoded: 'public cipher', unsupported: () => {} })).toThrow('Unsupported');
    expect(() => encodeRecoveryValue({ encoded: 'public cipher', unsupported: new Blob(['public']) })).toThrow('Unsupported');
  });

  it('rejects unknown tags and references without evaluating code or changing prototypes', () => {
    expect(() => decodeRecoveryValue({ version: 1, root: 1, nodes: [] })).toThrow();
    expect(() => decodeRecoveryValue({ version: 1, root: 0, nodes: [['view', 'Function', 1, 0, 1]] })).toThrow();
    expect(() => decodeRecoveryValue({ version: 1, root: 0, nodes: [['eval', 'throw 1']] })).toThrow();
  });
});
