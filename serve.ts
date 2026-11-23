// Vice Harbor v2.3 — a tiny static server for game/ (Node 22, standard
// library only), so an entry can be played locally without a build step:
// `node serve.ts` serves game/ on http://localhost:8080. It sends the MIME
// types a browser game needs, refuses any path outside game/, logs each
// request to the console when --verbose is passed, and otherwise does
// nothing clever: this is a development convenience, not a web server for
// the internet. Pass --port <n> to listen on another port, --host <addr> to
// listen on another interface (127.0.0.1 by default). v2.3 answers every
// request through one small pipeline — parse, resolve, check, send — so
// the happy path reads top to bottom and every error has one place.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);

/** The value after `--flag`, or `fallback` when it is missing. */
function flagValue(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

const requestedPort = Number(flagValue('--port', '8080'));
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 8080;
const host = flagValue('--host', '127.0.0.1');
const verbose = args.includes('--verbose');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

/** The MIME type for a file, from its extension. */
function mimeFor(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** One log line, only when --verbose is passed. */
function log(status: number, pathname: string, extra?: string) {
  if (!verbose) return;
  console.log(`${status} ${pathname}${extra ? ` (${extra})` : ''}`);
}

/** Resolve a request path to a file under game/, or null when it escapes. */
function resolveFile(pathname: string): string | null {
  let path = pathname;
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, normalize(path)));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

/** Answer with a short error body and one log line. */
function fail(response, status: number, pathname: string, body: string) {
  log(status, pathname);
  response.writeHead(status).end(body);
}

/** Serve one file: headers, then the body — or nothing for a HEAD request. */
function serveFile(response, file: string, pathname: string, method: string) {
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    fail(response, 404, pathname, 'not found');
    return;
  }
  log(200, pathname, `${size} bytes`);
  response.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  // A HEAD request gets the headers and no body.
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    fail(response, 400, url.pathname, 'bad request');
    return;
  }
  const file = resolveFile(pathname);
  if (!file) {
    fail(response, 403, pathname, 'forbidden');
    return;
  }
  serveFile(response, file, pathname, request.method ?? 'GET');
}).listen(port, host, () => {
  console.log(`game/ is on http://${host}:${port}`);
});
