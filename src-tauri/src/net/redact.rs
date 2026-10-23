//! Log sanitisation for URLs.
//!
//! Query strings and fragments commonly carry tokens, so they never reach the
//! log files.

/// Strip query string and fragment from a URL so that secrets are not
/// leaked into log files.  Returns `"scheme://host/path"`.
pub fn redact_url_for_log(url: &str) -> String {
    match reqwest::Url::parse(url) {
        Ok(parsed) => {
            let path = parsed.path();
            format!(
                "{}://{}{}",
                parsed.scheme(),
                parsed.host_str().unwrap_or(""),
                path
            )
        }
        Err(_) => url.to_string(),
    }
}
