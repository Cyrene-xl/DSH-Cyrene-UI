/**
 * dsh-cyrene-thinking 的主机半边。
 *
 * 两件事：
 *   1. 把 assets/thinking.gif 通过 webServer 暴露成固定 URL；
 *   2. 提供开关接口（默认开），配置存 <DSH_HOME>/dsh-cyrene-thinking.json。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const STORE = join(HOME, 'dsh-cyrene-thinking.json')
const ASSET = join(HERE, 'assets', 'thinking.gif')
const ROUTE = '/dsh-cyrene-thinking/thinking.gif'
const API = '/dsh-cyrene-thinking-api'

const name = 'dsh-cyrene-thinking'
const inject = ['webServer']

function readEnabled() {
  try {
    const raw = JSON.parse(readFileSync(STORE, 'utf8'))
    return raw?.enabled !== false
  } catch {
    return true
  }
}

function writeEnabled(enabled) {
  try {
    mkdirSync(HOME, { recursive: true })
    writeFileSync(STORE, JSON.stringify({ enabled: enabled === true }, null, 2) + '\n', 'utf8')
    return true
  } catch {
    return false
  }
}

function json(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = ''
    req.on('data', (chunk) => { text += chunk })
    req.on('end', () => resolve(text))
    req.on('error', reject)
  })
}

function apply(ctx) {
  const webServer = ctx.webServer
  let cachedGif = null

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => {
      try {
        if (cachedGif === null) cachedGif = readFileSync(ASSET)
        res.writeHead(200, {
          'content-type': 'image/gif',
          'content-length': String(cachedGif.length),
          'cache-control': 'public, max-age=86400'
        })
        res.end(cachedGif)
      } catch (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('dsh-cyrene-thinking: assets/thinking.gif 读取失败 — ' + String((err && err.message) || err))
      }
    }
  }), 'dsh-cyrene-thinking: animation route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: API,
    async handler(req, res) {
      try {
        if (req.method === 'GET') {
          json(res, { ok: true, enabled: readEnabled(), path: STORE })
          return
        }
        if (req.method !== 'POST') {
          json(res, { ok: false, error: '只支持 GET / POST' }, 405)
          return
        }
        const raw = await readBody(req)
        let payload = {}
        try {
          payload = raw ? JSON.parse(raw) : {}
        } catch {
          json(res, { ok: false, error: '请求体不是 JSON' }, 400)
          return
        }
        if (typeof payload.enabled !== 'boolean') {
          json(res, { ok: false, error: 'enabled 必须是 true / false' }, 400)
          return
        }
        if (!writeEnabled(payload.enabled)) {
          json(res, { ok: false, error: '写入 ' + STORE + ' 失败' }, 500)
          return
        }
        json(res, { ok: true, enabled: readEnabled() })
      } catch (error) {
        json(res, { ok: false, error: String((error && error.message) || error) }, 500)
      }
    }
  }), 'dsh-cyrene-thinking: settings api')
}

export { name, inject, apply }
