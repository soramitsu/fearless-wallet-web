function parse(url: unknown): URL | undefined {
  if (typeof url !== 'string') return undefined;

  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/**
 * Dwellir endpoints take the API key as the last path segment. The key goes only to Dwellir's own hosts (dwellir.com
 * and its subdomains), never to another host whose URL merely mentions it; an unreadable URL gets no key.
 */
export function withDwellirApiKey(endpoint: string, apiKey: string): string {
  const host = parse(endpoint)?.hostname.toLowerCase();

  return host === 'dwellir.com' || host?.endsWith('.dwellir.com') ? `${endpoint}/${apiKey}` : endpoint;
}
