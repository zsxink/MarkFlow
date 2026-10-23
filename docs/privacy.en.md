# Privacy

MarkFlow is a local-first Markdown editor. This document describes what the app
reads and writes on your machine, when it goes online, and exactly what leaves
your computer when it does. It is the English counterpart of
`docs/privacy.md`; both versions say the same thing.

## Short version

MarkFlow does not report usage data, does not check for updates, and does not
collect anything over the network. The only outbound traffic is the PlantUML
server **you** configure, plus remote images you explicitly reference.

## Local storage

MarkFlow does not store your documents in the cloud. Every file you open is a real
file on your disk, and saving writes straight back to that path.

Besides the documents themselves, the app keeps a small amount of local state:

| Data | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Settings (`settings.json`), including recent files and folders | `~/Library/Application Support/MarkFlow/` | `%APPDATA%\MarkFlow\` | `~/.config/MarkFlow/` |
| Logs (daily rotation, 7-day retention) | `~/Library/Application Support/MarkFlow/logs/` | `%APPDATA%\MarkFlow\logs\` | `~/.config/MarkFlow/logs/` |
| Staged pasted images | `~/Library/Application Support/MarkFlow/pending-images/` | `%LOCALAPPDATA%\MarkFlow\pending-images\` | `~/.local/share/MarkFlow/pending-images/` |

Notes:

- **Recent files** stores absolute paths only, at most 10 entries, and can be
  cleared from the app menu.
- **Logs** exist for troubleshooting and record operations and errors. URL query
  strings are masked as `<redacted>`, and logs older than 7 days are deleted at
  startup. Logs are never uploaded anywhere.
- **Staged images** are temporary copies of images you paste, held until the
  document is saved and they are written as real files next to the document. If
  the app crashes they stay behind and are cleaned up on the next start.

## No telemetry

MarkFlow:

- **does not collect** usage statistics, crash reports, feature analytics, or any
  device identifier;
- **does not embed** third-party analytics SDKs (no Sentry, Google Analytics,
  BugSnag, etc.);
- **does not check for updates** — there is no version query at startup or on a
  timer;
- **does not contact** any server belonging to this project — there is no backend.

The app only writes log files locally; logs stay on your machine.

## Network behaviour

There are exactly two kinds of network requests, and both are triggered by you.

### 1. PlantUML diagrams (only after you configure a server)

The PlantUML server address defaults to empty. **While it is empty, MarkFlow
issues no network request for PlantUML code blocks** — the diagram is shown as a
plain code block.

Once you enter a server address under Settings → PlantUML, MarkFlow sends the
**source text of that `plantuml` block** to that address and fetches the rendered
SVG. Specifically:

- the payload is the diagram source only — not the rest of the document, not the
  file path, not any metadata;
- the destination is entirely determined by the address you typed; MarkFlow ships
  no default server and recommends none;
- if you point it at a public server (e.g. `plantuml.com`), the diagram source
  leaves your machine and lands with that third party, under their privacy policy;
- for sensitive content, run your own PlantUML service (local Docker, an internal
  instance) and point the address at it.

The settings panel shows the same warning, and the two must stay consistent.

### 2. Remote images

Remote images referenced as `![](https://...)` have to be downloaded to be
displayed. MarkFlow requests them from their own host when they scroll into view,
and nothing more. Point the reference at a local path, or avoid remote image
references, to eliminate these requests.

## Exported files

Exported HTML inlines its fonts as base64, so the file works fully offline and
makes no external requests. Exported PDF and Word (`.docx`) files likewise
reference no remote resources.

Export files go wherever you choose in the save dialog; MarkFlow never sends them
anywhere on its own.

## Permissions

MarkFlow constrains itself through Tauri capability configuration:

- file access is limited to paths you pick or folders you have opened;
- HTTP is limited to `http://` and `https://`, with no call sites beyond PlantUML
  and remote images;
- there is no shell execution permission and no arbitrary filesystem traversal.

## Changes and contact

This document is updated as the app changes. If you have questions about data
handling, or find that this description does not match actual behaviour, please
open an issue at <https://github.com/zsxink/MarkFlow/issues>.

Related documents:

- [Third-party notices](../THIRD-PARTY-NOTICES.md)
- [Font provenance](../third-party/fonts/PROVENANCE.md)
- [Bundled asset provenance](../third-party/assets/PROVENANCE.md)
- [Main license](../LICENSE)
