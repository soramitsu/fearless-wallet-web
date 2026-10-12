import { getDomain } from 'tldts';

// Display the browser-normalized origin: punycode remains visible and neither
// user-info nor a path can masquerade as the registrable host. Private suffixes
// matter here (a.github.io is a different requester from b.github.io).
export function signingRequester(value: string): { origin: string; before: string; domain: string; after: string } {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported requester scheme');
    const domain = getDomain(url.hostname, { allowPrivateDomains: true }) || url.hostname;
    return {
      origin: url.origin,
      before: `${url.protocol}//${url.hostname.slice(0, url.hostname.length - domain.length)}`,
      domain,
      after: url.port ? `:${url.port}` : '',
    };
  } catch {
    // A malformed origin remains literal and cannot inject directional controls.
    const origin = value.replace(
      /[\p{Cc}\p{Cf}]/gu,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
    );
    return { origin, before: '', domain: origin, after: '' };
  }
}
