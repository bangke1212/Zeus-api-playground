"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowLeftRight, Braces, Check, ChevronDown, CircleHelp,
  Clock3, Code2, Copy, ExternalLink, Eye, EyeOff, FlaskConical, Globe2, KeyRound,
  Layers3, LoaderCircle, Play, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck,
  Sparkles, Terminal, Trash2, X,
} from "lucide-react";

type Message = { role: "system" | "user" | "assistant"; content: string };
type HistoryItem = { id: string; time: string; model: string; status: number; ms: number; preview: string };
type Result = { status: number; ms: number; data: unknown; raw: string; ok: boolean };

const presets = [
  { name: "Xingchi AI", url: "https://api.xingchiapi.com/v1", hint: "OpenAI-compatible · akses klien mengikuti kebijakan provider" },
  { name: "OpenAI", url: "https://api.openai.com/v1", hint: "Official OpenAI API" },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1", hint: "Multi-provider gateway" },
  { name: "Groq", url: "https://api.groq.com/openai/v1", hint: "Fast inference API" },
  { name: "DeepSeek", url: "https://api.deepseek.com/v1", hint: "DeepSeek API" },
  { name: "Custom endpoint", url: "", hint: "HTTPS OpenAI-compatible endpoint" },
];
const starterMessages: Message[] = [
  { role: "system", content: "You are a helpful assistant. Answer clearly and accurately." },
  { role: "user", content: "Hello! Introduce yourself briefly." },
];
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const readError = (data: unknown) => {
  if (data && typeof data === "object") {
    const item = data as { error?: unknown; message?: unknown };
    if (typeof item.error === "string") return item.error;
    if (item.error && typeof item.error === "object" && "message" in item.error) return String((item.error as {message: unknown}).message);
    if (typeof item.message === "string") return item.message;
  }
  return "Request gagal. Periksa endpoint, API Key, dan model.";
};

