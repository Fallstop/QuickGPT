const UPSTREAM = "https://openrouter.ai";
const PORT = Number(Bun.env.PORT ?? 8080);
const API_KEY = Bun.env.OPENROUTER_API_KEY ?? "";
const FORCED_MODEL = Bun.env.MODEL ?? "";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "*",
  "access-control-max-age": "86400",
  vary: "Origin",
};

const isJson = (ct: string | null) =>
  !!ct && ct.toLowerCase().includes("application/json");

async function enforceModel(
  body: ReadableStream<Uint8Array> | null,
  contentType: string | null,
): Promise<{ body: BodyInit | null; contentLength?: string }> {
  if (!body || !FORCED_MODEL || !isJson(contentType)) {
    return { body };
  }
  const text = await new Response(body).text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { body: text };
  }
  parsed.model = FORCED_MODEL;
  const rewritten = JSON.stringify(parsed);
  return {
    body: rewritten,
    contentLength: String(Buffer.byteLength(rewritten)),
  };
}

Bun.serve({
  port: PORT,
  idleTimeout: 255, // seconds; max allowed, keeps long streams alive
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (url.pathname === "/healthz") {
      return new Response("ok\n", {
        headers: { "content-type": "text/plain", ...CORS_HEADERS },
      });
    }

    const upstreamUrl = UPSTREAM + url.pathname + url.search;

    // Build headers from scratch — Bun's fetch treats an explicit `host` or
    // copied-from-request Headers as suspect and can strip Authorization.
    const headers = new Headers();
    const clientCT = req.headers.get("content-type");
    if (clientCT) headers.set("content-type", clientCT);
    const clientAccept = req.headers.get("accept");
    if (clientAccept) headers.set("accept", clientAccept);
    const clientAuth = req.headers.get("authorization");
    if (API_KEY) headers.set("authorization", `Bearer ${API_KEY}`);
    else if (clientAuth) headers.set("authorization", clientAuth);
    headers.set("http-referer", req.headers.get("http-referer") ?? "https://chatgpt.com");
    headers.set("x-title", req.headers.get("x-title") ?? "QuickGPT");

    const { body, contentLength } = await enforceModel(
      req.body,
      req.headers.get("content-type"),
    );
    if (contentLength) headers.set("content-length", contentLength);

    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      // @ts-expect-error Bun supports duplex; required when streaming request bodies
      duplex: "half",
    });

    const outHeaders = new Headers(upstreamRes.headers);
    // strip upstream CORS so ours don't duplicate
    for (const k of Object.keys(CORS_HEADERS)) outHeaders.delete(k);
    for (const [k, v] of Object.entries(CORS_HEADERS)) outHeaders.set(k, v);
    // make sure SSE isn't buffered by any intermediary
    if (outHeaders.get("content-type")?.includes("text/event-stream")) {
      outHeaders.set("cache-control", "no-cache, no-transform");
      outHeaders.set("x-accel-buffering", "no");
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: outHeaders,
    });
  },
});

console.log(
  `openrouter-proxy listening on :${PORT}` +
    (FORCED_MODEL ? ` (model=${FORCED_MODEL})` : "") +
    (API_KEY ? " (key=injected)" : ""),
);
