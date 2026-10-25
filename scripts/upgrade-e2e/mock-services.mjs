// Local stand-ins for the two remote services the upgraded build needs to sign in a test: the chain registry (an EVM
// signature needs the dApp's network from it) and TI, the TON indexer (a TON transfer reads the wallet state from it
// and sends through it). Chrome maps exactly these host names to this server (Session hostRules) and resolves nothing
// else; the certificate is a throwaway made per run, accepted only by the test browser (--ignore-certificate-errors).
// Nothing here forwards anything anywhere: a sent TON message is only recorded.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import path from 'node:path';
import { root } from './config.mjs';

export const REGISTRY_HOST = 'raw.githubusercontent.com';
export const TI_HOST = 'ti.soramitsu.io';
// The production registry path (src/consts/urls.ts CHAINS), served from the snapshot the 3.0.5 fixtures were made with.
const CHAINS_PATH = '/soramitsu/shared-features-utils/master/chains/v13/chains.json';
const TI_CAPABILITIES = ['account-balance', 'account-state', 'account-transactions', 'run-get-method'];

function certificate(dir) {
  mkdirSync(dir, { recursive: true });
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '2',
      '-subj',
      '/CN=fearless-upgrade-e2e',
      '-addext',
      `subjectAltName=DNS:${REGISTRY_HOST},DNS:${TI_HOST}`,
    ],
    { stdio: 'ignore' }
  );
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

const json = (response, status, body) =>
  response
    .writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    .end(JSON.stringify(body));

/**
 * Starts the server. `tonBalance` (nanotons, string) is what TI reports for every TON account; `sent` collects every
 * BOC a build asks TI to send.
 */
export async function startMockServices({ dir, tonBalance = '5000000000' }) {
  const chains = readFileSync(path.join(root, 'tests/fixtures/legacy-305/chains-v13.snapshot.json'));
  const requests = [];
  const sent = [];
  const server = createServer(certificate(dir), (request, response) => {
    const host = String(request.headers.host ?? '').split(':')[0];
    const url = new URL(request.url, `https://${host}`);
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      requests.push({ method: request.method, host, path: url.pathname });
      if (request.method === 'OPTIONS') {
        response
          .writeHead(204, {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET, POST',
          })
          .end();
        return;
      }
      if (host === REGISTRY_HOST) {
        if (url.pathname === CHAINS_PATH) json(response, 200, JSON.parse(chains));
        else json(response, 404, { error: 'not served by the upgrade E2E' });
        return;
      }
      if (host !== TI_HOST) return json(response, 404, {});
      if (url.pathname === '/api/indexer/v1/service-info') {
        return json(response, 200, {
          schemaVersion: 1,
          serviceId: TI_HOST,
          ecosystem: 'ton',
          chainId: 'ton:mainnet',
          network: 'mainnet',
          publicBaseUrl: `https://${TI_HOST}`,
          readOnly: false,
          capabilities: TI_CAPABILITIES,
        });
      }
      const account = url.pathname.match(/^\/api\/indexer\/v1\/accounts\/([^/]+)\/(balance|state|txs)$/);
      if (account) {
        const [, address, route] = account;
        if (route === 'balance')
          return json(response, 200, {
            ton: { balance: tonBalance, last_tx_lt: '1' },
            jettons: [],
            network: 'mainnet',
          });
        if (route === 'state')
          return json(response, 200, {
            address: decodeURIComponent(address),
            account_state: 'active',
            network: 'mainnet',
          });
        return json(response, 200, { page_size: 20, txs: [], network: 'mainnet' });
      }
      if (url.pathname === '/api/indexer/v1/runGetMethod')
        return json(response, 200, { exit_code: 0, stack: [['num', '0x7']] });
      if (url.pathname === '/api/v2/jsonRPC') {
        const call = JSON.parse(body || '{}');
        if (call.method === 'sendBoc') {
          sent.push({ boc: call.params?.boc, at: Date.now() });
          return json(response, 200, { ok: true });
        }
      }
      return json(response, 404, { error: 'not served by the upgrade E2E' });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    port,
    requests,
    sent,
    hostRules: [`MAP ${REGISTRY_HOST} 127.0.0.1:${port}`, `MAP ${TI_HOST} 127.0.0.1:${port}`],
    args: ['--ignore-certificate-errors'],
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
