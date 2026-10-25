import { describe, expect, it } from 'vitest';
import { Wallet, verifyTypedData } from 'ethers';
import { evmTypedData } from '@/util/evmTypedData';

const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const typed = () => ({
  primaryType: 'Permission',
  domain: { name: 'Public fixture', chainId: 1 },
  types: { Permission: [{ name: 'approved', type: 'bool' }] },
  message: { approved: false },
});
const parse = (value: unknown, method = 'eth_signTypedData_v4') => evmTypedData(method, [wallet.address, value]);

describe('one typed-data contract for preview and signing', () => {
  it.each(['eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'])(
    'preserves a real false signature for %s and never mutates the input',
    async (method) => {
      const input = typed();
      const before = structuredClone(input);
      const value = parse(input, method);
      const signature = await wallet.signTypedData(value.domain, value.types, value.message);
      expect(verifyTypedData(input.domain, input.types, { approved: false }, signature)).toBe(wallet.address);
      expect(verifyTypedData(input.domain, input.types, { approved: true }, signature)).not.toBe(wallet.address);
      expect(input).toEqual(before);
      expect(parse(JSON.stringify(input), method)).toEqual(value);
    }
  );
  it.each(['false', 'true', 0, 1, null, [], {}])('refuses Boolean coercion of %j', (approved) => {
    expect(() => parse({ ...typed(), message: { approved } })).toThrow();
  });
  it('checks nested structs and array elements, including fields omitted from the signature', () => {
    const input = {
      ...typed(),
      primaryType: 'Batch',
      types: { ...typed().types, Batch: [{ name: 'items', type: 'Permission[]' }] },
      message: { items: [{ approved: false }] },
    };
    expect(parse(input).message).toEqual(input.message);
    expect(() => parse(input, 'eth_signTypedData_v3')).toThrow();
    expect(() => parse({ ...input, message: { items: [{ approved: 'false' }] } })).toThrow();
    expect(() => parse({ ...input, message: { items: [{ approved: false, unsigned: true }] } })).toThrow();
  });
  it.each([
    { primaryType: 'Other' },
    { primaryType: undefined },
    { domain: { name: null } },
    { domain: { chainId: Number.MAX_SAFE_INTEGER + 1 } },
    { domain: { chainId: true } },
    { domain: { chainId: -1 } },
    { domain: { verifyingContract: 'example.eth' } },
    { domain: { salt: '0x12' } },
    { message: { approved: false, unsigned: 'claim' } },
    { unsigned: 'claim' },
  ])('refuses incomplete or coercive shape %j', (change) => {
    expect(() => parse({ ...typed(), ...change })).toThrow();
  });
  it('never replaces a declared domain schema silently', () => {
    const input = typed();
    expect(() => parse({ ...input, types: { ...input.types, EIP712Domain: [] } })).toThrow();
    const fields = [
      { name: 'name', type: 'string' },
      { name: 'chainId', type: 'uint256' },
    ];
    expect(parse({ ...input, types: { ...input.types, EIP712Domain: fields } }).domain).toEqual(input.domain);
    expect(() => parse({ ...input, types: { ...input.types, EIP712Domain: fields.toReversed() } })).toThrow();
  });
  it('refuses extra parameters and legacy v1 rather than signing a different digest', () => {
    expect(() => evmTypedData('eth_signTypedData_v4', [wallet.address, typed(), 'ignored'])).toThrow();
    expect(() => parse(typed(), 'eth_signTypedData_v1')).toThrow();
    expect(() => parse([{ name: 'approved', type: 'bool', value: false }])).toThrow();
  });
});
