#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentSizeClass {
    Normal,
    Large,
    Huge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeferredWork {
    Immediate,
    OnDemand,
    DisabledByDefault,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LargeDocumentPolicy {
    pub byte_len: usize,
    pub size_class: DocumentSizeClass,
    pub block_scan: DeferredWork,
    pub inline_parse: DeferredWork,
    pub diagram_render: DeferredWork,
    pub image_diagnostics: DeferredWork,
    pub full_diagnostics: DeferredWork,
    pub viewport_render: bool,
    pub paged_search: bool,
}

impl LargeDocumentPolicy {
    pub const LARGE_THRESHOLD_BYTES: usize = 1024 * 1024;
    pub const HUGE_THRESHOLD_BYTES: usize = 10 * 1024 * 1024;

    pub fn for_byte_len(byte_len: usize) -> Self {
        let size_class = if byte_len > Self::HUGE_THRESHOLD_BYTES {
            DocumentSizeClass::Huge
        } else if byte_len > Self::LARGE_THRESHOLD_BYTES {
            DocumentSizeClass::Large
        } else {
            DocumentSizeClass::Normal
        };

        let deferred = match size_class {
            DocumentSizeClass::Normal => DeferredWork::Immediate,
            DocumentSizeClass::Large => DeferredWork::OnDemand,
            DocumentSizeClass::Huge => DeferredWork::DisabledByDefault,
        };

        Self {
            byte_len,
            size_class,
            block_scan: DeferredWork::Immediate,
            inline_parse: deferred,
            diagram_render: deferred,
            image_diagnostics: deferred,
            full_diagnostics: deferred,
            viewport_render: size_class != DocumentSizeClass::Normal,
            paged_search: size_class != DocumentSizeClass::Normal,
        }
    }

    pub fn permits_default_inline_parse(self) -> bool {
        self.inline_parse == DeferredWork::Immediate
    }

    pub fn permits_default_full_diagnostics(self) -> bool {
        self.full_diagnostics == DeferredWork::Immediate
    }
}
