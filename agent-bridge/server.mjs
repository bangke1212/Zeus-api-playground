#!/usr/bin/env node
import http from "node:http";
import { URL } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.ZEUS_BRIDGE_PORT || 4173);
const TOKEN = process.env.ZEUS_BRIDGE_TOKEN || "";
const ORIGINS = (process.env.ZEUS_ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",").map(v => v.trim()).filter(Boolean);
const UPSTREAM = new URL(process.env.OPENCODE_URL || "http://127.0.0.1:4096");

if (!TOKEN || TOKEN.length < 24) {
  console.error("Set ZEUS_BRIDGE_TOKEN to a random secret of at least 24 characters.");
  process.exit(1);
}
if (!["127.0.0.1", "localhost", "::1"].includes(UPSTREAM.hostname)) {
  console.error("OPENCODE_URL must point to a loopback address only.");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (origin && !ORIGINS.includes(origin)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Origin not allowed. Add it to ZEUS_ALLOWED_ORIGINS." }));
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Zeus-Token");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.headers["x-zeus-token"] !== TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Invalid bridge token." }));
  }

  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  if (incoming.pathname === "/health") {
    try {
      const check = await fetch(new URL("/global/health", UPSTREAM), { signal: AbortSignal.timeout(5000) });
      const body = await check.text();
      res.writeHead(check.status, { "Content-Type": check.headers.get("content-type") || "application/json" });
      return res.end(body);
    } catch (error) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error instanceof Error ? error.message : "OpenCode is unreachable." }));
    }
  }

  if (!incoming.pathname.startsWith("/opencode/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Route not found." }));
  }
  const upstreamPath = incoming.pathname.slice("/opencode".length);
  if (!/^\/(project|session|file|find|command|config|global)(\/|$)/.test(upstreamPath)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "OpenCode route is not allowed by the local bridge." }));
  }

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw new Error("Request body exceeds 2 MB.");
      chunks.push(chunk);
    }
    const headers = {};
    if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
    const response = await fetch(new URL(upstreamPath + incoming.search, UPSTREAM), {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : Buffer.concat(chunks),
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    });
    const data = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, {
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Local bridge request failed." }));
  }
});

server.listen(PORT, HOST, () => {
  console.log("Zeus local bridge listening on http://" + HOST + ":" + PORT);
  console.log("OpenCode upstream: " + UPSTREAM.origin);
  console.log("Allowed browser origins: " + ORIGINS.join(", "));
});
