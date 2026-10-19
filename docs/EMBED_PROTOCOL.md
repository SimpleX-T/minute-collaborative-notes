# Minute Embed Protocol v1

Minute's `/embed/:roomId` route is the stable integration surface for meeting side panels, browser extensions, and desktop shells. Hosts must be listed in the frontend `VITE_EMBED_ORIGINS` allowlist and the deployment's `frame-ancestors` policy (`ALLOWED_EMBED_ORIGINS` on the combined Node deployment). Hosts should load the embed with an explicit `hostOrigin` query parameter.

```text
https://minute.example/embed/ROOM_ID?hostOrigin=https%3A%2F%2Fmeet.google.com
```

Messages use `window.postMessage`, protocol version `1`, and an exact-origin allowlist. Minute never accepts wildcard commands and never sends document content until an allowed host explicitly requests a snapshot.

## Host to Minute

```js
iframe.contentWindow.postMessage({
  source: 'minute-host',
  version: 1,
  type: 'minute:focus', // or minute:snapshot
  roomId,
  requestId: crypto.randomUUID()
}, minuteOrigin)
```

## Minute to host

- `minute:ready` — the embed loaded and advertises capabilities.
- `minute:state` — title, connection, lock, role, and participant-count changes.
- `minute:snapshot-result` — Markdown snapshot for a matching request ID.

The protocol deliberately excludes authentication and meeting-provider APIs. A Google Meet, Teams, Zoom, or Slack adapter should own provider authorization and pass only the minimum meeting context into Minute. Future protocol versions must remain backward compatible.
