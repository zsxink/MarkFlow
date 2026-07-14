## ADDED Requirements

### Requirement: Local image streaming via asset protocol
The system SHALL prefer streaming local image files through the Tauri `asset://` protocol instead of Base64 encoding and IPC transfer.

#### Scenario: Local image displayed via asset URL
- **WHEN** a local image file is referenced in the document
- **THEN** the system uses `convertFileSrc()` to generate an asset protocol URL
- **THEN** the image is loaded directly from disk by the browser
- **THEN** no Base64 encoding or IPC transfer occurs for the image data

#### Scenario: Local image copied to storage
- **WHEN** user pastes a local image file and settings require copying to workspace storage
- **THEN** Rust copies the file via `fs::copy` from source to destination path
- **THEN** no Base64 intermediate representation is created
- **THEN** the destination path is converted to an asset protocol URL

#### Scenario: Base64 fallback when asset protocol unavailable
- **WHEN** `storageMode` is set to `none`
- **THEN** the image is read as Base64 data URL
- **THEN** the data URL is used directly in the document

### Requirement: Network image streaming with temp file
The system SHALL stream network image downloads to a temporary file and atomically rename on completion.

#### Scenario: Network download writes to temp file
- **WHEN** a network image download is triggered
- **THEN** the download stream is written to a temporary file in the same directory as the destination
- **THEN** the temp filename uses a `.tmp` extension plus a random suffix

#### Scenario: Completed download atomically renamed
- **WHEN** the network download completes successfully
- **THEN** the file size is validated against the content-length header
- **THEN** the MIME type is verified to start with `image/`
- **THEN** the temp file is atomically renamed to the destination filename
- **THEN** if validation fails, the temp file is deleted and an error is returned

#### Scenario: Failed download cleans up temp file
- **WHEN** a network download fails partway through
- **THEN** the partial temp file is deleted
- **THEN** an error is returned with the failure reason
- **THEN** no partial file remains on disk

### Requirement: Binary IPC for image data
When IPC transfer of image data is necessary, the system SHALL use binary transfer and check source size before encoding.

#### Scenario: Size check before IPC transfer
- **WHEN** a command receives a request to transfer image data via IPC
- **THEN** the source file size is checked before reading into memory
- **THEN** if the file exceeds 20MB, an error is returned immediately without reading
- **THEN** if the file is within limits, the data is transferred

#### Scenario: Image size limit is enforced for Base64
- **WHEN** `read_file_as_base64` is called for a file larger than 20MB
- **THEN** an error is returned: "文件过大，最大支持 20MB"
- **THEN** no data is read or encoded

### Requirement: Concurrency limits
The system SHALL limit concurrent image processing operations and total bytes in flight.

#### Scenario: Maximum concurrent operations
- **WHEN** more than 4 image processing operations are requested simultaneously
- **THEN** additional operations are queued
- **THEN** operations are processed as prior ones complete
- **THEN** a maximum of 4 operations execute concurrently

#### Scenario: Object URL cleanup
- **WHEN** an image is removed from the document or the document is closed
- **THEN** the associated object URL is revoked via `URL.revokeObjectURL()`
- **THEN** any intermediate ArrayBuffer or Blob references are released
- **THEN** no memory leak occurs from unreleased image resources

#### Scenario: Browser memory management
- **WHEN** an image is loaded and displayed in the editor
- **THEN** the `loading="lazy"` attribute is set on the image element
- **THEN** the browser can unload off-screen images as needed
