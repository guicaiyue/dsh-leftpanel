# 发布到 npm（首次 + 之后交给 CI）

> 仓库自带的 `~/.npmrc` 指向 `registry.npmmirror.com`（国内镜像）。**镜像是只读的，发不了包。**
> 下面每条命令都显式带 `--registry=https://registry.npmjs.org`，别省。

本插件**没有构建步骤**（Host 与 Client 都是纯 ESM），所以发布链路比带构建的插件短：
质量门 = `npm run verify`（语法检查 + `node --test`）。

## 0. 现状

| 项 | 值 |
|---|---|
| 包名 | `@xirizhi/dsh-leftpanel` |
| 发布账号 | npm 用户 `xirizhi` |
| token | `~/.npmrc` 里那条 `//registry.npmjs.org/:_authToken=...`（granular，`bypass_2fa=true`） |
| 已发布版本 | 见 <https://www.npmjs.com/package/@xirizhi/dsh-leftpanel> |

**为什么改名。** 原作者的包是 `@zhujiuyi/dsh-leftpanel`（0.1.0，2026-10 发布），
那个 scope 只有原作者能发。本仓库用不带 scope 的 `@xirizhi/dsh-leftpanel`，与同系列插件
`dsh-context-domains` 保持一致。

## 1. 首次发布

```bash
cd dsh-leftpanel
npm run verify                                        # 必须绿
npm publish --access public --registry=https://registry.npmjs.org
npm view @xirizhi/dsh-leftpanel version --registry=https://registry.npmjs.org
```

`prepublishOnly` 没配，所以**发版前自己跑一遍 verify**（CI 里是强制的）。

## 2. 之后交给 CI（唯一发版路径）

发版命令、`release.yml` 的行为、市场条目什么时候要重跑，都写在
[`README.md §发版`](../README.md#发版)，这里不重复。

CI 只需要一个凭证：

1. GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `NPM_TOKEN`；值取 `~/.npmrc` 里 `_authToken=` 后面那段（**不含**前缀）
3. 没配这个 secret 时，`release.yml` 照常建 Release，只是跳过 `npm publish`。

## 3. 发布被 2FA 挡住（E403）

npm 不接受「网页登录换来的 session token」直接发版，两条路：

**A. 用验证器的一次性码**

```bash
npm publish --access public --registry=https://registry.npmjs.org --otp=123456
```

**B. 用带 Bypass 2FA 的 granular token（CI 也用这个，本仓库已在用）**

在 <https://www.npmjs.com/settings/xirizhi/tokens> 建 granular token：
Read and write、All packages、**勾上 `Bypass two-factor authentication`**（默认关闭，不勾等于白建）。

## 4. 市场门禁（提交前自查）

`awesome-dsh-plugin` 的 `scripts/check-submission.mjs` 会验：

- `package.json` 声明 `dsh.bundle`（本仓库有：`{"bundle": {"patch": "./cordis.patch.yml"}}`）
- 仓库创建满 **1 天**（刚 fork 出来的当天提 PR 会被 `repo is too new` 拦下，隔天重跑即可）
- 仓库存在、未归档、不是 DSH 本身
- `category` 必须在允许列表里（本条目用 `ui`）

`npm:` 字段不要手写，市场会从 registry 自动采集；它要求 npm 上的包的
`repository` 指回同一个 GitHub 仓库，本仓库已经指对了。

**首次提交已完成**：PR #18149 于 2026-11-24 合并，条目现役在
`awesome-dsh-plugin/data/plugins/guicaiyue__dsh-leftpanel.yml`。之后只有描述、截图或安装方式变了才重跑
`scripts/market-submit.sh`；只是发版（版本号变）不需要动条目——`tarball` 指向稳定别名。
