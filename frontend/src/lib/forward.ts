import { apiInternalUrl } from "./config";

// Hop-by-hop headers (RFC 9110 §7.6.1) plus ones fetch recomputes. content-encoding/length are
// dropped from responses because Node's fetch has already decompressed the body.
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade"];
const DROP_REQUEST = [...HOP_BY_HOP, "host", "content-length", "accept-encoding"];
const DROP_RESPONSE = [...HOP_BY_HOP, "content-encoding", "content-length"];

/** `/api/recipes?q=x` on the web origin → the same path and query on the API. */
export function upstreamUrl(base: string, incoming: URL): string {
  return base.replace(/\/+$/, "") + incoming.pathname + incoming.search;
}

export function upstreamRequestHeaders(incoming: Headers, url: URL): Headers {
  const headers = new Headers(incoming);
  for (const name of DROP_REQUEST) headers.delete(name);
  headers.set("x-forwarded-host", incoming.get("host") ?? url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  return headers;
}

/** Copies the API's headers back, keeping every Set-Cookie line intact. */
export function downstreamResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers(upstream);
  for (const name of DROP_RESPONSE) headers.delete(name);
  return headers;
}

/** Streams a request to API_INTERNAL_URL at runtime: method, headers (cookie, content-type), body, Set-Cookie. */
export async function forwardToApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const upstream = await fetch(upstreamUrl(apiInternalUrl(), url), {
      method: request.method,
      headers: upstreamRequestHeaders(request.headers, url),
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      cache: "no-store",
      // Required by Node's fetch to stream a request body (uploads aren't buffered in memory).
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: downstreamResponseHeaders(upstream.headers),
    });
  } catch {
    return Response.json(
      { error: { code: "api_unreachable", message: "The Recipe Box server isn’t responding. Try again in a moment." } },
      { status: 502 },
    );
  }
}