export default function Home() {
  const [provider, setProvider] = useState("Xingchi AI");
  const [baseUrl, setBaseUrl] = useState(presets[0].url);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("gpt-6-astra");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"models" | "chat" | null>(null);
  const [activeTab, setActiveTab] = useState<"response" | "request" | "curl">("response");
  const [models, setModels] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notice, setNotice] = useState("");
  const [showSettings, setShowSettings] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("zeus-playground-settings");
      if (saved) {
        const value = JSON.parse(saved);
        if (typeof value.provider === "string") setProvider(value.provider);
        if (typeof value.baseUrl === "string") setBaseUrl(value.baseUrl);
        if (typeof value.model === "string") setModel(value.model);
        if (typeof value.temperature === "number") setTemperature(value.temperature);
        if (typeof value.maxTokens === "number") setMaxTokens(value.maxTokens);
      }
      const oldHistory = localStorage.getItem("zeus-playground-history");
      if (oldHistory) setHistory(JSON.parse(oldHistory));
    } catch { /* Ignore malformed local preferences. */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("zeus-playground-settings", JSON.stringify({ provider, baseUrl, model, temperature, maxTokens }));
  }, [provider, baseUrl, model, temperature, maxTokens]);

  useEffect(() => {
    localStorage.setItem("zeus-playground-history", JSON.stringify(history.slice(0, 12)));
  }, [history]);

  const requestBody = useMemo(() => ({
    model, messages, temperature, max_tokens: maxTokens, stream: false,
  }), [model, messages, temperature, maxTokens]);

  const chooseProvider = (name: string) => {
    const preset = presets.find(item => item.name === name);
    setProvider(name);
    if (preset?.url) setBaseUrl(preset.url);
  };

  const copy = async (value: string, label = "Disalin ke clipboard") => {
    try { await navigator.clipboard.writeText(value); setNotice(label); window.setTimeout(() => setNotice(""), 2400); }
    catch { setNotice("Clipboard tidak tersedia di browser ini."); }
  };

  const callApi = async (action: "models" | "chat") => {
    if (!apiKey.trim()) { setNotice("Masukkan API Key terlebih dahulu."); return; }
    if (!baseUrl.trim()) { setNotice("Masukkan Base URL terlebih dahulu."); return; }
    if (action === "chat" && !model.trim()) { setNotice("Masukkan Model ID."); return; }
    setBusy(action); setNotice("");
    const started = performance.now();
    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, baseUrl, apiKey, model, messages, temperature, maxTokens }),
      });
      const raw = await response.text();
      let data: unknown;
      try { data = JSON.parse(raw); } catch { data = raw; }
      const ms = Math.round(performance.now() - started);
      const next: Result = { status: response.status, ms, data, raw, ok: response.ok };
      setResult(next);
      setActiveTab("response");
      if (action === "models" && response.ok && data && typeof data === "object" && Array.isArray((data as {data?: unknown[]}).data)) {
        const ids = ((data as {data: Array<{id?: string}>}).data).map(item => item.id).filter((id): id is string => typeof id === "string");
        setModels(ids);
        if (ids.length) setNotice(`Berhasil memuat ${ids.length} model.`);
      }
      setHistory(prev => [{ id: crypto.randomUUID(), time: new Date().toLocaleTimeString("id-ID"), model: action === "models" ? "GET /models" : model, status: response.status, ms, preview: response.ok ? "Request berhasil" : readError(data).slice(0, 100) }, ...prev].slice(0, 12));
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      const data = { error: error instanceof Error ? error.message : "Network error" };
      setResult({ status: 0, ms, data, raw: pretty(data), ok: false });
      setActiveTab("response");
    } finally { setBusy(null); }
  };

  const curl = `curl -X POST "${baseUrl.replace(/\/+$/, "")}/chat/completions" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(requestBody, null, 2).replace(/'/g, "'\\''")}'`;
  const responseText = result ? (typeof result.data === "string" ? result.data : pretty(result.data)) : "";
  const addMessage = () => setMessages(prev => [...prev, { role: "user", content: "" }]);
  const updateMessage = (index: number, patch: Partial<Message>) => setMessages(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  const removeMessage = (index: number) => setMessages(prev => prev.filter((_, i) => i !== index));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><ZapIcon /></span><span>ZEUS<span className="brand-muted">.PLAYGROUND</span></span></a>
        <div className="topbar-center"><span className="live-dot" /> API WORKSPACE <span className="topbar-divider">/</span> REST CLIENT</div>
        <div className="topbar-right"><span className="secure-label"><ShieldCheck size={13}/> LOCAL KEY SESSION</span><span className="version-pill">v1.0</span></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line"/> DEVELOPER TOOLKIT <span className="eyebrow-line"/></div>
          <h1>API Playground<span className="hero-period">.</span></h1>
          <p>Eksperimen endpoint, model, dan parameter API dalam satu ruang kerja.</p>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-core"><Braces size={31}/></div><span className="orbit-node node-a"/><span className="orbit-node node-b"/><span className="orbit-node node-c"/></div>
      </section>

      <div className="workspace">
        <aside className="sidebar">
          <div className="side-label">WORKSPACE</div>
          <button className="nav-item active"><FlaskConical size={16}/> API Playground <span className="nav-count">01</span></button>
          <div className="side-label side-label-spaced">TOOLS</div>
          <button className="nav-item" onClick={() => { setMessages(starterMessages); setResult(null); }}><RefreshCw size={15}/> Reset request</button>
          <button className="nav-item" onClick={() => setShowSettings(v => !v)}><Settings2 size={15}/> Configuration <ChevronDown size={14} className={showSettings ? "chevron-open" : ""}/></button>
          <div className="sidebar-card"><div className="sidebar-card-icon"><ShieldCheck size={16}/></div><strong>Keys stay private.</strong><p>API Key hanya digunakan saat request dan tidak disimpan ke browser storage.</p></div>
          <div className="sidebar-bottom"><span className="status-ring"/> SYSTEM OPERATIONAL <span className="sidebar-version">ZEUS / 01</span></div>
        </aside>

        <section className="main-panel">
          <div className="panel-heading"><div><div className="section-kicker">01 / CONNECTION</div><h2>Provider setup</h2><p>Hubungkan endpoint API yang ingin kamu uji.</p></div><button className="ghost-button" onClick={() => setShowSettings(v => !v)}><Settings2 size={15}/> {showSettings ? "Hide settings" : "Show settings"}</button></div>

          {showSettings && <div className="config-card">
            <div className="config-grid">
              <label className="field"><span className="field-label">PROVIDER PRESET</span><span className="select-wrap"><Globe2 size={15}/><select value={provider} onChange={e => chooseProvider(e.target.value)}>{presets.map(item => <option key={item.name}>{item.name}</option>)}</select><ChevronDown size={14}/></span><small>{presets.find(p => p.name === provider)?.hint}</small></label>
              <label className="field"><span className="field-label">BASE URL <span className="required">*</span></span><span className="input-wrap"><span className="input-prefix">URL</span><input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" spellCheck={false}/></span><small>Gunakan base URL tanpa /chat/completions.</small></label>
              <label className="field field-wide"><span className="field-label">API KEY <span className="required">*</span><span className="field-hint">SESSION ONLY · NEVER COMMITTED</span></span><span className="input-wrap"><KeyRound size={15}/><input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Masukkan secret API key..." autoComplete="off"/><button className="icon-button" type="button" onClick={() => setShowKey(v => !v)} aria-label="Toggle API key visibility">{showKey ? <EyeOff size={15}/> : <Eye size={15}/>}</button></span></label>
            </div>
            <div className="config-footer"><span><ShieldCheck size={14}/> Key tidak disimpan setelah refresh halaman.</span><button className="outline-button" onClick={() => callApi("models")} disabled={busy !== null}>{busy === "models" ? <LoaderCircle className="spin" size={15}/> : <Activity size={15}/>} Test connection <ArrowLeftRight size={13}/></button></div>
          </div>}

          <div className="panel-heading request-heading"><div><div className="section-kicker">02 / REQUEST BUILDER</div><h2>Chat completion</h2><p>Atur model dan parameter sebelum mengirim request.</p></div><span className="method-pill"><span/> POST</span></div>
          <div className="request-card">
            <div className="request-topline"><div className="endpoint"><span className="method-mini">POST</span><code>{baseUrl.replace(/\/+$/, "") || "https://api.example.com/v1"}<b>/chat/completions</b></code></div><span className="compat-label">OPENAI-COMPATIBLE</span></div>
            <div className="model-row">
              <label className="field model-field"><span className="field-label">MODEL ID</span><span className="input-wrap"><Sparkles size={15}/><input list="model-options" value={model} onChange={e => setModel(e.target.value)} placeholder="provider/model-id"/><datalist id="model-options">{models.map(id => <option key={id} value={id}/>)}</datalist></span>{models.length > 0 && <small>{models.length} model tersedia dari endpoint</small>}</label>
              <label className="field param-field"><span className="field-label">TEMPERATURE <b>{temperature.toFixed(1)}</b></span><input className="range-input" type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))}/><small>Creativity / randomness</small></label>
              <label className="field param-field"><span className="field-label">MAX TOKENS <b>{maxTokens.toLocaleString("en-US")}</b></span><input className="number-input" type="number" min="1" max="32768" value={maxTokens} onChange={e => setMaxTokens(Math.max(1, Math.min(32768, Number(e.target.value))))}/></label>
            </div>
            <div className="messages-header"><div><span className="field-label">MESSAGES</span><span className="message-count">{messages.length} ITEMS</span></div><button className="text-button" onClick={addMessage}><Plus size={14}/> Add message</button></div>
            <div className="message-list">{messages.map((item, index) => <div className="message-row" key={index}><select className={`role-select role-${item.role}`} value={item.role} onChange={e => updateMessage(index, { role: e.target.value as Message["role"] })}><option value="system">SYSTEM</option><option value="user">USER</option><option value="assistant">ASSISTANT</option></select><textarea value={item.content} onChange={e => updateMessage(index, { content: e.target.value })} rows={2} placeholder="Tulis isi pesan..."/><button className="icon-button remove-button" onClick={() => removeMessage(index)} aria-label="Remove message"><Trash2 size={14}/></button></div>)}</div>
            <div className="request-actions"><button className="subtle-button" onClick={() => { setMessages(starterMessages); setModel("gpt-6-astra"); setTemperature(0.7); setMaxTokens(1024); }}><RefreshCw size={14}/> Reset</button><button className="send-button" onClick={() => callApi("chat")} disabled={busy !== null}>{busy === "chat" ? <LoaderCircle size={16} className="spin"/> : <Play size={15} fill="currentColor"/>} Send request <span>↗</span></button></div>
          </div>

          <div className="panel-heading response-heading"><div><div className="section-kicker">03 / INSPECTOR</div><h2>Response inspector</h2><p>Lihat hasil, payload request, dan contoh cURL.</p></div>{result && <div className="response-meta"><span className={result.ok ? "http-ok" : "http-error"}>{result.status || "ERR"} {result.ok ? "SUCCESS" : "ERROR"}</span><span><Clock3 size={13}/> {result.ms} ms</span></div>}</div>
          <div className="inspector-card">
            <div className="tabs"><button className={activeTab === "response" ? "tab active-tab" : "tab"} onClick={() => setActiveTab("response")}><Braces size={14}/> Response</button><button className={activeTab === "request" ? "tab active-tab" : "tab"} onClick={() => setActiveTab("request")}><Code2 size={14}/> Request JSON</button><button className={activeTab === "curl" ? "tab active-tab" : "tab"} onClick={() => setActiveTab("curl")}><Terminal size={14}/> cURL</button><div className="tab-spacer"/>{result && <button className="icon-button" title="Copy output" onClick={() => copy(activeTab === "curl" ? curl : activeTab === "request" ? pretty(requestBody) : responseText)}><Copy size={14}/></button>}{result && <button className="icon-button" title="Download response" onClick={() => { const blob = new Blob([responseText], {type:"application/json"}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "zeus-response.json"; a.click(); URL.revokeObjectURL(a.href); }}><ArrowDownToLine size={14}/></button>}</div>
            <div className="code-window"><div className="code-window-top"><div className="window-dots"><i/><i/><i/></div><span>{activeTab === "response" ? "response.json" : activeTab === "request" ? "request.json" : "request.sh"}</span><span className="code-language">{activeTab === "curl" ? "BASH" : "JSON"}</span></div>
              {activeTab === "response" ? result ? <pre className="code-content">{responseText}</pre> : <div className="empty-state"><div className="empty-icon"><Send size={21}/></div><strong>Ready when you are.</strong><p>Kirim request untuk melihat response API di sini.</p><span>AWAITING FIRST REQUEST</span></div> : <pre className="code-content">{activeTab === "request" ? pretty(requestBody) : curl}</pre>}
            </div>
          </div>

          <div className="bottom-grid">
            <section className="history-card"><div className="small-card-heading"><div><div className="section-kicker">ACTIVITY</div><h3>Recent requests</h3></div><span className="history-total">{history.length} / 12</span></div>{history.length ? <div className="history-list">{history.slice(0,5).map(item => <div className="history-item" key={item.id}><span className={item.status >= 200 && item.status < 300 ? "history-status success" : "history-status failed"}/><div className="history-detail"><strong>{item.model}</strong><small>{item.time} · {item.preview}</small></div><span className="history-code">{item.status || "ERR"}</span><span className="history-ms">{item.ms}ms</span></div>)}</div> : <div className="history-empty"><Clock3 size={15}/> Belum ada aktivitas request.</div>}<button className="clear-history" onClick={() => setHistory([])} disabled={!history.length}>Clear history</button></section>
            <section className="note-card"><div className="note-icon"><CircleHelp size={17}/></div><div><div className="section-kicker">GOOD TO KNOW</div><h3>Provider access matters.</h3><p>API Key valid belum tentu memberi izin untuk semua aplikasi. Jika provider membatasi jenis client, ikuti dokumentasi dan minta akses resmi.</p><a href="https://vercel.com/docs" target="_blank" rel="noreferrer">Vercel deployment docs <ExternalLink size={12}/></a></div></section>
          </div>
          <footer className="footer"><span>ZEUS API PLAYGROUND <span>·</span> BUILT FOR DEVELOPERS</span><span><span className="status-ring"/> ALL SYSTEMS READY</span></footer>
        </section>
      </div>
      {notice && <div className="toast"><Check size={15}/>{notice}<button onClick={() => setNotice("")}><X size={13}/></button></div>}
    </main>
  );
}

function ZapIcon() {
  return <Sparkles size={19} strokeWidth={2.2}/>;
}
