# 给接手这个仓库的 agent

DSH 插件 `@xirizhi/dsh-leftpanel`：把左侧菜单的面板入口收进一行「集合」，并逐个隐藏或显示。
现役行为、存储格式与真机截图见 [`README.md`](README.md)；定稿原型在
[`mock/collection-final.html`](mock/collection-final.html)（索引页 `mock/index.html`，
出图 `node scripts/mock-shots.mjs`；令牌与几何只在它的 `:root` 与页末 `<section class="spec">` 里），
早期候选只留截图在 [`docs/proto/candidates/`](docs/proto/candidates/)（可交互 html 已删，见那里的 README）。
**全仓库只允许两个 html**（`mock/collection-final.html` + `mock/index.html`），`test/mock-integrity.mjs` 钉着。

## 怎么跑

```bash
node --check index.js && node --check client/client.js   # 语法
node --test "test/*.mjs"                                  # 49 项自检
```

容器里跑真机（本机 `~/Projects/dsh-docker`）：

```bash
docker compose restart dsh          # 只有改 index.js（host 半边）才需要
./dev-url.sh                        # 拿地址（cookie 失效时自动抓 token）
```

只改 `client/client.js` 时刷新页面就是新版（原因见下面「部署」里的重启边界），不用重启容器。

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

## 集合模式的三条实现要点

- **「更多」的条目不是写死的**：`harvestMoreEntries()` 把外壳真实菜单开一次、读
  `[role=menuitem]`、再关掉（期间给 `<html>` 挂 `data-dsh-leftpanel-harvest` 让菜单透明）。
  所以别的插件往 `sidebar.panellist.actions` 加东西会自动跟上来。
- **条目逐行铺两列**（`splitColumns` 用 `index % 2`），不是列优先。列优先会让「更多」的
  两项一起落进右列、上下叠着，看起来仍像一个独立分组。
- **固定打在行列表上，不在行上**：面板行全折进卡片后 `<nav>` 的高度就等于集合行，所以
  `mountCollection()` 给 `<nav>` 挂 `data-dsh-leftpanel-pinned`（`position:sticky;top:0` +
  不透明背景 + 补上外壳 8px 下边距的同色 shadow），`unmountCollection()` 摘掉。
  **如果以后不再折叠全部面板行**（例如留了常驻行），必须改成给集合行单独准备 sticky 宿主，
  否则常驻行会被一起吸住。

## 部署

两台机器都**不经过插件市场 UI** 装，但来源分叉（2026-11-25 按 profile 的 `package.json` 与 `pnpm-lock.yaml` 核过）：

| 机器 | profile | 依赖写法（实测值） |
| --- | --- | --- |
| arch-desktop（宿主，13080） | `~/.dsh/profiles/web` | `@xirizhi/dsh-leftpanel@0.1.4`（2026-11-25 从 GitHub URL 改成 npm） |
| NAS（`xrznas`，13080） | `/vol1/1000/docker/dsh-npm/home/profiles/web` | `@xirizhi/dsh-leftpanel@0.1.1`（走 npm，**未升**：仍是 0.1.1） |
| dsh-dev 容器（`127.0.0.1:3080`） | `/data/dsh/profiles/web` | `@xirizhi/dsh-leftpanel@0.1.4`（验证环境） |

写 `latest` 的地址也只在**再次 `dsh plugin add` 时**才会动：pnpm 把当时解析到的 URL 和 integrity 钉进 lock，
升级永远是一次显式 add + 重启，不会自己跟。

**改完 client 半边不必重启，改完 host 半边必须重启**（2026-11-25 实测）：前端入口清单按 profile 的
`package.json` 现算、`plugins/??…client.js` 由 web 端按请求读磁盘，所以只改 `client/client.js` 的版本
装完刷新页面就是新版（用「把 `collectionNav` 改成 `集合X` → 刷新即见」验证过，期间 `ActiveEnterTimestamp`
没变）；`index.js` 的路由与状态存储在进程启动时加载，改它必须在 `systemctl --user restart dsh` 后才生效。

**npm 安装要走 npmjs，不是默认镜像**：`dsh plugin add` 背后是 pnpm，默认 registry 是 npmmirror，
刚发布的版本它还没有（`ERR_PNPM_NO_MATCHING_VERSION`）。要么等镜像同步，要么在 profile 里直接
`pnpm add @xirizhi/dsh-leftpanel@<ver> --registry=https://registry.npmjs.org`（`package.json` 的
`dsh.profile.bundles` 已有该包，所以绕过 `dsh plugin` 也照常加载）。刚发布那几分钟 tarball 还可能
404（元数据先到、边缘缓存后到），重试即可，别当成发布失败。

NAS 从 GitHub URL 装时**走 mihomo 代理、不是直连**，节点抖动会让 `pnpm add <url>` 报 `TimeoutError`。
一次失败先复现（`curl -sI` 或 `node fetch` 看状态）再下结论，别换绕路方案；反复失败按
`/dev/tcp/github.com/443` → HTTP 状态 → 代理节点健康（`curl -H "Authorization: Bearer <secret>"
http://127.0.0.1:9090/proxies`，secret 在 `/root/.clashctl/data/runtime.yaml`）→
`journalctl | grep -c 'failed to create session'` 的顺序查。

生效验证先问接口，不看页面（无头 Chrome 处理不了 303 + HttpOnly cookie）：

```bash
curl -s -b <cookie> http://127.0.0.1:13080/api/left-panel/state
```

## 现状

- `main` 与 `origin/main` 同步；`origin` 是自己的 fork，`upstream` 是原作者仓库。
- npm 包是 **`@xirizhi/dsh-leftpanel`**（现役 0.1.4，2026-11-25 发布），不是原作者的 `@zhujiuyi/dsh-leftpanel`。
  宿主与 dsh-dev 容器装 0.1.4、NAS 仍是 0.1.1（见上「部署」），原作者的包已经从两个 profile 卸掉。
- 2026-11-25 三连发，起因是「集合模式开启后刷新，左栏又还原」：0.1.2 认 0.2.x 的包裹式面板行
  （见硬约束 5）、0.1.3 让重绘不再只挂 `requestAnimationFrame`、0.1.4 把集合行钉在滚动区顶部
  （见「三条实现要点」）。自检 43 → 49 项。
- 不带 scope 的 `dsh-leftpanel` 被 npm 以「与 `dsh-left-panel` 太像」403 拒绝过。
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
