//! Redirect-following fetch with DNS and size guards.

use super::redirect::validate_redirect_url;

/// Fetch a URL, following up to `max_redirects` redirects.
///
/// Each redirect target is validated for scheme downgrade, DNS safety, and port.
/// DNS resolution goes through [`crate::net::dns::ValidatingResolver`] to prevent
/// TOCTOU rebinding.
/// If `max_response_bytes` is set, Content-Length is checked before streaming.
/// Uses the shared `client` (caller owns the singleton).
pub async fn fetch_with_redirects(
    client: &reqwest::Client,
    url: &str,
    max_redirects: u32,
    validate_url: fn(&str) -> Result<reqwest::Url, String>,
    max_response_bytes: Option<u64>,
) -> Result<reqwest::Response, String> {
    let mut current_url = validate_url(url)?;
    let original_scheme = current_url.scheme().to_string();

    // Note: DNS validation is handled by ValidatingResolver during connection.
    // No manual resolve_and_validate_host call needed here — that would create
    // a redundant TOCTOU window.

    let mut redirects_remaining = max_redirects;

    loop {
        let response = client
            .get(current_url.clone())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch URL: {}", e))?;

        if response.status().is_redirection() {
            if redirects_remaining == 0 {
                return Err("Too many redirects".into());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("Redirect location missing")?;
            let next_url = current_url
                .join(location)
                .map_err(|e| format!("Invalid redirect URL: {}", e))?;

            // Full validation: URL format + scheme downgrade + DNS IP check
            validate_redirect_url(&next_url, &original_scheme).await?;

            current_url = next_url;
            redirects_remaining -= 1;
            continue;
        }

        // Content-Length pre-check: reject oversized responses before streaming
        if let Some(max) = max_response_bytes {
            if let Some(content_length) = response.content_length() {
                if content_length > max {
                    return Err(format!(
                        "Response too large: Content-Length {} exceeds limit {}",
                        content_length, max
                    ));
                }
            }
        }

        return Ok(response);
    }
}
