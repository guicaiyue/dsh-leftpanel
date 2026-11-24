# 早期候选（只有截图，没有可交互页面）

2026-11-23 上午在这几个方向上各做了一版原型，下午选定「徽标 + 单层双列」，演进是
**B → B2 → 定稿**（A、C 是并行的另外两个方向）。现役定稿只有一份：
`mock/collection-final.html`。

**这里的 html 已经删掉了，只剩截图**。原因很实在：OpenDesign 的「设计文件」页按扩展名
列页面，不管 `.gitignore`，四个候选 html 摆在那里就是四个和定稿长得一样、路径还不同的
「完整页面」，下次改原型极容易点错。要交互复现某一版，从 git 历史取回来即可：

```bash
git show HEAD:mock/collection-B2.html > /tmp/B2.html   # 删掉的那次提交之前，四个都在 mock/
open /tmp/B2.html
```

| 版本 | 方向 | 截图 | 为什么没选 |
| --- | --- | --- | --- |
| A | 面包屑行 + 单列卡片 | `shots/A-dark.png`、`shots/A-light.png` | 列表一长就要滚动；行里塞「当前在哪个插件」，比只给数字更容易看错 |
| B | 徽标 + 带搜索与分组的卡片 | `shots/B-dark.png`、`shots/B-light.png` | 7 个入口用不上搜索，分组又把同一张卡片切成两层 |
| B2 | 徽标 + 双列卡片，但「更多」仍单独一层 | `shots/B2-closed-dark.png`、`shots/B2-open-dark.png` | 两层卡片，「更多」看着像独立分组；定稿把它并进同一网格（截图里能看到右下角那个单独的「更多」） |
| C | 宫格（2 列 × 4 行） | `shots/C-dark.png`、`shots/C-light.png` | 密度最高但和 DSH 现有菜单家族不像；超过 8 项要在卡片里滚 |

定稿的三态 × 暗/亮在 `mock/shots/`，由 `node scripts/mock-shots.mjs` 出；`mock/` 下
只允许两个 html（`collection-final.html` + `index.html`），由 `test/mock-integrity.mjs` 钉住。