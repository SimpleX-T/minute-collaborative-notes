# Minute: World-Class Product Target

## Current score — October 2026, verified beta

| Dimension | Current | Public beta target | World-class target |
|---|---:|---:|---:|
| UI craft and usability | 8.4/10 | 8.5/10 | 9.5/10 |
| Collaborative editing | 8.0/10 | 8.5/10 | 9.5/10 |
| Permissions and trust | 7.4/10 | 8.5/10 | 9.5/10 |
| Reliability and recovery | 7.6/10 | 8.5/10 | 9.5/10 |
| Engineering workflows | 8.1/10 | 8.5/10 | 9.5/10 |
| Integrations and extensibility | 5.5/10 | 7.5/10 | 9/10 |

The current product is a strong, differentiated public beta—not yet a world-class collaboration platform. The editor, capability links, durable save acknowledgement, exports, history, code pastes, embed contract, and visual system are real and verified. The remaining distance is concentrated in scale, governance, integration adapters, and operational maturity rather than surface-level UI.

## Public beta gate

- BlockNote-native collaborative blocks and cursors.
- Owner, editor, and viewer capabilities; server-enforced room locking. Link rotation remains a beta milestone.
- Durable persistent-disk storage with revision snapshots and restore. Move to shared object/database persistence before horizontal scaling.
- Slash menu, code blocks, task lists, tables, callouts, diagrams, and Markdown/HTML export.
- Presence, reconnect states, abuse limits, and security headers. Add offline queue visibility, structured observability, and error reporting before broad launch.
- Responsive editor, PiP, embed route, and documented postMessage/SDK contract.
- Automated unit, multiplayer convergence, permission, persistence, paste, and version tests. Add automated accessibility and cross-browser smoke coverage.

## Next quality gate — 8.5/10 beta

1. Add Playwright coverage for create, edit, share, lock, restore, export, mobile actions, keyboard navigation, and reconnect behavior.
2. Add structured logs, error capture, latency/save metrics, uptime checks, and an explicit 99.9% availability target.
3. Move collaborative state and pub/sub behind a shared persistence adapter so multiple backend instances can safely serve one room.
4. Add capability rotation, room expiry/deletion, automatic revision cadence, and auditable access events.
5. Ship one provider adapter end to end—start with a Chrome side-panel extension for Google Meet using the existing embed protocol.

## World-class gate

- Comments, threads, suggestions, authorship history, named revisions, and granular restore.
- End-to-end encrypted rooms and enterprise key-management option.
- Google Meet, Teams, Zoom, Slack, Linear, GitHub, and calendar integrations.
- Action-item extraction into external trackers without making AI mandatory.
- Multi-region collaboration, SLOs, load shedding, audit events, and administrator controls.
- Template/plugin SDK with versioned schemas and backward-compatible embeds.
