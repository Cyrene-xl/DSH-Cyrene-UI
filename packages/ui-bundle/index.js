/**
 * dsh-cyrene-ui —— 聚合包本身没有运行时逻辑。
 *
 * 它只做两件事：
 *   1. 依赖三个界面插件，保证一起装上；
 *   2. 通过 cordis.patch.yml 把三个插件行一起插入 profile。
 *
 * 真正的代码在各自的包里；这里保持空 apply，避免加载器把聚合包当成
 * 需要注册服务的插件。
 */
export const name = 'dsh-cyrene-ui'

export function apply() {
  /* 空实现：不注册任何服务 / 工具 / 路由。 */
}
