"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, Bot, Check, ChevronDown, CircleAlert, Code2, FileCode2, Folder,
  FolderOpen, GitBranch, ListTodo, LoaderCircle, MessageSquare, Play, Plus,
  RefreshCw, Send, Settings2, ShieldCheck, Sparkles, Terminal, Trash2, Wifi,
  WifiOff, X,
} from "lucide-react";

type Project = { id?: string; worktree?: string; name?: string; [key: string]: unknown };
type Session = { id: string; title?: string; time?: { updated?: number; created?: number }; [key: string]: unknown };
type Task = { id: string; title: string; status: "todo" | "doing" | "done"; detail: string };
type FileEntry = { name?: string; path?: string; type?: string; isDirectory?: boolean; [key: string]: unknown };

const starterPrompts = [
  { name: "Understand project", prompt: "Analyze this project structure. Explain the architecture, important modules, entry points, and how to run it. Do not modify files." },
  { name: "Find bugs", prompt: "Review this project for likely bugs, security issues, and reliability problems. Give findings with file paths and severity. Do not modify files yet." },
  { name: "Implement task", prompt: "Inspect the relevant code, make the requested change, run appropriate checks, and summarize files changed and test results. Task: " },
  { name: "Write tests", prompt: "Inspect the existing test setup and add focused tests for the requested behavior. Run the tests and report the results. Task: " },
];

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const id = () => crypto.randomUUID();

