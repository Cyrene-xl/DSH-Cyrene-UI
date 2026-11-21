# dsh-cyrene-ui

DSH-Cyrene 界面美化的**聚合包**：一次安装下面三个插件，省去逐条 `dsh plugin add`。

| 包含的包 | 作用 |
|---|---|
| `dsh-brand-rename` | 侧栏品牌字、新会话标题、输入框提示、权限名、称呼 |
| `dsh-hero-mascot` | 新会话吉祥物：上传、抠白底、大小位置、锁定 |
| `dsh-cyrene-thinking` | 「正在分析请求」旁的昔涟思考循环动画 |

## 安装

```bash
dsh plugin --profile web add dsh-cyrene-ui
```

重启 DSH 生效。

## ⚠️ 不要和单包同时装

聚合包通过 patch 插入三个插件行；如果 profile 里**同时**还有
`dsh-brand-rename` / `dsh-hero-mascot` / `dsh-cyrene-thinking` 这三个
bundle，同一个 id 会被插入两次，加载器报重复。

- 想全装：只装 `dsh-cyrene-ui`；
- 想只装其中一个：装对应的单包，不要装聚合包。

## 卸载

```bash
dsh plugin --profile web remove dsh-cyrene-ui
```

只卸聚合包不会自动卸依赖；不需要的话再分别 `remove` 三个单包。

## 许可

MIT。吉祥物与思考动画含非商用同人素材，详见仓库根目录
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)。
