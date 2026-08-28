// Library surface for the P4A parser spike harness (tasks 6.1 + 6.2).
//
// The binary (main.rs) and the example probes both consume these modules.
// Kept deliberately standalone: this crate is NOT a workspace member and no
// product crate depends on it (see Cargo.toml).
pub mod adapters;
pub mod common;
pub mod property;
pub mod validate;
