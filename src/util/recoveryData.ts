// Lossless JSON transport for retained storage values. Ordinary account JSON
// stays available separately; this format never interprets or repairs keys.
export type RecoveryValue = { version: 1; root: number; nodes: unknown[][] };

const views = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
  Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView };

export function encodeRecoveryValue(value: unknown): RecoveryValue {
  const nodes: unknown[][] = [];
  const seen = new Map<object, number>();
  const encode = (value: unknown): number => {
    if (typeof value === 'object' && value !== null && seen.has(value)) return seen.get(value)!;
    const index = nodes.length;
    nodes.push([]);
    if (typeof value === 'object' && value !== null) seen.set(value, index);
    let node: unknown[];
    if (value === null) node = ['null'];
    else if (value === undefined) node = ['undefined'];
    else if (typeof value === 'string' || typeof value === 'boolean') node = [typeof value, value];
    else if (typeof value === 'number') node = ['number', Object.is(value, -0) ? '-0' : String(value)];
    else if (typeof value === 'bigint') node = ['bigint', String(value)];
    else if (value instanceof ArrayBuffer) node = ['buffer', Array.from(new Uint8Array(value))];
    else if (ArrayBuffer.isView(value)) {
      const kind = value.constructor.name;
      if (!Object.hasOwn(views, kind)) throw new Error('Unsupported recovery data view.');
      node = ['view', kind, encode(value.buffer), value.byteOffset, value.byteLength];
    } else if (value instanceof Date) node = ['date', encode(value.getTime())];
    else if (value instanceof RegExp) node = ['regexp', value.source, value.flags, value.lastIndex];
    else if (value instanceof Map) node = ['map', [...value].map(([key, entry]) => [encode(key), encode(entry)])];
    else if (value instanceof Set) node = ['set', [...value].map(encode)];
    else if (typeof value === 'object') {
      const prototype = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
        throw new Error('Unsupported recovery data object.');
      const entries = Object.entries(value).map(([key, entry]) => [key, encode(entry)]);
      node = Array.isArray(value) ? ['array', value.length, entries] : ['object', prototype === null, entries];
    } else throw new Error('Unsupported recovery data value.');
    nodes[index] = node;
    return index;
  };
  const root = encode(value);
  return { version: 1, root, nodes };
}

// Kept alongside the encoder so recovery tooling can reconstruct retained
// values without evaluating code or writing anything to wallet storage.
export function decodeRecoveryValue(value: RecoveryValue): unknown {
  if (value?.version !== 1 || !Array.isArray(value.nodes)) throw new Error('Invalid recovery data.');
  const cache = new Map<number, unknown>();
  const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
  const decode = (index: unknown): unknown => {
    if (!integer(index) || index >= value.nodes.length) throw new Error('Invalid recovery reference.');
    if (cache.has(index)) return cache.get(index);
    const node = value.nodes[index];
    if (!Array.isArray(node)) throw new Error('Invalid recovery node.');
    const [kind, data, extra] = node;
    let result: unknown;
    if (kind === 'null') result = null;
    else if (kind === 'undefined') result = undefined;
    else if (kind === 'string' && typeof data === 'string') result = data;
    else if (kind === 'boolean' && typeof data === 'boolean') result = data;
    else if (kind === 'number' && typeof data === 'string') result = Number(data);
    else if (kind === 'bigint' && typeof data === 'string') result = BigInt(data);
    else if (kind === 'buffer' && Array.isArray(data) && data.every(byte => integer(byte) && byte <= 255))
      result = new Uint8Array(data).buffer;
    else if (kind === 'date') result = new Date(decode(data) as number);
    else if (kind === 'regexp' && typeof data === 'string' && typeof extra === 'string' && integer(node[3])) {
      result = new RegExp(data, extra);
      (result as RegExp).lastIndex = node[3];
    } else if (kind === 'view' && typeof data === 'string' && Object.hasOwn(views, data) && integer(node[3]) && integer(node[4])) {
      const buffer = decode(extra);
      if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid recovery buffer.');
      const ctor = views[data as keyof typeof views] as {
        new(buffer: ArrayBuffer, offset: number, length: number): ArrayBufferView;
        BYTES_PER_ELEMENT?: number;
      };
      const size = ctor.BYTES_PER_ELEMENT ?? 1;
      if (node[4] % size !== 0) throw new Error('Invalid recovery view length.');
      result = new ctor(buffer, node[3], node[4] / size);
    } else if ((kind === 'object' && typeof data === 'boolean') || (kind === 'array' && integer(data))) {
      if (!Array.isArray(extra)) throw new Error('Invalid recovery entries.');
      result = kind === 'array' ? new Array(data as number) : Object.create(data ? null : Object.prototype);
      cache.set(index, result);
      for (const entry of extra) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0] === 'length' && kind === 'array')
          throw new Error('Invalid recovery property.');
        Object.defineProperty(result, entry[0], { value: decode(entry[1]), enumerable: true, writable: true, configurable: true });
      }
    } else if (kind === 'map' && Array.isArray(data)) {
      const map = new Map(); result = map; cache.set(index, map);
      for (const entry of data) {
        if (!Array.isArray(entry)) throw new Error('Invalid recovery map.');
        map.set(decode(entry[0]), decode(entry[1]));
      }
    } else if (kind === 'set' && Array.isArray(data)) {
      const set = new Set(); result = set; cache.set(index, set);
      data.forEach(entry => set.add(decode(entry)));
    } else throw new Error('Invalid recovery value.');
    cache.set(index, result);
    return result;
  };
  return decode(value.root);
}
