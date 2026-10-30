# DSH-Cyrene-UI

[DeepSeek Harness](https://github.com/deepseek-ai) 的界面美化插件集合，与
[dsh-cyrene](https://github.com/Cyrene-xl/DSH-Cyrene) 人设插件配套使用，但**各自独立**：
不装 dsh-cyrene 也能用，只是部分联动（称呼变量、表达风格入口）会自然失效。

## 包含的插件

| 包 | 作用 |
|---|---|
| [`packages/brand-rename`](./packages/brand-rename) | 侧栏品牌字、新会话标题（多条 / 随机或顺序 / 中英文样式 / 可锁定）、输入框提示、侧栏英文、底栏单位、权限预设名，以及设置里的「称呼偏好」 |
| [`packages/hero-mascot`](./packages/hero-mascot) | 新会话 Hero 区左侧吉祥物：上传图片（可选抠白底）、大小与位置、锁定防误触 |

> `dsha-pet-button`（唤起 Live2D 桌宠）**不在此仓库**：它的使用对象偏桌面/Windows，
> 需要设备桥，和这里纯 Web 的主题插件不是一类。

## 安装

需要 DSH **0.1.5 ~ 0.2.1**、Node 22+。

```bash
git clone https://github.com/Cyrene-xl/DSH-Cyrene-UI.git
cd DSH-Cyrene-UI

# 按需装其中一个或两个
dsh plugin --profile web add link:$PWD/packages/brand-rename
dsh plugin --profile web add link:$PWD/packages/hero-mascot
```

装完重启一次 DSH（或重开 App），设置 → 通用里会出现对应设置行。
卸载：`dsh plugin --profile web remove dsh-brand-rename`（同理换另一个包名）。

## 开发与测试

每个包零运行时依赖，测试用 Node 内置 runner：

```bash
cd packages/brand-rename && node --test tests/*.mjs
cd packages/hero-mascot && node --test tests/*.mjs
```

## 许可

- **代码**：MIT，见 [`LICENSE`](./LICENSE)。
- **吉祥物默认图**：同人衍生素材，角色版权归 HoYoverse / 米哈游，**禁止商用**，
  详见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)；可自行上传图片替换。

## 与 dsh-cyrene 的关系

- `brand-rename` 会把「称呼偏好」注册成提示词变量 `{{user_nickname}}`（需要宿主有
  `systemPrompt` 服务）；没有 dsh-cyrene 时，这个变量不会被任何预设使用，设置行仍可打开。
- `brand-rename` 的 Hero 风格按钮依赖 `/cyrene-style-api`（由 dsh-cyrene 提供）；
  没有它时按钮自动隐藏，不会显示点不动的假入口。
