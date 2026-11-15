# Zeus API Playground

A full-stack API testing workspace built with Next.js and designed for Vercel.

## Features

- Test OpenAI-compatible `/models` and `/chat/completions` endpoints.
- Configure provider name, HTTPS base URL, model, temperature, and token limit.
- API keys are held in page memory and sent only to the server proxy for the current request. They are not written to localStorage or server logs.
- Request preview, response viewer, latency, HTTP status, and local request history.
- Copy a cURL example and export the latest response.
- Responsive dark interface.

## Deploy to Vercel

1. Import this repository into Vercel.
2. Framework preset: **Next.js** (detected automatically).
3. No environment variables are required for the basic setup.
4. Deploy.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Provider setup

Use an HTTPS base URL, for example:

- Xingchi AI: `https://api.xingchiapi.com/v1`
- OpenAI: `https://api.openai.com/v1`
- OpenRouter: `https://openrouter.ai/api/v1`

Enter an API key and model ID supplied by the provider. The app does not invent or guarantee model IDs.

**Important:** This playground sends ordinary OpenAI-compatible API requests. A valid API key does not override provider-side client restrictions. If Xingchi rejects third-party clients, the request will still be rejected; obtain explicit provider approval rather than spoofing an approved client.

## Security notes

- Never commit API keys or put them in `NEXT_PUBLIC_*` variables.
- Keys are kept in component memory only; refreshing the page clears the key.
- The server proxy requires HTTPS and blocks localhost/private IP literal destinations. Use only trusted provider endpoints.
- This is a personal developer tool, not a multi-tenant production gateway. Add authentication, rate limiting, quotas, and audit controls before exposing it to the public.

## API route

`POST /api/playground`

Actions:
- `models`: requests `GET {baseUrl}/models`
- `chat`: requests `POST {baseUrl}/chat/completions`

The route forwards the provider response and status without storing credentials.
