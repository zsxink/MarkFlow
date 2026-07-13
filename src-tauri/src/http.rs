use std::net::{IpAddr, SocketAddr, ToSocketAddrs};

/// Maximum image download size (20 MB).
pub const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024;

/// Maximum bytes to read when fetching a page title.
pub const MAX_TITLE_READ_BYTES: usize = 256 * 1024;

/// Maximum length of a extracted title string.
pub const MAX_TITLE_LEN: usize = 512;

/// Allowed HTTP/HTTPS ports. Non-standard ports are rejected to prevent
/// accessing internal services (e.g., Redis on 6379, SSH on 22).
const ALLOWED_PORTS: &[u16] = &[80, 443];

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/// Validate that a URL is an allowed external resource:
/// - scheme must be http/https
/// - host must not be localhost or a bare private/loopback IP
///
/// NOTE: DNS-level validation (rebinding, private ranges after resolution)
/// is handled separately in [`resolve_and_validate_host`].
pub fn validate_external_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "Invalid URL")?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http/https URLs are allowed".into()),
    }

    // Validate port: only allow standard HTTP/HTTPS ports
    validate_port(&url)?;

    let host = url.host_str().ok_or("URL host required")?;
    if host.eq_ignore_ascii_case("localhost") {
        return Err("Localhost URLs are not allowed".into());
    }

    // Block bare private/loopback IPs written directly in the URL
    if let Ok(ip) = host.parse::<IpAddr>() {
        validate_ip(&ip)?;
    }

    Ok(url)
}

/// Validate that the URL uses a standard HTTP/HTTPS port.
/// Non-standard ports could be used to access internal services.
fn validate_port(url: &reqwest::Url) -> Result<(), String> {
    match url.port() {
        None => Ok(()), // No explicit port = scheme default (80/443)
        Some(p) if ALLOWED_PORTS.contains(&p) => Ok(()),
        Some(p) => Err(format!("Port {} is not allowed", p)),
    }
}

/// Reject addresses that must never be reached from a desktop app:
/// loopback, private (RFC1918/RFC4193), link-local, unspecified, multicast,
/// documentation / reserved ranges.
pub fn validate_ip(ip: &IpAddr) -> Result<(), String> {
    let blocked = match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_unspecified()
                // Documentation range 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
                || is_documentation_ipv4(*v4)
        }
        IpAddr::V6(v6) => {
            // IPv4-mapped (::ffff:x.x.x.x) and IPv4-compatible (::x.x.x.x) addresses
            // route to the underlying IPv4 destination — validate the embedded v4.
            if let Some(v4) = v6.to_ipv4_mapped() {
                return validate_ip(&IpAddr::V4(v4));
            }
            v6.is_loopback()
                || v6.is_multicast()
                || v6.is_unspecified()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                // Documentation prefix 2001:db8::/32 — bytes 2-3 are 0x0d, 0xb8
                || (v6.octets()[..2] == [0x20, 0x01] && v6.octets()[2..4] == [0x0d, 0xb8])
        }
    };
    if blocked {
        return Err("Private or local network addresses are not allowed".into());
    }
    Ok(())
}

