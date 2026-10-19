# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineering teams in active meetings: an engineer, technical lead, or CTO needs one shared working surface for context, decisions, code, and owned next steps without making every participant create an account.

## Product Purpose

Minute turns a live engineering conversation into a durable, jointly owned artifact. A host creates a note, shares a link, and participants edit the same structured document immediately. Success means nobody retakes notes, decisions remain attributable, and action items survive the meeting.

## Positioning

Minute is the collaborative notepad designed for the meeting already in progress: lower-friction than a workspace tool, more structured than a blank pad, and more engineering-native than an AI transcript.

## Operating Context

Desktop and mobile browsers during in-person, Google Meet, Zoom, Slack Huddle, and Teams meetings. Notes may contain prose, checklists, code, links, diagrams, decisions, and assignments. A compact always-on-top view supports working in another tab or application.

## Capabilities and Constraints

- No login is required for the current product stage.
- Notes are private-by-link unless explicitly published.
- Real-time content uses Yjs over WebSockets.
- The editor must use BlockNote blocks as its canonical collaborative document model.
- Rooms need owner/editor/viewer links, lock/unlock behavior, durable persistence, revision recovery, export, and presence.
- The product must expose an embed-safe route and SDK boundary for future meeting-app integrations.
- Authentication, regulated-data compliance, enterprise administration, and billing remain open product decisions.

## Brand Commitments

The product is named Minute. Its voice is direct, calm, technically literate, and never corporate or performative. The experience must remain fast, account-free, and visually restrained even as capability grows.

## Evidence on Hand

- Working React client and Node WebSocket server.
- CRDT convergence tests and persistent local Yjs documents.
- Picture-in-picture editor, public pads, Markdown export, and live presence.
- Multi-format export includes Markdown, plain text, HTML, JSON, DOCX, and PDF.
- Engineers can create standalone syntax-highlighted code pastes with raw links and expiry.
- Room owners can checkpoint, inspect, and restore document versions.
- Original collaboration artwork at `public/assets/collaboration-still-life.png`.
- No validated customers, benchmarks, testimonials, pricing, or compliance claims exist yet.

## Product Principles

1. A link should be enough to join useful work.
2. The meeting artifact matters more than the transcript.
3. Powerful blocks should appear contextually, not as permanent chrome.
4. Privacy is explicit: private by default, publication deliberate, permissions legible.
5. Every document remains portable and recoverable.

## Accessibility & Inclusion

Keyboard-first editing, visible focus, reduced-motion support, semantic controls, WCAG 2.2 AA contrast, and usable mobile/touch targets are release requirements.
