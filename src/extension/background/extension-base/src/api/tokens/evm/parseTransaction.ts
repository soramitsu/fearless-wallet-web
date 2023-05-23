// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { NestedArray, EVMTransactionArg } from '../../../types';

import { ERC20Contract } from './web3';

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const ABIs = [ERC20Contract.abi];

const genName = (name: NestedArray<string>): string => {
  if (typeof name === 'string') {
    return name;
  } else {
    if (Array.isArray(name[1])) {
      const _name = name[0] as string;
      const children = genName(name[1]);

      return `${_name}(${children})`;
    } else {
      return name.join(', ');
    }
  }
};

const genInput = (input: NestedArray<any>): string => {
  if (Array.isArray(input)) {
    const arr: string[] = input.map(genInput);

    return `[${arr.join(', ')}]`;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return
    return input.toString();
  }
};

const parseType = (_types: string): NestedArray<string> => {
  const types = _types.trim();

  if (types.indexOf('(') !== 0) {
    if (!types.includes(',')) {
      return types.trim();
    } else {
      const arr: string[] = [];
      let s = types;

      do {
        if (s.indexOf('(') === 0) {
          const start = s.indexOf('(');
          const end = s.lastIndexOf(')');
          const _new = s.slice(start, end + 1);

          arr.push(_new);
          s = s.replace(_new, '');
        } else {
          const start = s.indexOf(',');

          if (start !== -1) {
            const str = s.slice(0, start);

            arr.push(str);
            s = s.slice(start + 1).trim();
          } else {
            arr.push(s);
            s = '';
          }
        }
      } while (s.length);

      return arr.map((s) => s.trim());
    }
  } else {
    const start = types.indexOf('(');
    const end = types.lastIndexOf(')');
    const _new = types.slice(start + 1, end);

    return parseType(_new);
  }
};

const parseResult = (type: string, input: NestedArray<any>, name: NestedArray<string>): EVMTransactionArg => {
  const types = parseType(type);

  if (Array.isArray(types)) {
    const inputs = input as NestedArray<any>[];
    const _name = (name as NestedArray<string>[])[0] as string;
    const names = (name as NestedArray<string>[])[1];
    const children: EVMTransactionArg[] = [];

    types.forEach((type, index) => {
      children.push(parseResult(type as string, inputs[index], names[index]));
    });

    return {
      type: type,
      name: _name,
      value: genInput(input),
      children: children,
    };
  } else {
    return {
      type: types,
      name: genName(name),
      value: genInput(input),
    };
  }
};
