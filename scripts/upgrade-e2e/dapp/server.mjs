// Serves the test dApp page on localhost, the only host name the browser under test resolves.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const page = readFileSync(new URL('./index.html', import.meta.url));

export function startDappServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (request.url !== '/' && request.url !== '/index.html') {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: bound } = server.address();
      resolve({ url: `http://localhost:${bound}/`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}
