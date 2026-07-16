# Operations

The workflow runs hourly and supports manual `plan`, `sync` and `audit` modes,
plus exact repository and platform filters. Run `plan` before enabling a new
platform or taking over a platform-native pull mirror.

Required GitHub Actions Secrets:

- `GITEE_TOKEN`
- `GITCODE_TOKEN`
- `GITLAB_COM_TOKEN`

Required GitHub Actions Variables:

- `GITEE_USERNAME`
- `GITCODE_USERNAME`

Local credentials should be stored in macOS Keychain services
`com.yeelight.china-mirror-sync.gitee`,
`com.yeelight.china-mirror-sync.gitcode`, and
`com.yeelight.china-mirror-sync.gitlab-com`. Do not use `.env` files for real
Tokens.

Cutover order: run a four-platform plan, disable platform-native pull mirrors,
sync the control repository as a canary, sync one target platform at a time,
then run a full audit. Disable the schedule and restore native pull mirrors if
the canary fails.

## Gitee Release Limits

Gitee accepts at most 20 attachments per Release. The adapter prioritizes
checksums, installers, primary platform archives, metadata/npm artifacts, SBOMs,
and then Linux packages. Omitted source assets are expected `unsupported`
findings, not synchronization failures.

The Gitee malware scanner rejects `yeelight-home-windows-arm64.zip` even though
its SHA-256 matches the GitHub source. Keep that filename in the adapter's
explicit exclusion list and direct Windows ARM64 users to GitCode or GitLab.com.
Do not disable checksum verification or rename a signed Release asset merely to
bypass a target scanner.
