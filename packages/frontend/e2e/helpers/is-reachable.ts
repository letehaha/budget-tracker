import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Liveness probe for the dev/preview servers.
 *
 * Deliberately uses Node's http/https modules instead of the global `fetch`
 * (undici): the Bun-served Vite dev server negotiates only the `h2` ALPN
 * protocol, and undici's ALPN offer makes that server reply with a fatal
 * `no_application_protocol` TLS alert — so `fetch` throws before any response
 * arrives. Browsers and curl negotiate h2 and connect fine, so the actual
 * tests run; the probe just has to avoid the ALPN trip. The http/https modules
 * send no h2 ALPN offer, so the server falls back to HTTP/1.1 and responds.
 *
 * Any HTTP response (any status) means the server is up; only a connection
 * error or timeout means it's down. Status is intentionally ignored — the
 * HTTP/1.1 fallback can return a non-2xx status that a browser (over h2) would
 * not, so treating !ok as "down" would produce false negatives.
 */
export async function isReachable({ url, timeoutMs = 10_000 }: { url: string; timeoutMs?: number }): Promise<boolean> {
  // Cast http.request to the https signature so the call site is a single
  // (non-union) signature; http.request harmlessly ignores `rejectUnauthorized`.
  const requester = url.startsWith('https:') ? httpsRequest : (httpRequest as typeof httpsRequest);

  return new Promise((resolve) => {
    const req = requester(url, { method: 'GET', rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      res.resume(); // drain the response so the socket can close
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}
