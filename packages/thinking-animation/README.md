# dsh-cyrene-thinking

把 DSH 聊天里「正在分析请求 / Thinking」旁边的小图标，换成昔涟的思考循环动画。

- **底部运行状态**：`正在分析请求` 旁边的鲸鱼尾（`runningIcon`）→ 小昔涟 GIF；
- **过程标题**：运行中的思考行同样替换；标题文字变成「已完成分析」后自动还原，不碰历史；
- 设置 → 通用 → **「思考动画」** 开关，默认开；配置存 `<DSH_HOME>/dsh-cyrene-thinking.json`；
- 动画由宿主路由 `/dsh-cyrene-thinking/thinking.gif` 提供，不内联进 JS。

![效果](../../docs/screenshots/thinking.gif)

## 安装

```bash
dsh plugin --profile web add link:$PWD/packages/thinking-animation
```

重启 DSH 生效。

## 兼容性

- 需要 DSH **0.1.5 ~ 0.2.1**、Node **22+**；
- 依赖 DSH 的 `button[data-process-activity]` 与 `[class*="_runningIcon"]` 结构，
  升级大版本后如果动画不出现，多半是这两个选择器改名了；
- 只在 Web 端生效，不影响模型输出。

## 素材来源与授权

`assets/thinking.gif` 来自 [Cyrene-Agent](https://github.com/Playa-Cyrene/Cyrene-Agent)
的 `assets/ui/cyrene-thinking-loop/`（MIT 仓库）；角色「昔涟」版权归 HoYoverse / 米哈游，
属非商用同人素材，**禁止商用**，详见根目录
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)。
