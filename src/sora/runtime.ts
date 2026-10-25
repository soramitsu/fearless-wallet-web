import { Observable } from 'rxjs';
import { FPNumber } from './number';

// Runtime storage/extrinsics are generated from the node's metadata, not SDK code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Runtime = any;
export const XOR = '0x0200000000000000000000000000000000000000000000000000000000000000';
export const VAL = '0x0200040000000000000000000000000000000000000000000000000000000000';
export const text = (value: Runtime): string => String(value?.code ?? value);
export const unwrap = (value: Runtime): Runtime => value?.unwrapOr ? value.unwrapOr(null) : value;
export const codec = (value: Runtime): string => {
  const result = String(value ?? '0');
  if (!/^\d+$/.test(result)) throw new Error('Invalid unsigned chain amount');
  return result;
};
export const amount = (value: string | number, decimals = 18): string => {
  const number = new FPNumber(value, decimals);
  if (!number.isFinity() || !number.gt(0)) throw new Error('Amount must be positive');
  const encoded = number.toCodecString();
  if (BigInt(encoded) === 0n) throw new Error('Amount is below the asset precision');
  return encoded;
};
export const slippageFactor = (percent: string | number): FPNumber => {
  const value = new FPNumber(percent);
  if (!value.isFinity() || value.lt(0) || value.gte(100)) throw new Error('Invalid slippage');
  return value.div(100);
};

/** Adapt Polkadot's callback storage subscription and always release its handle. */
export function observe<T>(subscribe: (callback: (value: Runtime) => void) => Promise<() => void>, transform: (value: Runtime) => T): Observable<T> {
  return new Observable<T>((subscriber) => {
    let stop: (() => void) | undefined;
    let closed = false;
    try {
      Promise.resolve(subscribe((value) => {
        try { if (!closed) subscriber.next(transform(value)); }
        catch (error) { subscriber.error(error); }
      })).then((unsubscribe) => { if (closed) unsubscribe(); else stop = unsubscribe; }, (error) => subscriber.error(error));
    } catch (error) { subscriber.error(error); }
    return () => { closed = true; stop?.(); };
  });
}
