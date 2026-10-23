//! URL and IP validation.
//!
//! Rejects non-HTTP schemes, non-standard ports, `localhost` and bare
//! private/loopback IPs written directly into a URL. DNS-level validation
//! (rebinding, private ranges after resolution) lives in [`crate::net::dns`].

use std::net::IpAddr;

/// Allowed HTTP/HTTPS ports. Non-standard ports are rejected to prevent
/// accessing internal services (e.g., Redis on 6379, SSH on 22).
const ALLOWED_PORTS: &[u16] = &[80, 443];

/// Validate that a URL is an allowed external resource:
/// - scheme must be http/https
/// - host must not be localhost or a bare private/loopback IP
///
/// NOTE: DNS-level validation (rebinding, private ranges after resolution)
/// is handled separately in [`crate::net::dns::resolve_and_validate_host`].
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
pub(crate) fn validate_port(url: &reqwest::Url) -> Result<(), String> {
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
        [192, 0, 2, _] => true,    // TEST-NET-1
        [198, 51, 100, _] => true, // TEST-NET-2
        [203, 0, 113, _] => true,  // TEST-NET-3
        _ => false,
    }
}
