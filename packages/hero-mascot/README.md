# dsh-hero-mascot

![效果](./assets/screenshot.jpg)

新会话 Hero 区左侧的吉祥物，外加一个调节面板。

- **图片可换**：默认用 `assets/hero.png`，也可以在设置里**上传自己的图**
- **可选抠白底**：上传时从画布四边泛洪掉与边框连通的纯白背景
- **可调**：在 **设置 → 通用** 里实时调节**大小 / 水平位置 / 垂直位置**
- **可锁定**：同一行有「锁定位置与大小」开关，锁上后三根滑杆不可拖动（防误触），状态存 local
- 改动即时生效并写入 `localStorage`，刷新与重开都在

## 图片处理

上传的图在浏览器端做三步，产出 PNG data URL 存进 `localStorage`：

1. **降采样到长边 384**（显示尺寸最大 160px × dpr 1.875 ≈ 300px，384 有富余）；
2. **可选抠白底**：从画布四边泛洪填充，只吃掉与边框连通的近白像素
   （亮度 ≥ 240 且饱和度 ≤ 12）。**角色内部被描边围住的白色不会被打洞**；
3. 对紧邻背景的一圈像素做 **3×3 alpha 均值**羽化 —— 1px 宽的软化带，
   把描边锯齿抹平。这会让 1px 细线的最外圈降到约 170/255（刻意软化，不是丢失）。

编码后若超过 `MAX_IMAGE_CHARS`（1.2M 字符）就继续降采样，四次仍不行则提示失败。
`getImageData` / `toDataURL` 失败（极端图片、内存不足）也走同一条失败提示。

抠白底开关**在选择图片时生效**；要改就重新选一次 —— 这样只需要存处理后的结果，
不必在 `localStorage` 里同时留一份原图。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 主机半边：把 `assets/hero.png` 通过 webServer 暴露成 `/dsh-hero-mascot/hero.png` |
| `client.js` | 浏览器半边：占 `conversation.hero.brand.mark` 槽位 + 注册 `settings.general.item` 设置行 |
| `assets/hero.png` | 吉祥物图片（512×512 RGBA，已抠白底） |

**为什么不把图片 base64 内联进 `client.js`**：图有 ~300 KB，内联会让浏览器半边变成一个
巨大且改不动的字符串。走路由后源码保持可读，换图只要替换 `assets/hero.png` 再重启。

## 图片是怎么处理的

原图是 1440×1440 白底 JPEG。处理步骤（Node + `jpeg-js` / `pngjs` 纯 JS 实现）：

1. **从画布四边泛洪填充**，只抠掉「与边框连通的近白像素」（亮度 ≥ 240 且饱和度 ≤ 12）。
   这一点很关键：角色衬衫、裙摆的白色被深色描边围住、不与边框连通，因此**完整保留**，
   不会被打出空洞；`你好` 字样与叶片描边同样保留。
2. **边界羽化**：只对紧邻背景的像素做一次 3×3 alpha 均值，软化描边处的锯齿，避免浅色白边。
3. **预乘 alpha 的 box 降采样**到 512×512 —— 直接用普通平均会让半透明边缘混入白色，
   产生暗边/白边。

要换图：把自己的图替换掉 `assets/hero.png`（同样建议先抠成透明底），重启 Web 即可。

## 设置行

`settings.general.item` 是 `@deepseek-ai/dsh-client-ui-settings-general` 声明的 **list** 槽位，
用 `id: 'hero-mascot'` 注册即可在「设置 → 通用」里追加一行。

行样式照官方 `EnterBehaviorRow` 的 CSS 原值复刻（那套是另一个 CSS 模块的 hash 类名，
无法跨模块复用）：

```css
row    { border-bottom: .5px solid var(--dsw-alias-border-l2); padding: 16px 0 }
title  { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px }
desc   { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px }
```

文案走本插件自己的 locale 命名空间 `dsh-hero-mascot`（中/英），
**不能**借用 `conversation` —— `locale.register` 对同 namespace + 同语言会直接抛错。

取值范围：大小 24–160 px，水平/垂直偏移 −80–80 px；超出范围的值在读盘时会被夹回。

## 安装 / 卸载

```sh
python3 /root/.dsh/plugin-manager.py import <本目录的 zip>

# 卸载
dsh plugin --profile web remove dsh-hero-mascot
```

装好后**重启 Web** 生效。

## 注意

- 依赖官方槽位契约 `conversation.hero.brand.mark` 与 `settings.general.item`，
  以及 `--dsw-alias-*` 设计令牌；DSH 前端大版本升级若改了这些，需要同步更新。
- 主机路由注册失败时吉祥物不显示，但设置行仍在（设置行不依赖路由）。
- 手机上 `.fish` 的悬停游动动画不会触发（`(hover: hover)` 不成立），是静态的。
