use std::time::Duration;

/// Create a reqwest Client with no redirect following and a configurable timeout.
pub fn create_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

/// Fetch a URL, following up to max_redirects redirects, validating each URL.
/// Uses the provided `validate_url` callback to validate both the initial URL
/// and any redirect targets.
/// Returns the final response (success or error, but not a redirect).
pub async fn fetch_with_redirects(
    client: &reqwest::Client,
    url: &str,
    max_redirects: u32,
    validate_url: fn(&str) -> Result<reqwest::Url, String>,
) -> Result<reqwest::Response, String> {
    let mut current_url = validate_url(url)?;
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
            current_url = validate_url(next_url.as_ref())?;
            redirects_remaining -= 1;
            continue;
        }

        return Ok(response);
    }
}
