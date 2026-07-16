# Yeelight China Mirror Sync

[简体中文](README.zh-CN.md)

Official GitHub Actions automation for mirroring every public repository in the
[`Yeelight`](https://github.com/Yeelight) organization to:

- [Gitee](https://gitee.com/yeelight), the recommended mainland China mirror
- [GitCode](https://gitcode.com/Yeelight), an additional mainland China mirror
- [GitLab.com](https://gitlab.com/Yeelight), a global fallback mirror

GitHub remains the canonical source for development, issues, pull requests and
releases. Target repositories are read-only distribution mirrors.

## What Is Mirrored

- All current and future public repositories discovered through the GitHub API,
  including archived repositories and forks
- `refs/heads/*`, `refs/tags/*` and `refs/notes/*`, protected by per-ref leases
- Portable repository metadata and Wiki Git when supported
- All release metadata; latest stable assets at initial adoption and every new
  release asset after the configured cutover date

Objects without portable identity or semantics, including issues, pull
requests, stars, Actions, packages and secrets, are explicitly not copied.

## Safety Model

The synchronizer stops on target-side drift. Credentials are read from GitHub
Actions Secrets or a local credential provider and never embedded in Git URLs,
state, reports or repository configuration. See [Architecture](docs/architecture.md),
[Operations](docs/operations.md) and [Security](docs/security.md).

## Local Verification

```bash
npm test
node src/cli.mjs plan --platform all --repository all
```

`sync` performs remote writes and requires the platform Token and username
environment variables documented in [Operations](docs/operations.md).

## License

Apache License 2.0.