export default function Home() {
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [bridgeToken, setBridgeToken] = useState("");
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState("");
  const [prompt, setPrompt] = useState("");
  const [conversation, setConversation] = useState<Array<{ role: string; text: string }>>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [directory, setDirectory] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const [showSettings, setShowSettings] = useState(true);
  const [activeView, setActiveView] = useState<"chat" | "files" | "tasks">("chat");
  const [models, setModels] = useState<Array<{ providerID: string; modelID: string; name: string }>>([]);
  const [activeModel, setActiveModel] = useState("");
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [providerPanel, setProviderPanel] = useState(false);

  useEffect(() => {
    // Load connection settings independently so a damaged task cache cannot
    // prevent the bridge address/token from being restored after refresh.
    try { setBridgeUrl(localStorage.getItem("zeus-bridge-url") || ""); } catch {}
    try { setBridgeToken(localStorage.getItem("zeus-bridge-token") || ""); } catch {}
    try {
      const savedTasks = localStorage.getItem("zeus-workspace-tasks");
      if (savedTasks) {
        const parsed = JSON.parse(savedTasks);
        if (Array.isArray(parsed)) setTasks(parsed);
      }
    } catch {}
    setCredentialsLoaded(true);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("zeus-workspace-tasks", JSON.stringify(tasks)); } catch {}
  }, [tasks]);
  useEffect(() => {
    if (!credentialsLoaded) return;
    // Save both fields locally on every edit; token stays masked by password input.
    try {
      localStorage.setItem("zeus-bridge-url", bridgeUrl.trim());
      localStorage.setItem("zeus-bridge-token", bridgeToken);
    } catch {
      setNotice("Browser tidak mengizinkan penyimpanan lokal. Periksa izin storage/private mode.");
    }
  }, [credentialsLoaded, bridgeUrl, bridgeToken]);

  const projectOptions = useMemo(() => projects.map((p, i) => ({
    key: String(p.id || p.worktree || p.name || i),
    label: String(p.name || p.worktree || p.id || "Project " + (i + 1)),
  })), [projects]);

  async function api(path: string, init: RequestInit = {}) {
    if (!bridgeToken.trim()) throw new Error("Masukkan bridge token terlebih dahulu.");
    const base = bridgeUrl.replace(/\/+$/, "");
    const response = await fetch(base + path, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Zeus-Token": bridgeToken, ...(init.headers || {}) },
      cache: "no-store",
    });
    const raw = await response.text();
    let data: any;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok) throw new Error(data?.error || data?.message || "Bridge error " + response.status);
    return data;
  }

  async function connect() {
    setBusy("connect"); setNotice("");
    try {
      await api("/health");
      const data = await api("/opencode/project");
      const list = Array.isArray(data) ? data : (data.projects || []);
      setProjects(list);
      setProject(String(list[0]?.worktree || list[0]?.id || list[0]?.name || ""));
      setConnected(true);
      setNotice("Terhubung ke OpenCode lokal.");
      await loadSessions(String(list[0]?.worktree || list[0]?.id || list[0]?.name || ""));
    } catch (e) { setConnected(false); setNotice(e instanceof Error ? e.message : "Gagal terhubung."); }
    finally { setBusy(""); }
  }

  async function loadSessions(directoryValue = project) {
    try {
      const suffix = directoryValue ? "?directory=" + encodeURIComponent(directoryValue) : "";
      const data = await api("/opencode/session" + suffix);
      const list = Array.isArray(data) ? data : (data.sessions || []);
      setSessions(list);
      if (list.length && !list.some((s: Session) => s.id === session)) setSession(list[0].id);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Gagal memuat sesi."); }
  }

  async function selectProject(value: string) {
    setProject(value); setSession(""); setConversation([]); setFiles([]); setSelectedFile("");
    await loadSessions(value);
    await loadFiles("", value);
  }

  async function newSession() {
    setBusy("new-session");
    try {
      const data = await api("/opencode/session" + (project ? "?directory=" + encodeURIComponent(project) : ""), {
        method: "POST", body: JSON.stringify({ title: "Zeus workspace session" }),
      });
      const created = data?.id ? data : data?.session;
      if (!created?.id) throw new Error("OpenCode tidak mengembalikan session ID.");
      setSessions(prev => [created, ...prev]); setSession(created.id); setConversation([]);
      setNotice("Sesi baru dibuat.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Gagal membuat sesi."); }
    finally { setBusy(""); }
  }

  async function sendPrompt(text = prompt) {
    if (!session) { setNotice("Pilih atau buat sesi terlebih dahulu."); return; }
    if (!text.trim()) return;
    setBusy("send"); setConversation(prev => [...prev, { role: "user", text }]); setPrompt("");
    try {
      const data = await api("/opencode/session/" + encodeURIComponent(session) + "/message" + (project ? "?directory=" + encodeURIComponent(project) : ""), {
        method: "POST", body: JSON.stringify({
          parts: [{ type: "text", text }],
          ...(activeModel ? { model: { providerID: activeModel.split("/")[0], modelID: activeModel.split("/").slice(1).join("/") } } : {}),
        }),
      });
      const parts = data?.parts || data?.message?.parts || [];
      const answer = parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") || pretty(data);
      setConversation(prev => [...prev, { role: "assistant", text: answer }]);
      await loadSessions(project);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Gagal mengirim prompt.";
      setConversation(prev => [...prev, { role: "system", text: "Error: " + message }]);
    } finally { setBusy(""); }
  }

  async function loadFiles(path: string, projectOverride = project) {
    try {
      const params = new URLSearchParams();
      if (projectOverride) params.set("directory", projectOverride);
      if (path) params.set("path", path);
      const data = await api("/opencode/file?" + params.toString());
      const list = Array.isArray(data) ? data : (data.files || []);
      setFiles(list); setDirectory(path);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Gagal membaca file."); }
  }

  async function openFile(file: FileEntry) {
    const path = String(file.path || file.name || "");
    if (!path) return;
    if (file.type === "directory" || file.isDirectory) { await loadFiles(path); return; }
    try {
      const params = new URLSearchParams({ path });
      if (project) params.set("directory", project);
      const data = await api("/opencode/file/content?" + params.toString());
      setSelectedFile(path);
      setFileContent(String(data.content || data.text || data || ""));
    } catch (e) { setNotice(e instanceof Error ? e.message : "Gagal membuka file."); }
  }

  function addTask() {
    const title = window.prompt("Nama task:");
    if (title?.trim()) setTasks(prev => [{ id: id(), title: title.trim(), detail: "", status: "todo" }, ...prev]);
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
  }

  function removeTask(taskId: string) { setTasks(prev => prev.filter(t => t.id !== taskId)); }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-icon"><Sparkles size={19}/></span> ZEUS<span className="muted"> / AI WORKSPACE</span></a>
        <div className="top-status"><span className={connected ? "dot online" : "dot"}/>{connected ? "OPENCODE CONNECTED" : "LOCAL AGENT DISCONNECTED"}</div>
        <button className="settings-toggle" onClick={() => setShowSettings(v => !v)}><Settings2 size={15}/> Connection <ChevronDown size={14}/></button>
      </header>

      <section className="hero">
        <div><div className="eyebrow">DEVELOPER AGENT WORKSPACE</div><h1>Build with your <em>agent.</em></h1><p>Kelola project, sesi coding, file, prompt, dan task melalui OpenCode yang berjalan di komputer kamu.</p></div>
        <div className="hero-badge"><Bot size={34}/><span>LOCAL-FIRST<br/>AGENT CONTROL</span></div>
      </section>

      {showSettings && <section className="connection-card">
        <div className="card-title"><div><span className="kicker">01 / CONNECTION</span><h2>OpenCode bridge</h2><p>Dashboard ini mengendalikan OpenCode melalui companion bridge lokal. Xingchi tetap digunakan dari konfigurasi provider resmi OpenCode.</p></div><span className={connected ? "pill good" : "pill"}>{connected ? "CONNECTED" : "NOT CONNECTED"}</span></div>
        <div className="connection-fields">
          <label>BRIDGE ADDRESS<input value={bridgeUrl} onChange={e => setBridgeUrl(e.target.value)} placeholder="https://your-tunnel.trycloudflare.com" autoComplete="url"/></label>
          <label>BRIDGE TOKEN<input type="password" value={bridgeToken} onChange={e => setBridgeToken(e.target.value)} placeholder="Token dari .env VPS" autoComplete="new-password"/></label>
          <button className="primary" onClick={connect} disabled={!!busy}>{busy === "connect" ? <LoaderCircle className="spin" size={16}/> : <Wifi size={16}/>} Connect</button>
        </div>
        <div className="hint"><ShieldCheck size={14}/> Alamat dan token bridge otomatis disimpan di browser ini. API Key Xingchi tetap dikonfigurasikan melalui OpenCode.</div>
      </section>}

      {connected && <section className="connection-card provider-card">
        <div className="card-title"><div><span className="kicker">02 / AI PROVIDERS</span><h2>Model & API key manager</h2><p>Pilih model dari katalog OpenCode. Kredensial tetap dikelola di VPS oleh OpenCode dan tidak disimpan di browser.</p></div><button className="secondary" onClick={() => setProviderPanel(v => !v)}><Settings2 size={14}/>{providerPanel ? "Hide details" : "Manage providers"}</button></div>
        <div className="provider-summary">
          <div><b>{models.length}</b><span>Available models</span></div>
          <div><b>{connectedProviders.length}</b><span>Connected providers</span></div>
          <div><b>{connectedProviders.join(", ") || "None reported"}</b><span>Provider credentials</span></div>
        </div>
        {providerPanel && <div className="provider-help">
          <strong>Secure API key setup</strong>
          <p>Untuk menambah atau mengganti API key, buka terminal VPS lalu jalankan OpenCode TUI dan perintah <code>/connect</code>. Pilih provider (atau Other untuk Xingchi), lalu masukkan key di terminal VPS. Jangan masukkan key ke chat atau browser Zeus.</p>
          <p>Custom provider seperti Xingchi memerlukan Base URL dan model ID yang benar di konfigurasi OpenCode. Setelah disimpan, tekan Refresh / reconnect di Zeus agar model yang tersedia dimuat ulang.</p>
          <div className="provider-list">{connectedProviders.map(provider => <span key={provider} className="pill good">{provider}</span>)}</div>
        </div>}
      </section>}
      <div className="layout">
        <aside className="sidebar">
          <div className="side-heading">WORKSPACE</div>
          <label className="project-label">ACTIVE PROJECT<select value={project} onChange={e => selectProject(e.target.value)}><option value="">Select project...</option>{projectOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
          <button className="side-action" onClick={newSession} disabled={!connected || !!busy}><Plus size={15}/> New agent session</button>
          <div className="side-heading spaced">NAVIGATION</div>
          <button className={activeView === "chat" ? "nav active" : "nav"} onClick={() => setActiveView("chat")}><MessageSquare size={16}/> Agent sessions</button>
          <button className={activeView === "files" ? "nav active" : "nav"} onClick={() => { setActiveView("files"); loadFiles(""); }}><Folder size={16}/> Project files</button>
          <button className={activeView === "tasks" ? "nav active" : "nav"} onClick={() => setActiveView("tasks")}><ListTodo size={16}/> Task board <span>{tasks.length}</span></button>
          <div className="side-heading spaced">SESSIONS</div>
          <div className="session-list">{sessions.slice(0,12).map(s => <button key={s.id} className={session === s.id ? "session active" : "session"} onClick={() => { setSession(s.id); setConversation([]); }}><Terminal size={13}/><span>{s.title || s.id.slice(0,12)}</span></button>)}</div>
          <div className="sidebar-foot"><ShieldCheck size={14}/> API key stays in OpenCode</div>
        </aside>

        <section className="main">
          {activeView === "chat" && <>
            <div className="section-head"><div><span className="kicker">02 / AGENT</span><h2>AI coding session</h2><p>Prompt dikirim ke sesi OpenCode aktif, bukan ke endpoint chat pihak ketiga.</p></div><button className="secondary" onClick={() => loadSessions(project)} disabled={!connected}><RefreshCw size={14}/> Refresh</button></div>
            <div className="chat-card">
              <div className="chat-toolbar"><span><span className="dot online"/> {session ? "SESSION " + session.slice(0,12) : "NO SESSION SELECTED"}</span><span>OPENCode SERVER</span></div>
              <div className="model-toolbar"><label>CODING MODEL<select value={activeModel} onChange={e => setActiveModel(e.target.value)} disabled={!connected || models.length === 0}><option value="">{models.length ? "Use OpenCode default" : "Connect to load models"}</option>{models.map(m => <option key={m.providerID + "/" + m.modelID} value={m.providerID + "/" + m.modelID}>{m.name}</option>)}</select></label><button className="secondary" onClick={async () => { try { const data = await api("/opencode/config/providers"); const ps = Array.isArray(data?.providers) ? data.providers : []; const next = ps.flatMap((p: any) => (Array.isArray(p.models) ? p.models : Object.entries(p.models || {}).map(([key, value]: [string, any]) => ({ id:key, ...value }))).map((m: any) => ({ providerID:String(p.id || p.providerID || ""), modelID:String(m.id || m.modelID || ""), name:String(p.name || p.id || p.providerID || "") + " / " + String(m.name || m.id || m.modelID || "") })).filter((m: any) => m.providerID && m.modelID)); setModels(next); setNotice("Daftar model diperbarui."); } catch (e) { setNotice(e instanceof Error ? e.message : "Gagal memuat model."); } }} disabled={!connected}><RefreshCw size={13}/> Models</button></div>
              <div className="conversation">
                {conversation.length === 0 ? <div className="welcome"><div className="welcome-icon"><Bot size={27}/></div><h3>Your coding agent is ready.</h3><p>Pilih sesi atau buat sesi baru, lalu kirim instruksi untuk menganalisis atau mengubah project.</p><div className="prompt-grid">{starterPrompts.map(item => <button key={item.name} onClick={() => setPrompt(item.prompt)}><Sparkles size={13}/>{item.name}</button>)}</div></div> : conversation.map((m, i) => <article className={"message " + m.role} key={i}><b>{m.role === "user" ? "YOU" : m.role === "assistant" ? "AGENT" : "SYSTEM"}</b><pre>{m.text}</pre></article>)}
                {busy === "send" && <div className="working"><LoaderCircle className="spin" size={15}/> Agent is working…</div>}
              </div>
              <div className="composer"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); } }} placeholder="Describe the coding task… (Enter to send, Shift+Enter for newline)"/><button className="primary send" onClick={() => sendPrompt()} disabled={!!busy || !session || !prompt.trim()}><Send size={16}/> Send prompt</button></div>
            </div>
            <div className="prompt-library"><div className="section-head compact"><div><span className="kicker">PROMPT LIBRARY</span><h3>Quick prompts</h3></div></div><div className="prompt-chips">{starterPrompts.map(item => <button key={item.name} onClick={() => setPrompt(item.prompt)}>{item.name}</button>)}</div></div>
          </>}

          {activeView === "files" && <><div className="section-head"><div><span className="kicker">03 / PROJECT</span><h2>File explorer</h2><p>Daftar file dibaca dari workspace OpenCode yang aktif.</p></div><button className="secondary" onClick={() => loadFiles(directory)}><RefreshCw size={14}/> Refresh</button></div><div className="files-layout"><div className="file-list"><div className="file-path"><FolderOpen size={14}/>{directory || project || "Project root"}</div>{directory && <button className="file-row" onClick={() => loadFiles(directory.split("/").slice(0,-1).join("/"))}>↰ ..</button>}{files.map((f,i) => <button className="file-row" key={String(f.path || f.name || i)} onClick={() => openFile(f)}>{f.type === "directory" || f.isDirectory ? <Folder size={15}/> : <FileCode2 size={15}/>}<span>{f.name || f.path}</span></button>)}{files.length === 0 && <p className="muted-text">Tidak ada file atau project belum dipilih.</p>}</div><div className="file-preview"><div className="preview-head"><Code2 size={14}/>{selectedFile || "Select a file"}</div><pre>{fileContent || "File content will appear here."}</pre></div></div></>}

          {activeView === "tasks" && <><div className="section-head"><div><span className="kicker">04 / PLANNING</span><h2>Task board</h2><p>Catat pekerjaan coding dan ubah statusnya. Task tersimpan di browser ini.</p></div><button className="primary" onClick={addTask}><Plus size={15}/> Add task</button></div><div className="task-columns">{(["todo","doing","done"] as const).map(status => <section className="task-column" key={status}><h3>{status === "todo" ? "To do" : status === "doing" ? "In progress" : "Done"}<span>{tasks.filter(t => t.status === status).length}</span></h3>{tasks.filter(t => t.status === status).map(t => <article className="task" key={t.id}><strong>{t.title}</strong><textarea value={t.detail} onChange={e => updateTask(t.id,{detail:e.target.value})} placeholder="Notes / acceptance criteria"/><div><select value={t.status} onChange={e => updateTask(t.id,{status:e.target.value as Task["status"]})}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select><button onClick={() => removeTask(t.id)} aria-label="Delete task"><Trash2 size={14}/></button></div></article>)}</section>)}</div></>}
          <footer className="footer"><span>ZEUS AI CODING WORKSPACE</span><span>LOCAL BRIDGE · OPENCODE · PROVIDER ROUTING</span></footer>
        </section>
      </div>
      {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice("")}><X size={14}/></button></div>}
    </main>
  );
}
