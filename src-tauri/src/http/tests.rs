use crate::net::dns::resolve_and_validate_host;
use crate::net::fetch::fetch_with_redirects;
use crate::net::magic::validate_image_magic;
use crate::net::redact::redact_url_for_log;
use crate::net::redirect::validate_redirect_url;
use crate::net::url::{validate_external_url, validate_ip, validate_port};

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

#[tokio::test]
async fn rejects_https_to_http_downgrade() {
    let url = reqwest::Url::parse("http://example.com/").unwrap();
    assert!(validate_redirect_url(&url, "https").await.is_err());
}

#[tokio::test]
async fn allows_same_scheme_redirect() {
    let url = reqwest::Url::parse("https://93.184.216.34/page").unwrap();
    assert!(validate_redirect_url(&url, "https").await.is_ok());
}

// -- resolve_and_validate_host ------------------------------------------

#[tokio::test]
async fn resolves_and_validates_localhost() {
    // "localhost" resolves to 127.0.0.1 — must be rejected
    assert!(resolve_and_validate_host("localhost").await.is_err());
}

#[tokio::test]
async fn fetches_local_response_with_explicit_limit() {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn allow_local_url(raw: &str) -> Result<reqwest::Url, String> {
        reqwest::Url::parse(raw).map_err(|error| error.to_string())
    }

    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 256];
        let _ = stream.read(&mut request);
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nbody")
            .unwrap();
    });

    let client = reqwest::Client::builder().build().unwrap();
    let url = format!("http://{}/", address);
    let response = fetch_with_redirects(&client, &url, 0, allow_local_url, Some(16))
        .await
        .unwrap();
    assert_eq!(response.bytes().await.unwrap().as_ref(), b"body");
    server.join().unwrap();
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

#[tokio::test]
async fn rejects_ftp_redirect() {
    let url = reqwest::Url::parse("ftp://example.com/file").unwrap();
    assert!(validate_redirect_url(&url, "https").await.is_err());
}

#[tokio::test]
async fn rejects_gopher_redirect() {
    let url = reqwest::Url::parse("gopher://example.com/").unwrap();
    assert!(validate_redirect_url(&url, "http").await.is_err());
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
    // Should fail on localhost, not just port
    assert!(validate_external_url("http://localhost:3000/").is_err());
}

#[tokio::test]
async fn rejects_redirect_with_non_standard_port() {
    let url = reqwest::Url::parse("https://other.com:9999/page").unwrap();
    assert!(validate_redirect_url(&url, "https").await.is_err());
}

#[tokio::test]
async fn accepts_redirect_with_standard_port() {
    let url = reqwest::Url::parse("https://93.184.216.34:443/page").unwrap();
    assert!(validate_redirect_url(&url, "https").await.is_ok());
}
