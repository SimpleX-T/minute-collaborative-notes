# Minute

Minute is an account-free collaborative block editor for engineering meetings. Create a room, share its editor link, and capture context, code, decisions, and owned next steps together in real time.

Use **Float** in a note to keep a compact BlockNote editor above other windows during a call. Chromium browsers use Document Picture-in-Picture; other browsers receive a standard pop-out window. Production Picture-in-Picture requires HTTPS.

Pads are private-by-link by default. An editor can explicitly **Publish** a pad to the landing page's discoverable Public Pads directory and unpublish it at any time. Published pads remain editable by anyone with access, so do not publish sensitive meeting material.

The canonical document is a BlockNote/Yjs block tree. It supports slash commands, headings, lists, tasks, links, tables, images, and syntax-highlighted code blocks, with Markdown export for portability.

## Access model

Room creation returns separate bearer owner and editor capabilities in the URL fragment. The Share dialog can copy an editor link or a token-free view-only link; public-pad and reading-view links are view-only. Owners can lock and unlock editing, while the WebSocket server rejects viewer writes and non-owner writes while locked. Capability hashes live in a server-only access sidecar rather than the collaborative document. This is a capability-link beta model, not a substitute for authenticated enterprise access control.

## Run locally

```bash
npm install
npm run dev
```

The UI runs at `http://localhost:5173`; API and WebSocket traffic is proxied to the collaboration server on port `8787`.

## Production

```bash
npm run build
PORT=8787 DATA_DIR=/var/lib/minute npm start
```

Put the process behind a TLS reverse proxy that supports WebSocket upgrades. Mount `DATA_DIR` on persistent storage. Set `ALLOWED_ORIGINS` to a comma-separated allowlist. For a split Vercel/Render deployment set `VITE_API_URL` on Vercel to the Render HTTPS service URL. For horizontal scaling, replace the in-process room map with shared Yjs persistence/broadcast infrastructure and use connection draining during deploys.

## Privacy model

Rooms use bearer-capability links with separate owner, editor, and viewer roles. Owner and editor fragments are hashed before server storage; token-free links are read-only. Notes persist on the server unencrypted, so the current version is appropriate for ordinary internal meetings—not secrets or regulated data. Add expiry, link rotation, audit logs, and end-to-end encryption before handling sensitive material.

## Embed contract

`/embed/:roomId` renders a compact, chrome-light editor suitable for Document Picture-in-Picture and meeting-app side panels. It includes a versioned, exact-origin `postMessage` bridge for ready, state, focus, and Markdown snapshot events. See [`docs/EMBED_PROTOCOL.md`](docs/EMBED_PROTOCOL.md). Provider-specific Google Meet, Teams, Zoom, and Slack adapters remain roadmap work.

See [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) for the beta and world-class quality gates.
