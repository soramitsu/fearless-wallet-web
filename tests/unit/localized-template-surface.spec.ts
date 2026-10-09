// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { baseParse, NodeTypes, type RootNode, type TemplateChildNode } from '@vue/compiler-dom';

const sourceRoot = decodeURIComponent(new URL('../../src', import.meta.url).pathname);
const visibleAttributes = new Set([
  'alt',
  'aria-label',
  'errorDescriptions',
  'header',
  'headerText',
  'label',
  'placeholder',
  'subtext',
  'text',
  'title',
  'tooltipText',
]);
const intentionalLiterals = new Set([
  'APY',
  'ETH',
  'IrohaConnect',
  'KUSD',
  'Polkamarkt',
  'SHA-256',
  'SORA',
  'TVL',
  'XOR',
  'iroha://connect?sid=…',
]);
const localeKey = /^[a-z][\w-]*(?:\.[\w-]+)+$/u;

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return vueFiles(path);
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : [];
  });
}

function collectTemplateLiterals(node: RootNode | TemplateChildNode, literals: string[]): void {
  if (node.type === NodeTypes.TEXT) {
    const text = node.content.replace(/\s+/gu, ' ').trim();

    if (/[A-Za-z]{2}/u.test(text)) literals.push(text);
  }

  if (node.type === NodeTypes.ELEMENT) {
    node.props.forEach((property) => {
      if (
        property.type === NodeTypes.ATTRIBUTE &&
        visibleAttributes.has(property.name) &&
        property.value &&
        /[A-Za-z]{2}/u.test(property.value.content) &&
        !localeKey.test(property.value.content)
      ) {
        literals.push(property.value.content);
      }
    });
  }

  if (node.type === NodeTypes.ROOT || node.type === NodeTypes.ELEMENT) {
    node.children.forEach((child) => collectTemplateLiterals(child, literals));
  }
}

describe('localized Vue templates', () => {
  it('keeps visible static prose behind locale keys', () => {
    const untranslated = vueFiles(sourceRoot).flatMap((path) => {
      const descriptor = parseSfc(readFileSync(path, 'utf8'), { filename: path }).descriptor;
      if (!descriptor.template) return [];

      const literals: string[] = [];
      collectTemplateLiterals(baseParse(descriptor.template.content), literals);

      return literals
        .filter((literal) => !intentionalLiterals.has(literal))
        .map((literal) => `${relative(sourceRoot, path)}: ${literal}`);
    });

    expect(untranslated).toEqual([]);
  });
});
