## Decision

Install `@fission-ai/openspec` as a devDependency and expose a `validate:openspec` npm script. CI and local developers use the same script.

## Approach

1. **Add devDependency**: `npm install --save-dev @fission-ai/openspec`
2. **Add script**: `"validate:openspec": "openspec validate --all"` in package.json
3. **Update CI**: Change line 63 in `.github/workflows/ci.yml` from `npx openspec validate --all` to `npm run validate:openspec`
4. **Update CLAUDE.md**: Add `validate:openspec` to the build/test section

## Trade-offs

- **Pinning version**: Using `^` range (default npm behavior) keeps it updated within semver. This is appropriate for a validation CLI tool.
- **Script name `validate:openspec`**: Follows the `action:target` naming convention used by other scripts in the project.
