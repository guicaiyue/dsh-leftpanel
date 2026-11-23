# 给接手这个仓库的 agent

DSH 插件 `@xirizhi/dsh-leftpanel`：把左侧菜单的面板入口收进一行「集合」，并逐个隐藏或显示。
现役行为、存储格式与真机截图见 [`README.md`](README.md)；设计出题稿（已过期，仅留依据）在
[`docs/proto/collection-brief.md`](docs/proto/collection-brief.md)。

## 怎么跑

```bash
node --check index.js && node --check client/client.js   # 语法
node --test "test/*.mjs"                                  # 38 项自检
```

容器里跑真机（本机 `~/Projects/dsh-docker`）：

```bash
docker compose restart dsh          # 改 client/index 后都要重启
./dev-url.sh                        # 拿地址（cookie 失效时自动抓 token）
```

## 四条硬约束

1. **注入 DOM 的类名必须避开宿主和本插件设置页已用的名字。** 设置页自己有 `.lp-card`，
   侧栏浮层只能用 `.lp-fly*`。历史上把浮层也叫 `.lp-card`，那条 `position:fixed` 落到
   设置页的两张卡片上，整页叠成一团。`test/client-selfcheck.mjs` 钉着这条。
2. **注入的行必须在 `buildRow()` 时就带 `aria-label`。** 外壳靠「`nav` 下按钮都有可访问名」
   认行列表；匿名行会让判据失效，行刚插进去就被自己拆掉。
3. **注入的行必须从面板投影里排除**（`readRowModel` / `applyRowMarks` / `findRowList`），
   否则它会把自己列进卡片。
4. **降级必须是「什么都不隐藏」，不是「藏了回不去」。** 集合行挂载失败、溢出菜单读取
   失败，都要退回到「面板行照常显示 + 外壳的『更多』放回来」，不许留一个空壳。

## 集合模式的两条实现要点

- **「更多」的条目不是写死的**：`harvestMoreEntries()` 把外壳真实菜单开一次、读
  `[role=menuitem]`、再关掉（期间给 `<html>` 挂 `data-dsh-leftpanel-harvest` 让菜单透明）。
  所以别的插件往 `sidebar.panellist.actions` 加东西会自动跟上来。
- **条目逐行铺两列**（`splitColumns` 用 `index % 2`），不是列优先。列优先会让「更多」的
  两项一起落进右列、上下叠着，看起来仍像一个独立分组。

## 部署

两台机器都从 **GitHub Release 的构建物**装，不走插件市场：

| 机器 | profile | 依赖写法 |
| --- | --- | --- |
| arch-desktop（宿主，13080） | `~/.dsh/profiles/web` | `https://github.com/guicaiyue/dsh-leftpanel/releases/latest/download/dsh-leftpanel.tgz` |
| NAS（`xrznas`，13080） | `/vol1/1000/docker/dsh-npm/home/profiles/web` | `file:/vol1/1000/docker/dsh-npm/plugins-dist/dsh-leftpanel-<ver>.tgz` |

NAS 直连 GitHub 会超时（拉 tarball 时 pnpm 报 TimeoutError），所以走「本地下载 → scp →
按本地文件装」。升级时要**先把新 tarball 传过去再 add**，`file:` 指向的文件被替换后
pnpm 不会自己更新。

装完必须重启：宿主 `systemctl --user restart dsh`，NAS `systemctl restart dsh`。
验证不看浏览器（无头 Chrome 处理不了 303 + HttpOnly cookie），直接问接口：

```bash
curl -s -b <cookie> http://127.0.0.1:13080/api/left-panel/state
```

## 现状

- `main` 与 `origin/main` 同步；`origin` 是自己的 fork，`upstream` 是原作者仓库。
- npm 包是 **`@xirizhi/dsh-leftpanel`**（0.1.0），不是原作者的 `@zhujiuyi/dsh-leftpanel`。
  两台机器装的都是构建物（见上「部署」），原作者的包已经从两个 profile 卸掉。
  不带 scope 的 `dsh-leftpanel` 被 npm 以「与 `dsh-left-panel` 太像」403 拒绝过。
- 发版：推 `v*` 标签 → `.github/workflows/release.yml`（质量门 → Release + 稳定别名
  `dsh-leftpanel.tgz` → 有 `NPM_TOKEN` 就发 npm）。细节见 `docs/PUBLISH.md`。
- 插件市场：`docs/market/guicaiyue__dsh-leftpanel.yml` + `scripts/market-submit.sh`（幂等）。
  门禁要求仓库创建满 1 天、`dsh.bundle` 已声明、`category` 在允许列表里（本条目用 `ui`）。
- OpenDesign 项目 `dsh-leftpanel` 直接挂在这个仓库（`baseDir` 就是仓库根，没有副本）。
