# dsh-leftpanel · 左栏菜单管理

> DeepSeek Harness 插件：列出所有可以出现在左侧菜单里的功能，逐个隐藏或显示。
> 入口在 **设置 → 左栏菜单**，不占用左侧菜单本身。

左侧菜单里能出现的每一项都由插件注册而来。装上本插件后，设置里会多出一个
「左栏菜单」分区，把当前所有面板入口列成一张表，每一项后面带一个开关：

- **面板入口** —— 插件注册到 `sidebar.panellist` 的条目（插件、自动化任务、
  Token 用量、MCP 服务……），可逐项隐藏或显示。
- **固定控件** —— 侧边栏外壳自己的座位（新建会话、工作区/会话列表、设置、底部
  控件、品牌标记）。它们不经过面板注册，因此只列出、不提供开关。

隐藏只改变左侧入口的可见性：被隐藏的功能仍然完整注册在布局服务里，通过命令、
快捷键或其他入口照常可以打开。

> 本插件**故意不占用左侧菜单**：一个管理菜单的插件自己去挤那个菜单，只会给
> 用户想清理的列表再添一行。

## 安装

```bash
# 在 desktop（或任意）profile 目录里
pnpm add link:E:/dsh-plugin/dsh-leftpanel
```

再把包名加进 profile 的 `package.json` → `dsh.profile.bundles`：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@zhujiuyi/dsh-leftpanel"]
    }
  }
}
```

重启 DSH 后，打开 **设置**，左栏标签列里会出现「左栏菜单」。

## 它怎么工作

两个半边：

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| Host | `index.js` | 把「哪些入口被隐藏」持久化到 Harness home 下的 `left-panel.json`，并提供 `GET/POST /api/left-panel/state` |
| Browser | `client/client.js` | 向设置页的 `settings.section` 列表注册「左栏菜单」分区，并把隐藏状态应用到侧边栏行上 |

**为什么需要 Host 半边。** 隐藏集合必须在首屏绘制前就能读到，而且要跨重启保留。
放在 Host 侧意味着每个 profile 只有一份权威状态，浏览器侧读到的就是它。

**左栏行是怎么被隐藏的。** 侧边栏外壳拥有自己的行列表：它为 `sidebar.panellist`
的每个存活条目渲染一行，本身没有「隐藏」概念，而注销别的插件的注册也不是本插件
该做的事。本插件做的是一次表现层的处理：找到外壳那个行列表（`<nav>` 下直接挂着
面板按钮），按与外壳完全相同的排序规则把行与条目投影对齐，再用行的可访问名称
交叉校验，给命中的行打上 `data-dsh-leftpanel-hidden`，由本插件样式表里的一条规则
把它变成 `display:none`。

这样做的好处是：别的插件组件保持挂载、状态不丢；而且能自愈——`MutationObserver`
会在外壳重新渲染（切换语言、折叠/展开、插件迟到加载）时重新应用标记。当行数与
投影不一致或名称对不上时，只处理名称精确匹配的行，退化成「不隐藏任何行」，而
不会隐藏错行。

**持久化。** `localStorage` 只作首屏镜像，让第一次绘制就隐藏正确的行；Host 侧的
`left-panel.json` 才是权威。每次开关都会乐观写入并回报失败。

## 存储

`<DSH home>/left-panel.json`（默认 `~/.dsh/left-panel.json`）：

```json
{
  "version": 1,
  "hidden": ["plugins", "token-dashboard"]
}
```

损坏的文件不会让页面报错：它降级为「什么都没隐藏」，并在日志里告警一次。

## 开发

```bash
node --check index.js && node --check client/client.js
node --test "test/*.mjs"
```

两组自检，共 24 项：

- `test/client-selfcheck.mjs` —— 模块加载器契约、只注册设置分区（且**不**注册左侧
  行）、`t` 由 `locale` 座位提供而非 `inject` 注入、双语文案键一致、样式表不含
  远程资源、Host 侧路由注册与 `left-panel.json` 的真实读写（含损坏文件与并发写入）。
- `test/dom-pass.mjs` —— 用真实 DOM 结构验证隐藏处理：命中的行被标记、未命中的
  不被标记、按 `order` 对齐、行数不一致时退化为名称匹配、名称不一致时宁可不隐藏。

## 许可

MIT
