import fs from 'node:fs';
import path from 'node:path';

const fixtureRoot = process.env.APP_ASSOCIATION_FETCH_FIXTURE_ROOT;

if (!fixtureRoot) throw new Error('APP_ASSOCIATION_FETCH_FIXTURE_ROOT is required');

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));

  if (url.protocol !== 'https:' || url.hostname !== 'association-fixture.invalid') {
    throw new Error(`Unexpected app-association test URL: ${url}`);
  }
  if (options.redirect !== 'error') throw new Error('Live verifier must reject redirects');
  if (options.headers?.accept !== 'application/json') throw new Error('Live verifier must request JSON');
  if (!(options.signal instanceof AbortSignal)) throw new Error('Live verifier must set a timeout signal');

  const relativePath = url.pathname.replace(/^\//u, '');
  const file = path.join(fixtureRoot, 'src/public', relativePath);
  const body = process.env.APP_ASSOCIATION_FETCH_BODY ?? fs.readFileSync(file, 'utf8');
  const status = Number(process.env.APP_ASSOCIATION_FETCH_STATUS ?? 200);
  const headers = {
    'content-type': process.env.APP_ASSOCIATION_FETCH_CONTENT_TYPE ?? 'application/json; charset=utf-8',
    'x-content-type-options': process.env.APP_ASSOCIATION_FETCH_NOSNIFF ?? 'nosniff',
  };

  if (process.env.APP_ASSOCIATION_FETCH_CONTENT_LENGTH !== 'omit') {
    headers['content-length'] = process.env.APP_ASSOCIATION_FETCH_CONTENT_LENGTH ?? String(Buffer.byteLength(body));
  }

  return new Response(body, { headers, status });
};
