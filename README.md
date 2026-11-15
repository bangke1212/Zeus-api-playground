# Zeus AI Coding Workspace

A Next.js dashboard for managing coding projects, OpenCode sessions, prompts, files, and a lightweight task board. The dashboard talks to a **local companion bridge**, which forwards approved workspace operations to your locally running OpenCode server.

## Important Xingchi compatibility design

Zeus does **not** send requests to Xingchi's chat API and does not impersonate Codex, Cursor, or another client. AI work is executed by the supported OpenCode client/server. Configure your existing Xingchi credential in OpenCode using Xingchi's own supported setup instructions. A valid key does not override provider client restrictions.

This first integration implements OpenCode. Codex app-server support is not included in this release.

## Architecture

```text
Browser (Zeus on Vercel or localhost)
        | HTTP + bridge token + allowlisted Origin
        v
Local Zeus Bridge (127.0.0.1:4173)
        | loopback only
        v
OpenCode Server (127.0.0.1:4096)
        |
        v
Xingchi provider configured inside OpenCode
```

The local bridge binds to loopback only, requires a random token, restricts browser origins, allows only selected OpenCode API route families, and never receives or stores the Xingchi API key.

## Run locally

Requirements: Node.js 20+ and OpenCode installed/configured.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.env` (do not commit it) with a strong random token:

   ```env
   ZEUS_BRIDGE_TOKEN=replace-with-a-random-secret-at-least-24-characters
   ZEUS_BRIDGE_PORT=4173
   ZEUS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   OPENCODE_URL=http://127.0.0.1:4096
   ```

3. Start OpenCode's local server in one terminal:

   ```bash
   opencode serve --hostname 127.0.0.1 --port 4096
   ```

4. Start the Zeus bridge in another terminal (load the variables from your shell or use your preferred dotenv runner):

   ```bash
   npm run agent:bridge
   ```

5. Start the dashboard:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000, enter the bridge token, and connect.

For a Vercel-hosted dashboard, add the exact deployment origin (for example `https://your-project.vercel.app`) to `ZEUS_ALLOWED_ORIGINS` on the computer running the bridge, restart the bridge, and connect from the browser. The local bridge must remain running. Browser access to localhost may be restricted by browser/network policy; local dashboard use is the simplest supported setup.

## Features

- Connect to a locally running OpenCode server through a loopback-only companion bridge.
- Browse OpenCode projects and sessions.
- Create sessions and send coding prompts to the active OpenCode session.
- Browse workspace files and preview text file content.
- Local task board and prompt shortcuts.
- Responsive dark developer workspace.

## Security

- Never put Xingchi credentials in Zeus, browser storage, `NEXT_PUBLIC_*` variables, or this repository.
- Configure credentials only in the supported OpenCode provider configuration flow.
- The bridge token is entered in page memory and is not persisted.
- Keep the bridge bound to loopback; do not expose port 4173 or the OpenCode server directly to the public internet.
- Set `ZEUS_ALLOWED_ORIGINS` to trusted origins only.
- Do not commit `.env` or provider credential files.
- This is a single-user local companion, not a public multi-tenant agent service.

## Deploy dashboard to Vercel

Import this repository into Vercel with the Next.js preset. No Vercel environment variables are required for the dashboard. The local companion bridge and OpenCode server run on your own machine and must be started separately.

## Scripts

- `npm run dev` — Next.js development server
- `npm run build` — production build
- `npm run start` — production web server
- `npm run agent:bridge` — local OpenCode companion bridge
