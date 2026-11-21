# 更新记录

## 2026-11-21 — 聚合包

### dsh-cyrene-ui 0.1.0

- 新增聚合包：依赖 `dsh-brand-rename@^1.16.4`、`dsh-hero-mascot@^2.2.1`、
  `dsh-cyrene-thinking@^0.1.0`，通过 bundle patch 一次插入三个插件行；
- 安装：`dsh plugin --profile web add dsh-cyrene-ui`；
- 与单包**互斥**：同时装会让同一个 id 插入两次，加载器报重复。

## 2026-11-14 — 补丁版本

### dsh-brand-rename 1.16.4

- **fix（P0）**：client bundle 的 loader id 从 `dsha-brand-rename` 改为包名
  `dsh-brand-rename`。DSH 0.2.x 按包名收客户端模块，旧 id 会报
  `loaded without registering`，整个界面层不加载。
- **fix（P1）**：风格按钮未加载完时点击不展开 —— 改为先用内置六档展开菜单，
  再后台刷新。
- **fix（P1）**：风格按钮不跟随设置变更 —— 窗口 focus / `visibilitychange`
  时刷新，数据晚到时重画菜单。
- **fix（P1）**：`hostEnabled` 用 `location.href` 协议当闸门，桌面端/自定义协议
  下所有风格请求被静默拦掉 —— 改为有 `fetch` 就发，同源拼绝对地址；失败在按钮
  上显示「接口未连接」，4 秒超时。
- 新增 loader-id 契约测试（client 的注册 id 必须等于包名）。

### dsh-hero-mascot 2.2.1

- **fix（P0）**：client bundle 的 loader id 从 `dsha-hero-mascot` 改为包名
  `dsh-hero-mascot`，原因同上；新增 loader-id 契约测试。

### dsh-cyrene-thinking 0.1.0

- 仅补 `publishConfig` 与 README 图片路径，功能未变。