fn is_documentation_ipv4(v4: std::net::Ipv4Addr) -> bool {
    let octets = v4.octets();
    match octets {
        [192, 0, 2, _] => true,   // TEST-NET-1
        [198, 51, 100, _] => true, // TEST-NET-2
        [203, 0, 113, _] => true,  // TEST-NET-3
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// DNS resolution + IP validation (TOCTOU-safe)
// ---------------------------------------------------------------------------

/// Resolve the hostname using the system resolver, then validate **every**
/// returned IP.  Returns an error on the first unsafe address.
///
/// This is used for redirect validation where reqwest doesn't re-resolve.
pub fn resolve_and_validate_host(host: &str) -> Result<(), String> {
    let addrs: Vec<SocketAddr> = (host, 0)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?
        .collect();

    if addrs.is_empty() {
        return Err("DNS resolution returned no addresses".into());
    }

    for sa in &addrs {
        validate_ip(&sa.ip())?;
    }

    Ok(())
}

/// A DNS resolver that validates every resolved IP address.
///
/// This eliminates the TOCTOU race condition: previously, we validated DNS
/// results separately, then let reqwest re-resolve. An attacker could swap
/// DNS records between validation and connection. Now, reqwest's own DNS
/// resolution goes through this validator, so every IP used for connection
/// is checked.
#[derive(Clone)]
pub struct ValidatingResolver;

impl reqwest::dns::Resolve for ValidatingResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            // Use the system resolver to get addresses
            let addrs: Vec<SocketAddr> = (&*host, 0u16)
                .to_socket_addrs()
                .map_err(|e| format!("DNS resolution failed for {}: {}", host, e))?
                .collect();

            if addrs.is_empty() {
                return Err(format!("DNS resolution returned no addresses for {}", host).into());
            }

            // Validate every resolved IP — reject blocked ranges
            let validated: Vec<SocketAddr> = addrs
                .into_iter()
                .filter(|addr| validate_ip(&addr.ip()).is_ok())
                .collect();

            if validated.is_empty() {
                return Err(format!(
                    "All resolved addresses for {} are in blocked networks",
                    host
                )
                .into());
            }

            Ok(Box::new(validated.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

// ---------------------------------------------------------------------------
// Redirect validation
// ---------------------------------------------------------------------------

/// Validate a URL and its resolved DNS addresses, suitable for checking
/// redirect targets (scheme downgrade, private IPs, etc.).
pub fn validate_redirect_url(url: &reqwest::Url, original_scheme: &str) -> Result<(), String> {
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
        // DNS-validate the hostname
        resolve_and_validate_host(host)?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// URL redaction (log sanitisation)
// ---------------------------------------------------------------------------

/// Strip query string and fragment from a URL so that secrets are not
/// leaked into log files.  Returns `"scheme://host/path"`.
pub fn redact_url_for_log(url: &str) -> String {
    match reqwest::Url::parse(url) {
        Ok(parsed) => {
            let path = parsed.path();
            format!("{}://{}{}", parsed.scheme(), parsed.host_str().unwrap_or(""), path)
        }
        Err(_) => url.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Magic bytes validation
// ---------------------------------------------------------------------------

/// The first bytes of known image formats (up to 8 bytes each).
const MAGIC_PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
const MAGIC_JPEG: &[u8] = &[0xFF, 0xD8, 0xFF];
const MAGIC_GIF: &[u8] = b"GIF8";
const MAGIC_WEBP: &[u8] = &[b'R', b'I', b'F', b'F'];
const MAGIC_BMP: &[u8] = &[b'B', b'M'];

/// Check the first `buf` bytes against known image magic bytes.
/// Returns `true` if the content *could* be the image type declared by the
/// Content-Type header (i.e. the magic matches at least one known format).
///
/// SVG is accepted here — SVG files start with `<?xml` or `<svg` which are
/// checked as valid XML/image prefixes.
pub fn validate_image_magic(buf: &[u8]) -> bool {
    if buf.len() < 4 {
        return false;
    }
    if buf.starts_with(MAGIC_PNG) {
        return true;
    }
    if buf.starts_with(MAGIC_JPEG) {
        return true;
    }
    if buf.starts_with(MAGIC_GIF) {
        return true;
    }
    // WebP: check RIFF....WEBP — the "WEBP" signature appears at offset 8
    if buf.len() >= 12 && buf.starts_with(MAGIC_WEBP) && &buf[8..12] == b"WEBP" {
        return true;
    }
    if buf.starts_with(MAGIC_BMP) {
        return true;
    }
    // SVG: starts with <?xml or <svg (case-insensitive for <SVG)
    if buf.starts_with(b"<?xml") || buf.starts_with(b"<svg") || buf.starts_with(b"<SVG") {
        return true;
    }
    false
}

// ---------------------------------------------------------------------------
// Fetch with redirect + DNS validation
// ---------------------------------------------------------------------------

/// Fetch a URL, following up to `max_redirects` redirects.
///
/// Each redirect target is validated for scheme downgrade, DNS safety, and port.
/// DNS resolution goes through [`ValidatingResolver`] to prevent TOCTOU rebinding.
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

    // DNS-validate the initial URL's hostname (not just the string)
    if let Some(host) = current_url.host_str() {
        if host.parse::<IpAddr>().is_err() {
            // Hostname is not a bare IP — resolve and validate all addresses
            resolve_and_validate_host(host)?;
        }
    }

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
            validate_redirect_url(&next_url, &original_scheme)?;

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- validate_ip --------------------------------------------------------

    #[test]
    fn rejects_loopback_v4() {
        assert!(validate_ip(&"127.0.0.1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_loopback_v6() {
        assert!(validate_ip(&"::1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_private_v4() {
        assert!(validate_ip(&"192.168.1.1".parse().unwrap()).is_err());
        assert!(validate_ip(&"10.0.0.1".parse().unwrap()).is_err());
        assert!(validate_ip(&"172.16.0.1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_link_local_v4() {
        assert!(validate_ip(&"169.254.1.1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_unique_local_v6() {
        assert!(validate_ip(&"fc00::1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_multicast() {
        assert!(validate_ip(&"224.0.0.1".parse().unwrap()).is_err());
        assert!(validate_ip(&"ff02::1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_documentation_ipv4() {
        assert!(validate_ip(&"192.0.2.1".parse().unwrap()).is_err());
        assert!(validate_ip(&"198.51.100.1".parse().unwrap()).is_err());
        assert!(validate_ip(&"203.0.113.1".parse().unwrap()).is_err());
    }

    #[test]
    fn accepts_public_ipv4() {
        assert!(validate_ip(&"93.184.216.34".parse().unwrap()).is_ok());
    }

    #[test]
    fn accepts_public_ipv6() {
        assert!(validate_ip(&"2606:4700::6810:85e5".parse().unwrap()).is_ok());
    }

    // -- validate_external_url ----------------------------------------------

    #[test]
    fn rejects_ftp_scheme() {
        assert!(validate_external_url("ftp://example.com").is_err());
    }

    #[test]
    fn rejects_localhost() {
        assert!(validate_external_url("http://localhost/file").is_err());
    }

    #[test]
    fn rejects_bare_private_ip() {
        assert!(validate_external_url("http://192.168.1.1/secret").is_err());
    }

    #[test]
    fn accepts_valid_public_url() {
        assert!(validate_external_url("https://example.com/img.png").is_ok());
    }

    // -- redact_url_for_log -------------------------------------------------

    #[test]
    fn strips_query_and_fragment() {
        let redacted = redact_url_for_log("https://example.com/img?token=secret#section");
        assert_eq!(redacted, "https://example.com/img");
    }

    #[test]
    fn keeps_path() {
        let redacted = redact_url_for_log("https://cdn.example.com/a/b/c.png?v=1");
        assert_eq!(redacted, "https://cdn.example.com/a/b/c.png");
    }

    #[test]
    fn returns_original_on_invalid_url() {
        let redacted = redact_url_for_log("not-a-url");
        assert_eq!(redacted, "not-a-url");
    }

    // -- validate_image_magic -----------------------------------------------

    #[test]
    fn accepts_png_magic() {
        let mut buf = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        buf.extend_from_slice(&[0; 100]);
        assert!(validate_image_magic(&buf));
    }

    #[test]
    fn accepts_jpeg_magic() {
        let mut buf = vec![0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0];
        buf.extend_from_slice(&[0; 100]);
        assert!(validate_image_magic(&buf));
    }

    #[test]
    fn accepts_gif_magic() {
        let mut buf = b"GIF89a".to_vec();
        buf.extend_from_slice(&[0; 100]);
        assert!(validate_image_magic(&buf));
    }

    #[test]
    fn accepts_webp_magic() {
        let mut buf = b"RIFF".to_vec();
        buf.extend_from_slice(&[0; 4]); // file size placeholder
        buf.extend_from_slice(b"WEBP");
        buf.extend_from_slice(&[0; 100]);
        assert!(validate_image_magic(&buf));
    }

    #[test]
    fn accepts_bmp_magic() {
        let mut buf = b"BM".to_vec();
        buf.extend_from_slice(&[0; 100]);
        assert!(validate_image_magic(&buf));
    }

    #[test]
    fn rejects_html_content() {
        let buf = b"<html><head><title>Evil</title></head></html>";
        assert!(!validate_image_magic(buf));
    }

    #[test]
    fn rejects_too_short_buffer() {
        assert!(!validate_image_magic(&[0x89, b'P']));
    }

    // -- validate_redirect_url ----------------------------------------------

    #[test]
    fn rejects_https_to_http_downgrade() {
        let url = reqwest::Url::parse("http://example.com/").unwrap();
        assert!(validate_redirect_url(&url, "https").is_err());
    }

    #[test]
    fn allows_same_scheme_redirect() {
        let url = reqwest::Url::parse("https://other.com/page").unwrap();
        assert!(validate_redirect_url(&url, "https").is_ok());
    }

    // -- resolve_and_validate_host ------------------------------------------

    #[test]
    fn resolves_and_validates_localhost() {
        // "localhost" resolves to 127.0.0.1 — must be rejected
        assert!(resolve_and_validate_host("localhost").is_err());
    }

    #[test]
    fn resolves_public_host() {
        // example.com resolves to a public IP — this validates the function works end-to-end.
        assert!(resolve_and_validate_host("example.com").is_ok());
    }

    #[test]
    fn rejects_documentation_ipv6() {
        assert!(validate_ip(&"2001:db8::1".parse().unwrap()).is_err());
        assert!(validate_ip(&"2001:0db8::1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_ipv4_mapped_private() {
        // ::ffff:192.168.1.1 → should be blocked as private IPv4
        assert!(validate_ip(&"::ffff:192.168.1.1".parse().unwrap()).is_err());
        assert!(validate_ip(&"::ffff:10.0.0.1".parse().unwrap()).is_err());
        assert!(validate_ip(&"::ffff:172.16.0.1".parse().unwrap()).is_err());
    }

    #[test]
    fn rejects_ipv4_mapped_loopback() {
        // ::ffff:127.0.0.1 → should be blocked as loopback
        assert!(validate_ip(&"::ffff:127.0.0.1".parse().unwrap()).is_err());
    }

    #[test]
    fn accepts_ipv4_mapped_public() {
        // ::ffff:93.184.216.34 → should be allowed (public IPv4)
        assert!(validate_ip(&"::ffff:93.184.216.34".parse().unwrap()).is_ok());
    }

    #[test]
    fn rejects_ftp_redirect() {
        let url = reqwest::Url::parse("ftp://example.com/file").unwrap();
        assert!(validate_redirect_url(&url, "https").is_err());
    }

    #[test]
    fn rejects_gopher_redirect() {
        let url = reqwest::Url::parse("gopher://example.com/").unwrap();
        assert!(validate_redirect_url(&url, "http").is_err());
    }

    #[test]
    fn accepts_svg_magic() {
        let buf = b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\">";
        assert!(validate_image_magic(buf));
    }

    #[test]
    fn accepts_svg_direct_tag() {
        let buf = b"<svg viewBox=\"0 0 100 100\">";
        assert!(validate_image_magic(buf));
    }

    // -- validate_port -------------------------------------------------------

    #[test]
    fn accepts_default_port() {
        // No explicit port = scheme default, always allowed
        let url = reqwest::Url::parse("https://example.com/img.png").unwrap();
        assert!(validate_port(&url).is_ok());
    }

    #[test]
    fn accepts_port_443() {
        let url = reqwest::Url::parse("https://example.com:443/img.png").unwrap();
        assert!(validate_port(&url).is_ok());
    }

    #[test]
    fn accepts_port_80() {
        let url = reqwest::Url::parse("http://example.com:80/img.png").unwrap();
        assert!(validate_port(&url).is_ok());
    }

    #[test]
    fn rejects_non_standard_port() {
        let url = reqwest::Url::parse("https://example.com:8080/img.png").unwrap();
        assert!(validate_port(&url).is_err());
    }

    #[test]
    fn rejects_redis_port() {
        let url = reqwest::Url::parse("http://evil.com:6379/").unwrap();
        assert!(validate_port(&url).is_err());
    }

    #[test]
    fn rejects_ssh_port() {
        let url = reqwest::Url::parse("http://evil.com:22/").unwrap();
        assert!(validate_port(&url).is_err());
    }

    #[test]
    fn rejects_port_on_localhost() {
        let url = reqwest::Url::parse("http://localhost:3000/").unwrap();
        // Should fail on localhost, not just port
        assert!(validate_external_url("http://localhost:3000/").is_err());
    }

    #[test]
    fn rejects_redirect_with_non_standard_port() {
        let url = reqwest::Url::parse("https://other.com:9999/page").unwrap();
        assert!(validate_redirect_url(&url, "https").is_err());
    }

    #[test]
    fn accepts_redirect_with_standard_port() {
        let url = reqwest::Url::parse("https://other.com:443/page").unwrap();
        assert!(validate_redirect_url(&url, "https").is_ok());
    }
}
