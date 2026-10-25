import { isAddress, TypedDataEncoder } from 'ethers';
import type { TypedDataDomain, TypedDataField } from 'ethers';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (): never => {
  throw new Error('Unsupported or ambiguous EVM typed data');
};
const fields = (value: unknown): TypedDataField[] => {
  if (!Array.isArray(value)) return fail();
  const names = new Set<string>();
  return value.map((field) => {
    if (
      !record(field) ||
      Object.keys(field).length !== 2 ||
      typeof field.name !== 'string' ||
      typeof field.type !== 'string' ||
      !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field.name) ||
      ['__proto__', 'constructor', 'prototype'].includes(field.name) ||
      names.has(field.name)
    )
      return fail();
    names.add(field.name);
    return { name: field.name, type: field.type };
  });
};

/** One contract for review, request admission, local signing and mobile forwarding.
 * Reject coercions and unsigned fields rather than displaying one intent and signing another.
 * Legacy v1 uses a different digest and is deliberately not interpreted as EIP-712.
 */
export function evmTypedData(method: string, params: unknown) {
  if (
    !['eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'].includes(method) ||
    !Array.isArray(params) ||
    params.length !== 2
  )
    return fail();
  const typed: unknown = typeof params[1] === 'string' ? JSON.parse(params[1]) : structuredClone(params[1]);
  if (
    !record(typed) ||
    !record(typed.types) ||
    !record(typed.domain) ||
    !record(typed.message) ||
    typeof typed.primaryType !== 'string' ||
    Object.keys(typed).some((key) => !['types', 'domain', 'message', 'primaryType'].includes(key))
  )
    return fail();
  const types: Record<string, TypedDataField[]> = {};
  for (const [name, value] of Object.entries(typed.types)) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name))
      return fail();
    if (name !== 'EIP712Domain') types[name] = fields(value);
  }
  if (
    method === 'eth_signTypedData_v3' &&
    Object.values(types)
      .flat()
      .some((field) => field.type.includes('['))
  )
    return fail();
  const encoder = TypedDataEncoder.from(types);
  if (encoder.primaryType !== typed.primaryType) return fail();
  let remaining = 10000;
  const validate = (type: string, value: unknown, depth = 0): void => {
    if (--remaining < 0 || depth > 64) return fail();
    const array = type.match(/^(.*)\[([0-9]*)\]$/);
    if (array) {
      if (!Array.isArray(value) || (array[2] && value.length !== Number(array[2]))) return fail();
      for (const child of value) validate(array[1], child, depth + 1);
    } else if (Object.hasOwn(types, type)) {
      const definition = types[type];
      if (!record(value) || Object.keys(value).length !== definition.length) return fail();
      for (const field of definition) {
        if (!Object.hasOwn(value, field.name)) return fail();
        validate(field.type, value[field.name], depth + 1);
      }
    } else if (type === 'bool') {
      if (typeof value !== 'boolean') return fail();
    } else if (type === 'string') {
      if (typeof value !== 'string') return fail();
    } else if (type === 'address') {
      if (typeof value !== 'string' || !isAddress(value)) return fail();
    } else if (/^bytes(?:[0-9]+)?$/.test(type)) {
      if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) return fail();
    } else if (/^u?int[0-9]+$/.test(type)) {
      if (
        !(
          (typeof value === 'number' && Number.isSafeInteger(value)) ||
          (typeof value === 'string' && /^(?:-?[0-9]+|0x[0-9a-fA-F]+)$/.test(value))
        )
      )
        return fail();
    } else return fail();
  };
  validate(typed.primaryType, typed.message);
  const domainTypes: Record<string, string> = {
    name: 'string',
    version: 'string',
    chainId: 'uint256',
    verifyingContract: 'address',
    salt: 'bytes32',
  };
  for (const [key, value] of Object.entries(typed.domain)) {
    if (!Object.hasOwn(domainTypes, key)) return fail();
    validate(domainTypes[key], value);
  }
  const domain = typed.domain as TypedDataDomain;
  // Ethers uses the canonical domain schema. A declared different schema must
  // never be silently removed and replaced before signing.
  const payload = TypedDataEncoder.getPayload(domain, types, typed.message);
  if (Object.hasOwn(typed.types, 'EIP712Domain')) {
    const declared = fields(typed.types.EIP712Domain);
    const canonical = payload.types.EIP712Domain;
    if (
      declared.length !== canonical.length ||
      declared.some((field, index) => field.name !== canonical[index].name || field.type !== canonical[index].type)
    )
      return fail();
  }
  // Validate numeric ranges, fixed bytes and all encoder constraints before key access.
  TypedDataEncoder.hash(domain, types, typed.message);
  return { domain, types, message: typed.message, primaryType: typed.primaryType };
}
