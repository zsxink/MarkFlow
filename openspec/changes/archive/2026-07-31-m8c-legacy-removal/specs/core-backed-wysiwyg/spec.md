## MODIFIED Requirements

### Requirement: Source/WYSIWYG switching is byte-preserving
The Core-backed WYSIWYG path SHALL use the same Markdown text mirror and Core confirmed snapshot model as Source Mode. Switching between Source Mode and Core-backed WYSIWYG SHALL flush pending patches before leaving a mode and SHALL NOT call the ProseMirror serializer. After M8C removal, the legacy ProseMirror WYSIWYG compatibility path MUST NOT be used for product-path save or whole-document mode synchronization.

#### Scenario: Round trip does not change bytes
- **WHEN** a file is opened through Core-backed Source Mode
- **WHEN** the user switches to Core-backed WYSIWYG and back without editing
- **THEN** the document text remains byte-for-byte unchanged
- **THEN** no ProseMirror serializer API is called by the new path

#### Scenario: Source to Core WYSIWYG keeps Core session
- **WHEN** a Core-backed Source Mode session is active
- **WHEN** the user switches to WYSIWYG with Core-backed WYSIWYG enabled
- **THEN** the existing Core session remains active
- **THEN** CodeMirror is remounted with Render IR projection for the same session and confirmed revision
- **THEN** legacy ProseMirror `setContent` and Markdown serializer APIs are not called

#### Scenario: Core WYSIWYG to Source keeps source text
- **WHEN** the user switches from Core-backed WYSIWYG back to Source Mode
- **THEN** the editor flushes pending Core patches
- **THEN** CodeMirror is remounted as Source Mode with the same Markdown source text
- **THEN** the Core session remains active and the legacy ProseMirror path is not used

#### Scenario: WYSIWYG remains available without serializer save
- **WHEN** M8C removal is complete
- **THEN** WYSIWYG editing remains available through Core-backed projection and patching
- **THEN** product save and mode-switch paths MUST NOT call ProseMirror serializer or whole-document Markdown serializer fallback

## REMOVED Requirements

### Requirement: Legacy WYSIWYG remains available
**Reason**: This M5 transition requirement allowed the old ProseMirror compatibility path while Core-backed WYSIWYG was incomplete. M8C requires P0/P1 migration completion and removal of legacy serializer document-truth paths.
**Migration**: Keep WYSIWYG as Core-backed projection. Unsupported syntax remains editable source through Render IR fallback, not through ProseMirror serializer save or whole-document sync.
