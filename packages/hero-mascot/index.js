/**
 * dsha-hero-mascot 的主机半边。
 *
 * 只做一件事：把 assets/hero.png 通过 webServer 暴露成一个固定 URL，
 * 供浏览器半边当 <img src> 使用。
 *
 * 为什么不把图片 base64 内联进 client.js：图有 ~300 KB，内联会让浏览器半边
 * 变成一个巨大的、改不动也读不了的字符串；走路由则源码保持可读，换成你自己的
 * 图时只要替换 assets/hero.png 再重启即可，不用改一行代码。
 *
 * 图片读一次就缓存住（进程内），避免每个请求都读盘。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 对外路径。与 /plugins/<id>/client.js 不冲突。 */
const ROUTE = '/dsh-hero-mascot/hero.png'
/** 磁盘路径。 */
const HERO_FILE = join(HERE, 'assets', 'hero.png')

const name = 'dsh-hero-mascot'
/** webServer 声明为硬依赖：loader 会等它就绪后再激活本行。 */
const inject = ['webServer']

function apply(ctx) {
  const webServer = ctx.webServer
  /** 进程内缓存；文件不存在时为保持 null，每次请求重试（方便换图后不重启也能生效一次）。 */
  let cached = null

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => {
      try {
        if (cached === null) cached = readFileSync(HERO_FILE)
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': String(cached.length),
          // 换图后重启即可生效；这里不用强缓存，避免浏览器留着旧图。
          'cache-control': 'no-cache'
        })
        res.end(cached)
      } catch (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('dsha-hero-mascot: assets/hero.png 读取失败 — ' + String((err && err.message) || err))
      }
    }
  }), 'dsh-hero-mascot: hero image route')
}

export { name, inject, apply }
