# Validation issue — immediate dirty A→B switch did not expose discard dialog

状态：CLOSED

## Detection

- Run: `validation/evidence/P4B/20260830-063125-p4b-6432059/`
- Gate: C17 desktop P0S
- Preserved artifact: `e2e/artifacts/failed-1788043020572/`

## Finding

The E2E hook dispatched `type('Y')`, reported `isDirty() === true`, and clicked document B in one WebView task. No unsaved-changes dialog was observed within five seconds; the failure screenshot shows B active. The other three P0S scenarios passed.

The result must not be classified as harmless timing until the binding/store dirty path and the click/transition timeline are independently reproduced. The acceptance requirement remains: an explicit discard decision must keep A's bytes unchanged and B free of A's edit.

## Required closure

- determine whether this is a product dirty/transition race or an E2E observation race from preserved logs and deterministic diagnostics;
- keep the semantic assertions (dialog/discard, A unchanged, B uncontaminated); do not close by extending the timeout or removing the dialog requirement;
- pass the P0S suite consecutively and then a completely fresh C00–C18 run;
- link the final immutable passing run before closing this issue.

## Closure

- Final run `../evidence/P4B/20260830-064651-p4b-6432059/` passed C17 4/4. The guard now begins at the file-tree click before the 250ms debounce; the test observes the discard dialog, unchanged A bytes, and B without `Y`.
