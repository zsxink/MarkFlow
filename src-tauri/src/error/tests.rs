use super::*;
use std::sync::Mutex;

#[test]
fn lock_mutex_recovers_poisoned_state() {
    let m: Mutex<u32> = Mutex::new(7);
    // Poison the mutex by panicking while holding the guard.
    let poison_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _g = m.lock().unwrap();
        panic!("simulated panic while holding lock");
    }));
    assert!(poison_result.is_err(), "expected simulated panic");

    // lock_mutex must recover the inner value instead of panicking.
    let guard = lock_mutex(&m).expect("poisoned lock should be recoverable");
    assert_eq!(*guard, 7);
}

#[test]
fn lock_mutex_infallible_recovers_poisoned_state_without_panicking() {
    let m: Mutex<u32> = Mutex::new(11);
    let poison_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _g = m.lock().unwrap();
        panic!("simulated panic while holding lock");
    }));
    assert!(poison_result.is_err(), "expected simulated panic");

    // The infallible helper must hand back the inner value instead of panicking.
    let guard = lock_mutex_infallible(&m);
    assert_eq!(*guard, 11);
}

#[test]
fn error_code_serializes_with_message() {
    let e = AppError::new(AppErrorCode::WatcherStartFailed, "boom");
    let json = serde_json::to_string(&e).unwrap();
    assert!(json.contains("watcher-start-failed"));
    assert!(json.contains("boom"));
    // Frontend still gets a readable message.
    assert_eq!(e.to_string(), "boom");
}
