//! Redirect-target validation: scheme downgrade, port and DNS checks.

use std::net::IpAddr;

use super::dns::resolve_and_validate_host;
use super::url::{validate_ip, validate_port};

/// Validate a URL and its resolved DNS addresses, suitable for checking
/// redirect targets (scheme downgrade, private IPs, etc.).
pub async fn validate_redirect_url(
    url: &reqwest::Url,
    original_scheme: &str,
) -> Result<(), String> {
    // Only allow http/https schemes on redirect targets
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("Redirect to non-HTTP scheme is not allowed".into()),
    }

    // Enforce scheme: HTTPS original must not redirect to HTTP
    if original_scheme == "https" && url.scheme() == "http" {
        return Err("Protocol downgrade from HTTPS to HTTP is not allowed".into());
    }

    // Validate port on redirect target
    validate_port(url)?;

    let host = url.host_str().ok_or("Redirect target has no host")?;
    if host.eq_ignore_ascii_case("localhost") {
        return Err("Redirect to localhost is not allowed".into());
    }

    // Block bare IPs
    if let Ok(ip) = host.parse::<IpAddr>() {
        validate_ip(&ip)?;
    } else {
        // DNS-validate the hostname (async to avoid blocking runtime)
        resolve_and_validate_host(host).await?;
    }

    Ok(())
}
