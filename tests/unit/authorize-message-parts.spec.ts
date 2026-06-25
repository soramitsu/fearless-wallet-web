import { describe, expect, it } from 'vitest';

import { splitAuthorizeMessage } from '@/screens/extension-ui/authorize/messageParts';

describe('authorize message parts', () => {
  it('keeps name and link placeholders as render tokens', () => {
    expect(splitAuthorizeMessage('Allow {name} to access {link}?')).toEqual([
      { kind: 'text', text: 'Allow ' },
      { kind: 'name' },
      { kind: 'text', text: ' to access ' },
      { kind: 'link' },
      { kind: 'text', text: '?' },
    ]);
  });

  it('leaves unknown placeholder text untouched', () => {
    expect(splitAuthorizeMessage('<img src=x onerror=alert(1)> {unknown}')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)> {unknown}' },
    ]);
  });
});
