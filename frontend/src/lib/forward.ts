import { apiInternalUrl } from "./config";

// Hop-by-hop headers (RFC 9110 §7.6.1) plus ones fetch recomputes. content-encoding/length are
// dropped from responses because Node's fetch has already decompressed the body.
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade"];
// expect: the first server answers it (RFC 9110 §10.1.1) and undici throws on it, so never forward it.
const DROP_REQUEST = [...HOP_BY_HOP, "host", "content-length", "accept-encoding", "expect"];
const DROP_RESPONSE = [...HOP_BY_HOP, "content-encoding", "content-length"];

/** `/api/recipes?q=x` on the web origin → the same path and query on the API. */
export function upstreamUrl(base: string, incoming: URL): string {
  return base.replace(/\/+$/, "") + incoming.pathname + incoming.search;
}

// Anything a browser sends about who it is. The API throttles password guesses by client address, so only the
// value computed in `clientAddress` may reach it.
const CLIENT_ADDRESS_HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded", "x-client-ip", "cf-connecting-ip"];

/** The right-most `X-Forwarded-For` entry, which the proxy in front of us added; never the client-writable left. */
export function clientAddress(incoming: Headers, trustProxy = process.env.TRUST_PROXY_HEADERS === "true"): string | null {
  if (!trustProxy) return null;
  const last = (incoming.get("x-forwarded-for") ?? "").split(",").pop()?.trim() ?? "";
  // Looks like an IPv4 or IPv6 address; anything else is dropped rather than passed on.
  return /^[0-9a-fA-F:.]{2,45}$/.test(last) && (last.includes(".") || last.includes(":")) ? last : null;
}

export function upstreamRequestHeaders(incoming: Headers, url: URL): Headers {
  const headers = new Headers(incoming);
  for (const name of DROP_REQUEST) headers.delete(name);
  for (const name of CLIENT_ADDRESS_HEADERS) headers.delete(name);
  const client = clientAddress(incoming);
  if (client) headers.set("x-forwarded-for", client);
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
