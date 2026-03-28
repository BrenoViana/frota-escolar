import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type HttpRequestOptions = {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export async function requestJson<T>(
  url: string,
  options: HttpRequestOptions
): Promise<T> {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  const payload =
    options.body === undefined ? undefined : JSON.stringify(options.body);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (payload) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload).toString();
  }

  return new Promise<T>((resolve, reject) => {
    const req = client.request(
      {
        method: options.method,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            return reject(
              new Error(`HTTP ${status} - ${raw || 'Falha na requisicao.'}`)
            );
          }

          try {
            resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);

    if (options.timeoutMs) {
      req.setTimeout(options.timeoutMs, () => {
        req.destroy(new Error('Timeout na requisicao HTTP.'));
      });
    }

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}
