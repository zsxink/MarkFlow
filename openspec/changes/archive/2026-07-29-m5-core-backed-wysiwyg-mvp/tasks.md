## 1. Core Render IR

- [x] 1.1 Add Core Render IR types and a `DocumentSession::render_blocks` facade using revision and UTF-16 viewport validation
- [x] 1.2 Implement M5 block and inline extraction with unknown/source fallback and source-range to UTF-16 conversion
- [x] 1.3 Add Core tests for render source ranges, UTF-16 mapping, block/inline coverage, stale revision, and large document viewport behavior

## 2. Runtime and Bridge

- [x] 2.1 Add `get_render_blocks` DTOs and Tauri command with session/revision/request validation
- [x] 2.2 Register the command and add Bridge tests for matching response, stale revision, and missing session error mapping
- [x] 2.3 Add TypeScript Bridge DTOs and `getRenderBlocks` client function

## 3. Editor Adapter

- [x] 3.1 Add CodeMirror WYSIWYG Render IR extension with viewport-scoped decorations, marker reveal, and stale response drop
- [x] 3.2 Add safe image preview widget lifecycle with keyboard source reveal and sanitized URL handling
- [x] 3.3 Add adapter tests for decorations, marker reveal, mode-switch text preservation, stale/cross-session drop, widget cleanup, large document viewport, and unsafe content behavior

## 4. Integration and Validation

- [x] 4.1 Keep legacy ProseMirror WYSIWYG compatibility reachable while exposing the Core-backed WYSIWYG adapter path
- [x] 4.2 Run OpenSpec, Rust, TypeScript, and build validations for the M5 MVP
- [x] 4.3 Wire Core-backed WYSIWYG into real mode switch/UI while keeping the Core session and confirmed source
- [x] 4.4 Add mode-switch integration coverage proving Core WYSIWYG does not call legacy `setContent`/serializer and preserves source text
- [x] 4.5 Re-run targeted and full validations after the P1 fix
