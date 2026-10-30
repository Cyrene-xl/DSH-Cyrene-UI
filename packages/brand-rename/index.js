/**
 * dsha-brand-rename 的主机半边。
 *
 * 浏览器表面（侧栏品牌 / 新会话标题 / 输入框提示 / 模式滑块 …）全在 client.js 里，
 * 这里只做一件浏览器做不到的事：把「用户昵称」注册成系统提示词变量
 * `{{user_nickname}}`，好让聊天模式那套昔涟人设里的称呼能从设置界面改。
 *
 * 为什么非要主机半边：`{{...}}` 的插值发生在主机的 `dsh-system-prompt` 里，
 * 变量只能由主机插件用 `ctx.systemPrompt.variable(name, provider)` 注册
 * （出厂只注册了 provider / model / cwd 三个）。provider 是函数，每轮装配时现取，
 * 所以设置界面改完**立刻**对之后的每一轮生效，不用重启、不用新建会话。
 *
 * 昵称存 `<DSH_HOME>/dsh-brand-rename.json`，并挂一个 `/dsha-brand-rename-api`
 * 给浏览器半边读写（浏览器半边碰不到主机文件系统）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 变量名必须和 chat 预设里那个 `{{user_nickname}}` 一致。 */
const VARIABLE = 'user_nickname'
/**
 * 需要的服务：`systemPrompt` 必须在 inject 里声明才能访问（Cordis 规则，
 * 直接 `ctx.systemPrompt` 会抛 "cannot get property ... without inject"）。
 * `webServer` 走 apply 里的 scoped inject —— 没有它的部署照样能注册变量。
 */
export const inject = ['systemPrompt']
/** 昵称落盘位置。 */
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
/** 昵称 / 浏览器设置状态文件。 */
const STORE = join(HOME, 'dsh-brand-rename.json')
/** 没设置过时的默认称呼。 */
const DEFAULT_NICKNAME = '伙伴'
/** 昵称最长多少字符：太长会把提示词撑变形，也可能被当成一段指令。 */
const MAX_LENGTH = 24
/**
 * 用这个变量的人设预设。只用来回答「预设里到底写没写 {{user_nickname}}」
 * —— 没写就说明提示词里还留着写死的称呼，设置界面得把这件事说出来，
 * 免得用户看到「已保存」却什么都没变。
 */
const CHAT_PRESET = join(HOME, '.agent-presets', 'chat', 'agent.cordis.yml')

/**
 * 人设预设现在是不是已经改用变量了。
 * @returns 预设文件里出现 `{{user_nickname}}` 时为 true。
 */
function presetUsesVariable() {
  try {
    return readFileSync(CHAT_PRESET, 'utf8').includes('{{' + VARIABLE + '}}')
  } catch (err) {
    return false
  }
}

/**
 * 清洗昵称：它最终会拼进系统提示词，所以不能带换行、花括号或控制字符
 * —— 否则等于让设置界面能往提示词里插任意指令。
 * @param value - 用户输入。
 * @returns 可安全放进提示词的昵称（空串表示非法）。
 */
function sanitize(value) {
  if (typeof value !== 'string') return ''
  const cleaned = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  if (cleaned === '') return ''
  return cleaned.slice(0, MAX_LENGTH)
}

/**
 * 读整个状态文件。文件不存在 / 坏了都返回空对象，绝不抛错。
 * @returns 解析后的对象。
 */
