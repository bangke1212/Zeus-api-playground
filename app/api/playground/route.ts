import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  action?: "models" | "chat";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
};

function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || p[0] >= 224;
}

function isPrivateIPv6(ip: string) {
  const value = ip.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fe80:") ||
    value.startsWith("fc") || value.startsWith("fd") || value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

async function validateBaseUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Base URL tidak valid."); }
  if (url.protocol !== "https:") throw new Error("Endpoint harus menggunakan HTTPS.");
  if (url.username || url.password) throw new Error("Jangan menaruh kredensial di URL.");
  if (url.search || url.hash) throw new Error("Base URL tidak boleh memiliki query atau fragment.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal") {
    throw new Error("Host lokal/internal tidak diizinkan.");
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateIPv4(host)) throw new Error("Alamat IP privat tidak diizinkan.");
  if (ipVersion === 6 && isPrivateIPv6(host)) throw new Error("Alamat IP privat tidak diizinkan.");
  if (!ipVersion) {
    try {
      const records = await lookup(host, { all: true, verbatim: true });
      if (!records.length || records.some(record => isIP(record.address) === 4 ? isPrivateIPv4(record.address) : isPrivateIPv6(record.address))) {
        throw new Error("Host mengarah ke alamat IP privat atau tidak dapat diverifikasi.");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Host tidak dapat diverifikasi.");
    }
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Payload;
    const action = body.action;
    if (action !== "models" && action !== "chat") {
      return NextResponse.json({ error: "Action harus models atau chat." }, { status: 400 });
    }
    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return NextResponse.json({ error: "API Key wajib diisi." }, { status: 400 });
    }
    if (body.apiKey.length > 4096) return NextResponse.json({ error: "API Key terlalu panjang." }, { status: 400 });
    if (typeof body.baseUrl !== "string" || body.baseUrl.length > 500) {
      return NextResponse.json({ error: "Base URL wajib diisi." }, { status: 400 });
    }

    const base = await validateBaseUrl(body.baseUrl);
    const endpoint = action === "models" ? "models" : "chat/completions";
    const target = new URL(endpoint, base.toString().replace(/\/+$/, "") + "/");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${body.apiKey.trim()}`,
      Accept: "application/json",
    };
    let upstream: Response;
    if (action === "models") {
      upstream = await fetch(target, { method: "GET", headers, cache: "no-store", signal: AbortSignal.timeout(30000) });
    } else {
      if (typeof body.model !== "string" || !body.model.trim()) {
        return NextResponse.json({ error: "Model ID wajib diisi." }, { status: 400 });
      }
      if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 100) {
        return NextResponse.json({ error: "Messages wajib diisi (maksimal 100 pesan)." }, { status: 400 });
      }
      const temperature = Number(body.temperature ?? 0.7);
      const maxTokens = Number(body.maxTokens ?? 1024);
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
        return NextResponse.json({ error: "Temperature harus antara 0 dan 2." }, { status: 400 });
      }
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32768) {
        return NextResponse.json({ error: "Max tokens harus bilangan bulat 1–32768." }, { status: 400 });
      }
      headers["Content-Type"] = "application/json";
      upstream = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: body.model, messages: body.messages, temperature, max_tokens: maxTokens, stream: false }),
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
    }
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan saat memproses permintaan.";
    const status = message.includes("fetch failed") || message.includes("timeout") ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
