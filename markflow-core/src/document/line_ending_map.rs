#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineEndingKind {
    Lf,
    Crlf,
    Cr,
    Mixed,
}

impl LineEndingKind {
    pub fn as_str(self) -> &'static str {
        match self {
            LineEndingKind::Lf => "\n",
            LineEndingKind::Crlf => "\r\n",
            LineEndingKind::Cr => "\r",
            LineEndingKind::Mixed => "\n",
        }
    }

    pub fn width(self) -> usize {
        self.as_str().len()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct LineEndingSpan {
    start: usize,
    len: usize,
    kind: LineEndingKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineEndingMap {
    spans: Vec<LineEndingSpan>,
    len: usize,
    dominant: LineEndingKind,
}

impl LineEndingMap {
    pub fn empty(dominant: LineEndingKind) -> Self {
        Self {
            spans: Vec::new(),
            len: 0,
            dominant: normalize_dominant(dominant),
        }
    }

    pub fn from_kinds(kinds: Vec<LineEndingKind>) -> Self {
        if kinds.is_empty() {
            return Self::empty(LineEndingKind::Lf);
        }

        let dominant = dominant_kind(&kinds);
        let mut spans = Vec::new();
        let mut start = 0;
        let mut current = kinds[0];
        let mut len = 0;
        for (idx, kind) in kinds.iter().copied().enumerate() {
            if kind == current {
                len += 1;
            } else {
                spans.push(LineEndingSpan {
                    start,
                    len,
                    kind: current,
                });
                start = idx;
                current = kind;
                len = 1;
            }
        }
        spans.push(LineEndingSpan {
            start,
            len,
            kind: current,
        });

        Self {
            spans,
            len: kinds.len(),
            dominant,
        }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn dominant(&self) -> LineEndingKind {
        self.dominant
    }

    pub fn kind_at(&self, boundary_index: usize) -> Option<LineEndingKind> {
        if boundary_index >= self.len {
            return None;
        }
        self.spans
            .iter()
            .find(|span| boundary_index >= span.start && boundary_index < span.start + span.len)
            .map(|span| span.kind)
    }

    pub fn to_kinds(&self) -> Vec<LineEndingKind> {
        let mut out = Vec::with_capacity(self.len);
        for span in &self.spans {
            out.resize(span.start, self.dominant);
            out.resize(span.start + span.len, span.kind);
        }
        out
    }

    pub fn replace_range(
        &self,
        start_boundary: usize,
        end_boundary: usize,
        replacement: &[LineEndingKind],
    ) -> Self {
        if start_boundary == end_boundary && replacement.is_empty() {
            return self.clone();
        }
        let mut kinds = self.to_kinds();
        kinds.splice(start_boundary..end_boundary, replacement.iter().copied());
        if kinds.is_empty() {
            Self::empty(self.dominant)
        } else {
            Self::from_kinds(kinds)
        }
    }
}

fn normalize_dominant(kind: LineEndingKind) -> LineEndingKind {
    match kind {
        LineEndingKind::Mixed => LineEndingKind::Lf,
        other => other,
    }
}

fn dominant_kind(kinds: &[LineEndingKind]) -> LineEndingKind {
    let (mut lf, mut crlf, mut cr) = (0, 0, 0);
    for kind in kinds {
        match kind {
            LineEndingKind::Lf => lf += 1,
            LineEndingKind::Crlf => crlf += 1,
            LineEndingKind::Cr => cr += 1,
            LineEndingKind::Mixed => {}
        }
    }
    if lf > 0 && crlf == 0 && cr == 0 {
        return LineEndingKind::Lf;
    }
    if crlf > 0 && lf == 0 && cr == 0 {
        return LineEndingKind::Crlf;
    }
    if cr > 0 && lf == 0 && crlf == 0 {
        return LineEndingKind::Cr;
    }
    if crlf >= lf && crlf >= cr {
        LineEndingKind::Crlf
    } else if lf >= cr {
        LineEndingKind::Lf
    } else {
        LineEndingKind::Cr
    }
}
