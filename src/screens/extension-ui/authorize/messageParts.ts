export type AuthorizeMessagePart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'name';
    }
  | {
      kind: 'link';
    };

const AUTH_MESSAGE_TOKEN = /\{(name|link)\}/g;

export function splitAuthorizeMessage(template: string): AuthorizeMessagePart[] {
  const parts: AuthorizeMessagePart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = AUTH_MESSAGE_TOKEN.exec(template)) !== null) {
    if (match.index > cursor) {
      parts.push({ kind: 'text', text: template.slice(cursor, match.index) });
    }

    parts.push({ kind: match[1] as 'name' | 'link' });
    cursor = match.index + match[0].length;
  }

  if (cursor < template.length) {
    parts.push({ kind: 'text', text: template.slice(cursor) });
  }

  return parts.length === 0 ? [{ kind: 'text', text: template }] : parts;
}