function readStore() {
  try {
    const parsed = JSON.parse(readFileSync(STORE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    return {}
  }
}

/**
 * 把补丁合并进状态文件。读写都走同一个函数，昵称与 view 不会互相覆盖。
 * @param patch - 要合并的字段。
 */
function saveStore(patch) {
  const next = Object.assign({}, readStore(), patch)
  writeFileSync(STORE, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return next
}

/** 浏览器半边设置的最大体积：太大说明混进了图片之类的数据。 */
const VIEW_MAX_BYTES = 512 * 1024

/**
 * 读浏览器半边的设置快照（标题、英文行、输入框提示……）。
 * 存宿主机而不是 localStorage：换端口 / 换包名 / 升级都会换 origin，
 * localStorage 会跟着丢，宿主文件不会。
 * @returns 设置对象，或 null（没存过 / 不是对象）。
 */
function loadView() {
  const value = readStore().view
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/**
 * 读昵称。文件不存在 / 坏了 / 内容非法都退回默认值，绝不抛错。
 * @returns 当前昵称。
 */
function loadNickname() {
  const value = sanitize(readStore().nickname)
  return value !== '' ? value : DEFAULT_NICKNAME
}

/**
 * 注册提示词变量，并按需挂上读写昵称的小接口。
 * @param ctx - 主机插件上下文。
 */
export function apply(ctx) {
  let nickname = loadNickname()

  ctx.systemPrompt.variable(VARIABLE, () => nickname)

  ctx.inject(['webServer'], (scope) => {
    const json = (res, obj, status = 200) => {
      const body = JSON.stringify(obj)
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(body)
    }
    const readBody = (req) => new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })

    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/dsh-brand-rename-api',
      async handler(req, res) {
        try {
          if (req.method === 'GET') {
            json(res, {
              ok: true,
              nickname,
              view: loadView(),
              default: DEFAULT_NICKNAME,
              max: MAX_LENGTH,
              /* 让浏览器半边（和外部巡检）能看出变量真的注册上了。 */
              variable: VARIABLE,
              presetUsesVariable: presetUsesVariable()
            })
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
          } catch (err) {
            json(res, { ok: false, error: '请求体不是 JSON' }, 400)
            return
          }
          if (payload.nickname === undefined && payload.view === undefined) {
            json(res, { ok: false, error: 'nickname / view 至少给一个' }, 400)
            return
          }
          let savedView = false
          if (payload.view !== undefined) {
            if (payload.view === null) {
              try {
                const next = readStore()
                delete next.view
                writeFileSync(STORE, JSON.stringify(next, null, 2) + '\n', 'utf8')
              } catch (err) { /* 忽略 */ }
              savedView = true
            } else if (typeof payload.view !== 'object' || Array.isArray(payload.view)) {
              json(res, { ok: false, error: 'view 必须是对象' }, 400)
              return
            } else {
              const serialized = JSON.stringify(payload.view)
              if (serialized.length > VIEW_MAX_BYTES) {
                json(res, { ok: false, error: 'view 太大（上限 ' + VIEW_MAX_BYTES + ' 字节）' }, 413)
                return
              }
              try { saveStore({ view: payload.view }) } catch (err) {
                json(res, { ok: false, error: '写不进去：' + String(err && err.message) }, 500)
                return
              }
              savedView = true
            }
          }
          if (payload.nickname !== undefined) {
            /* 空字符串 = 恢复默认，所以这里不走 sanitize 的「非法就丢弃」分支。 */
            const next = typeof payload.nickname === 'string' && payload.nickname.trim() === ''
              ? DEFAULT_NICKNAME
              : sanitize(payload.nickname)
            if (next === '') {
              json(res, { ok: false, error: '昵称不能为空，也不能只有换行 / 花括号' }, 400)
              return
            }
            nickname = next
            try { saveStore({ nickname }) } catch (err) {
              /* 写不进去也不影响这次生效，只是下次重启会退回旧值。 */
            }
          }
          json(res, { ok: true, nickname, view: savedView ? loadView() : undefined })
        } catch (error) {
          json(res, { ok: false, error: String(error && error.message) }, 400)
        }
      }
    }), 'dsh-brand-rename: /dsh-brand-rename-api')

    /* 表达风格接口已迁到 dsh-cyrene（/cyrene-style-api），这里不再重复注册。 */
  })

  console.log('[dsh-brand-rename] 提示词变量 {{' + VARIABLE + '}} 已注册（当前：' + nickname + '）')
}
