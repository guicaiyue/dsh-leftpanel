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

## 现状

- `main` 与 `origin/main` 同步；`origin` 是自己的 fork，`upstream` 是原作者仓库。
- npm 上 `0.1.0` 是**原作者发布的版本，不含集合模式**；本仓库的改动还没有发版。
- 没有 CI workflow，也没有提交插件市场的条目。
