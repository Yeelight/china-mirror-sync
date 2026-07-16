# Security

The workflow uses read-only GitHub permissions except for the single state
publisher job. Target Tokens are isolated to their matrix job and are not
passed to other platforms. Git credentials live in a temporary `0600` helper
file and are deleted after each Git command group.

HTTP errors, Git failures and reports pass through secret and credential URL
redaction. The CI workflow runs without target credentials and cannot write to
mirror platforms. Rotate platform Tokens periodically and immediately after any
suspected exposure; keep scopes limited to public repository creation, metadata,
Git write and Release upload for the Yeelight target namespace.
