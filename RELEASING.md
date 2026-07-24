# 发布到 npm

推送与 `package.json` 版本一致的 `v*` 标签后，GitHub Actions 会运行完整检查、构建并发布到 npm。

## 首次发布

包首次发布前无法配置 npm Trusted Publisher，因此需要：

1. 在 npm 创建具有读写权限并启用 Bypass 2FA 的 Granular Access Token。
2. 在 GitHub 仓库的 `Settings > Secrets and variables > Actions` 中创建 Secret `NPM_TOKEN`。
3. 创建并推送版本标签。

首版发布后，可以在 npm 包设置中配置 Trusted Publisher：

- Organization or user：`oloshe`
- Repository：`pretty-js-bridge`
- Workflow filename：`publish.yml`
- Allowed actions：`npm publish`

配置 Trusted Publisher 后可以删除 `NPM_TOKEN` Secret，workflow 会通过 GitHub OIDC 发布。

## 发布新版本

发布补丁版本：

```bash
npm version patch
git push origin HEAD --follow-tags
```

也可以使用 `minor` 或 `major`。如果手动创建标签，必须确保标签 `v1.2.3` 与 `package.json` 中的 `1.2.3` 完全一致。
