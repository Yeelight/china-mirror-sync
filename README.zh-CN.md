# Yeelight 国内代码镜像同步

[English](README.md)

这是 Yeelight 官方的 GitHub Actions 同步控制仓。它自动发现
[`Yeelight`](https://github.com/Yeelight) 组织当前及未来的全部公开仓库，并同步到：

- [Gitee](https://gitee.com/yeelight)：中国大陆用户首选镜像
- [GitCode](https://gitcode.com/Yeelight)：中国大陆备用镜像
- [GitLab.com](https://gitlab.com/Yeelight)：全球备用镜像

GitHub 始终是开发、Issue、Pull Request 和正式发布的规范源；目标平台只用于只读
获取代码和发布附件，不接受多端并行开发。

## 同步范围

- 通过 GitHub API 自动发现全部公开仓库，包括 archived、fork、控制仓自身及未来新仓
- 使用逐 ref lease 保护同步 `refs/heads/*`、`refs/tags/*`、`refs/notes/*`
- 平台支持时同步仓库元数据与 Wiki Git
- 同步全部 Release 元数据；首次回填最新稳定版附件，此后同步切换日期后的全部新附件

Issue、Pull Request、Star、Actions、Packages、Secrets 等无法保持身份和语义一致的对象
不会复制，审计报告会明确标为不支持。

## 安全模型

目标仓一旦出现非同步器写入的漂移，任务立即停止，不会强制覆盖。Token 只从 GitHub
Actions Secrets 或本地安全凭据存储读取，不进入 Git URL、状态、报告或仓库配置。
详见[架构](docs/architecture.md)、[运维](docs/operations.md)和[安全](docs/security.md)。

## 本地验证

```bash
npm test
node src/cli.mjs plan --platform all --repository all
```

`sync` 会写入远端，必须按[运维文档](docs/operations.md)配置平台 Token 与用户名。

## 许可证

Apache License 2.0。
