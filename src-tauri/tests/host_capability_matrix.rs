use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

const REQUIRED_HOST_CAPABILITIES: &[&str] = &[
    "file_system",
    "clipboard",
    "dialogs",
    "windows",
    "notifications",
    "shell",
    "network",
    "render",
    "export",
];

#[test]
fn host_capability_matrix_maps_to_declared_tauri_permissions() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let matrix_path = manifest_dir.join("host-capability-matrix.json");
    let matrix: Value =
        serde_json::from_str(&fs::read_to_string(&matrix_path).expect("read host matrix"))
            .expect("parse host matrix");
    assert_eq!(matrix["matrix_version"], 1);
    assert_eq!(matrix["host_protocol_version"], 1);

    let capabilities = matrix["capabilities"]
        .as_array()
        .expect("matrix capabilities must be an array");
    let names: BTreeSet<&str> = capabilities
        .iter()
        .map(|capability| {
            capability["name"]
                .as_str()
                .expect("capability name must be a string")
        })
        .collect();
    for required in REQUIRED_HOST_CAPABILITIES {
        assert!(
            names.contains(required),
            "missing Host capability matrix entry: {required}"
        );
    }

    let declared_permissions = declared_tauri_permissions(&manifest_dir.join("capabilities"));
    for capability in capabilities {
        let name = capability["name"].as_str().expect("capability name");
        assert_non_empty_string(capability, "parameter_range", name);
        assert_non_empty_string(capability, "resource_range", name);
        assert_non_empty_string(capability, "cancellation", name);
        assert!(
            capability["stable_error_codes"]
                .as_array()
                .is_some_and(|codes| !codes.is_empty()),
            "{name} must declare stable_error_codes"
        );
        assert!(
            capability["platform_support"].is_object(),
            "{name} must declare platform_support"
        );

        let mapping = &capability["tauri_permission_mapping"];
        let status = mapping["status"].as_str().unwrap_or_default();
        let permissions = mapping["permissions"]
            .as_array()
            .expect("tauri_permission_mapping.permissions must be an array");
        if status == "tauri_capability" {
            assert!(
                !permissions.is_empty(),
                "{name} maps to Tauri capabilities but lists no permissions"
            );
            for permission in permissions {
                let permission = permission
                    .as_str()
                    .expect("mapped Tauri permission must be a string");
                assert!(
                    declared_permissions.contains(permission),
                    "{name} maps to undeclared Tauri permission {permission}"
                );
            }
        }
    }
}

fn declared_tauri_permissions(capabilities_dir: &Path) -> BTreeSet<String> {
    let mut permissions = BTreeSet::new();
    for entry in fs::read_dir(capabilities_dir).expect("read capabilities dir") {
        let path = entry.expect("capability entry").path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name == "host-capability-matrix.json")
        {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let value: Value =
            serde_json::from_str(&fs::read_to_string(&path).expect("read capability file"))
                .expect("parse capability file");
        for permission in value["permissions"]
            .as_array()
            .expect("Tauri capability permissions must be an array")
        {
            match permission {
                Value::String(identifier) => {
                    permissions.insert(identifier.clone());
                }
                Value::Object(object) => {
                    let identifier = object["identifier"]
                        .as_str()
                        .expect("inline permission object must have identifier");
                    permissions.insert(identifier.to_string());
                }
                _ => panic!("unsupported permission entry in {}", path.display()),
            }
        }
    }
    permissions
}

fn assert_non_empty_string(capability: &Value, field: &str, name: &str) {
    assert!(
        capability[field]
            .as_str()
            .is_some_and(|value| !value.trim().is_empty()),
        "{name} must declare non-empty {field}"
    );
}
