use crate::document::{CoreResult, DocumentId, DocumentSession, SessionId};

pub fn open_fixture_bytes(bytes: &[u8]) -> CoreResult<DocumentSession> {
    DocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes)
}
