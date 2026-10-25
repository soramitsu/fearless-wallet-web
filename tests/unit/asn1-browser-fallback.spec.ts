import asn1 from 'asn1.js';

import { runInThisContext } from '@/util/unsupportedNodeVm';

describe('asn1.js browser vm fallback', () => {
  it('fails closed when browser code directly requests Node vm', () => {
    expect(() => runInThisContext()).toThrow('Node.js vm is unavailable in a browser extension');
  });

  it('still encodes and decodes DER through the dependency browser fallback', () => {
    const Integer = asn1.define('FearlessBrowserInteger', function defineInteger(this: { int(): void }) {
      this.int();
    });
    const encoded = Integer.encode(42, 'der');
    const decoded = Integer.decode(encoded, 'der');

    expect(encoded.toString('hex')).toBe('02012a');
    expect(decoded.toString(10)).toBe('42');
  });
});
