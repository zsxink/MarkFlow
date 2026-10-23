//! DNS resolution with per-address validation.
//!
//! The `ValidatingResolver` eliminates the TOCTOU window between "validate the
//! resolved IPs" and "let reqwest resolve again": every address reqwest uses for
//! a connection goes through [`validate_ip`] first.

use std::net::{SocketAddr, ToSocketAddrs};

use super::url::validate_ip;

/// Resolve the hostname using the system resolver, then validate **every**
/// returned IP.  Returns an error on the first unsafe address.
///
/// This is used for redirect validation where reqwest doesn't re-resolve.
/// Uses spawn_blocking to avoid stalling the async runtime.
pub async fn resolve_and_validate_host(host: &str) -> Result<(), String> {
    let host = host.to_owned();
    let addrs: Vec<SocketAddr> =
        tokio::task::spawn_blocking(move || -> Result<Vec<SocketAddr>, String> {
            let iter = (&*host, 0u16)
                .to_socket_addrs()
                .map_err(|e| format!("DNS resolution failed: {}", e))?;
            Ok(iter.collect())
        })
        .await
        .map_err(|e| format!("DNS task failed: {}", e))??;

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
            // Use spawn_blocking to avoid blocking the tokio runtime during DNS resolution.
            // to_socket_addrs() performs a blocking system call that could stall all async
            // tasks if DNS is slow or times out.
            let host_clone = host.clone();
            let addrs: Vec<SocketAddr> =
                tokio::task::spawn_blocking(move || -> Result<Vec<SocketAddr>, String> {
                    let iter = (&*host_clone, 0u16)
                        .to_socket_addrs()
                        .map_err(|e| format!("DNS resolution failed for {}: {}", host_clone, e))?;
                    Ok(iter.collect())
                })
                .await
                .map_err(|e| format!("DNS task failed: {}", e))??;

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
