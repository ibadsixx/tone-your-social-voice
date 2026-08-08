// Streams media (images/videos) from Cloudinary through the app's own domain,
// so right-click "open image in new tab" shows a URL on this site instead of
// res.cloudinary.com. Supports Range requests so <video> seeking works.

interface ProxyRequest {
  query?: Record<string, string | string[] | undefined>;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface ProxyResponse {
  status(code: number): ProxyResponse;
  setHeader(name: string, value: string | number | readonly string[]): void;
  write(chunk: Uint8Array | string): void;
  end(): void;
  headersSent: boolean;
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  const segments: string | string[] | undefined = req.query?.slug;
  const rest = Array.isArray(segments) ? segments.join('/') : '';
  if (!rest || /\.\.|\\|:\/\//.test(rest)) {
    res.status(400).end();
    return;
  }

  const target = `https://res.cloudinary.com/${rest}`;

  try {
    const headers: Record<string, string> = {};
    const range = req.headers?.range;
    if (range) headers['Range'] = Array.isArray(range) ? range[0] : range;
    const accept = req.headers?.accept;
    if (accept) headers['Accept'] = Array.isArray(accept) ? accept[0] : accept;

    const upstream = await fetch(target, { method: req.method || 'GET', headers, redirect: 'follow' });

    res.status(upstream.status);
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control', 'vary']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const body = upstream.body;
    if (body) {
      for await (const chunk of body) res.write(Buffer.from(chunk));
    }
    res.end();
  } catch (err) {
    console.error('[media] proxy error:', (err as Error).message);
    if (!res.headersSent) res.status(502).end();
    else res.end();
  }
}
