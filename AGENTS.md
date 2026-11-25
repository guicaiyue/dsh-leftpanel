# 给接手这个仓库的 agent

DSH 插件 `@xirizhi/dsh-leftpanel`：把左侧菜单的面板入口收进一行「集合」，并逐个隐藏或显示。
现役行为、存储格式与真机截图见 [`README.md`](README.md)；定稿原型在
[`mock/collection-final.html`](mock/collection-final.html)（索引页 `mock/index.html`，
出图 `node scripts/mock-shots.mjs`）；设计出题稿（已过期，仅留依据）在
[`docs/proto/collection-brief.md`](docs/proto/collection-brief.md)，早期候选只留截图在
[`docs/proto/candidates/`](docs/proto/candidates/)（可交互 html 已删，见那里的 README）。
**全仓库只允许两个 html**（`mock/collection-final.html` + `mock/index.html`），`test/mock-integrity.mjs` 钉着。

## 怎么跑

```bash
node --check index.js && node --check client/client.js   # 语法
node --test "test/*.mjs"                                  # 48 项自检
```

容器里跑真机（本机 `~/Projects/dsh-docker`）：

```bash
docker compose restart dsh          # 改 client/index 后都要重启
./dev-url.sh                        # 拿地址（cookie 失效时自动抓 token）
```

## 五条硬约束

1. **注入 DOM 的类名必须避开宿主和本插件设置页已用的名字。** 设置页自己有 `.lp-card`，
   侧栏浮层只能用 `.lp-fly*`。历史上把浮层也叫 `.lp-card`，那条 `position:fixed` 落到
   设置页的两张卡片上，整页叠成一团。`test/client-selfcheck.mjs` 钉着这条。
2. **注入的行必须在 `buildRow()` 时就带 `aria-label`。** 外壳靠「`nav` 下的行都有可访问名」
   认行列表；匿名行会让判据失效，行刚插进去就被自己拆掉。
3. **注入的行必须从面板投影里排除**（`rowEntries` 里认 `data-dsh-leftpanel-collection`），
   否则它会把自己列进卡片。
4. **降级必须是「什么都不隐藏」，不是「藏了回不去」。** 集合行挂载失败、溢出菜单读取
   失败，都要退回到「面板行照常显示 + 外壳的『更多』放回来」，不许留一个空壳。
5. **别把「行」写死成 `<button>`。** DSH 0.1.x 的行按钮直挂 `<nav>`，0.2.x 把它包进
   `<div class="…panelEntry">` 并加一个「取消固定」按钮。0.1.2 之前的代码只认
   `tagName === 'BUTTON'` 的直接子节点，升到 0.2.2-rc.5 后一行都匹配不到 → `findRowList`
   返回 null → 整条功能静默退化成「什么都不隐藏」，用户看到的就是「刷新后左栏还原」。
   现在统一走 `rowEntries(rowList)`：取直接子节点、再取其第一个元素子节点做行按钮，
   标记打在最外层盒子上，`aria-haspopup="menu"` 用来把外壳的「更多」启动器排除在面板投影外。
   `test/dom-pass.mjs` 对两代结构各跑一遍。

## 集合模式的两条实现要点

- **「更多」的条目不是写死的**：`harvestMoreEntries()` 把外壳真实菜单开一次、读
  `[role=menuitem]`、再关掉（期间给 `<html>` 挂 `data-dsh-leftpanel-harvest` 让菜单透明）。
  所以别的插件往 `sidebar.panellist.actions` 加东西会自动跟上来。
- **条目逐行铺两列**（`splitColumns` 用 `index % 2`），不是列优先。列优先会让「更多」的
  两项一起落进右列、上下叠着，看起来仍像一个独立分组。

## 部署

两台机器都**不经过插件市场 UI** 装，但来源分叉（2026-11-25 按 profile 的 `package.json` 与 `pnpm-lock.yaml` 核过）：

| 机器 | profile | 依赖写法（实测值） |
| --- | --- | --- |
| arch-desktop（宿主，13080） | `~/.dsh/profiles/web` | `https://github.com/guicaiyue/dsh-leftpanel/releases/download/v0.1.1/dsh-leftpanel.tgz` |
| NAS（`xrznas`，13080） | `/vol1/1000/docker/dsh-npm/home/profiles/web` | `@xirizhi/dsh-leftpanel@0.1.1`（走 npm，sha512 与 Release 包相同） |

写 `latest` 的地址也只在**再次 `dsh plugin add` 时**才会动：pnpm 把当时解析到的 URL 和 integrity 钉进 lock，
升级永远是一次显式 add + 重启，不会自己跟。

NAS 访问 GitHub **走 mihomo 代理、不是直连**（现在装的是 npm 包，下面这段是以后要从 GitHub URL 装时的排查顺序），节点抖动时 `pnpm add <url>` 会报
`TimeoutError`。一次失败先复现（`curl -sI` 或 `node fetch` 看 HTTP 状态）再下结论，别换绕路
方案；反复失败按这个顺序查：`/dev/tcp/github.com/443` → HTTP 状态 → 代理节点健康
（`curl -H "Authorization: Bearer <secret>" http://127.0.0.1:9090/proxies`，secret 在
`/root/.clashctl/data/runtime.yaml`）→ `journalctl | grep -c 'failed to create session'`。

装完必须重启：宿主 `systemctl --user restart dsh`，NAS `systemctl restart dsh`。
验证不看浏览器（无头 Chrome 处理不了 303 + HttpOnly cookie），直接问接口：

```bash
curl -s -b <cookie> http://127.0.0.1:13080/api/left-panel/state
```

## 现状

- `main` 与 `origin/main` 同步；`origin` 是自己的 fork，`upstream` 是原作者仓库。
- npm 包是 **`@xirizhi/dsh-leftpanel`**（现役 0.1.1），不是原作者的 `@zhujiuyi/dsh-leftpanel`。
  两台机器装的都是 0.1.1，但宿主是 Release 构建物、NAS 是 npm 包（见上「部署」），原作者的包已经从两个 profile 卸掉。
  不带 scope 的 `dsh-leftpanel` 被 npm 以「与 `dsh-left-panel` 太像」403 拒绝过。
- 发版：推 `v*` 标签 → `.github/workflows/release.yml`（质量门 → Release + 稳定别名
  `dsh-leftpanel.tgz` → 有 `NPM_TOKEN` 就发 npm）。细节见 `docs/PUBLISH.md`。
- 插件市场：`docs/market/guicaiyue__dsh-leftpanel.yml` + `scripts/market-submit.sh`（幂等）。
  门禁要求仓库创建满 1 天、`dsh.bundle` 已声明、`category` 在允许列表里（本条目用 `ui`）。
  **2026-11-24 已收录**：PR #18149 合进上游 `data/plugins/guicaiyue__dsh-leftpanel.yml`，README 第 972 行已生成条目；
  之后只有描述、截图或安装方式变了才重跑，别为重提 PR 再跑一遍脚本。
- OpenDesign 项目 `dsh-leftpanel` 直接挂在这个仓库（`baseDir` 就是仓库根，没有副本）。
  **OD 的「设计文件」按扩展名列页面、不看 `.gitignore`**：多留一个 html 就是多一个能点错的
  完整页面——这就是「全仓库只允许两个 html」的由来（`test/mock-integrity.mjs` 钉着）。
  项目里开着的 tab 是用户浏览留下的（OD 的 `tabs` 表），会被点回来、也会指向已删文件，
  不能当机制用；现役入口永远以仓库里的 `mock/collection-final.html` 为准。
