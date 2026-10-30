/**
 * dsha-brand-rename 主机半边（index.js）的测试：
 * 它把「聊天模式称呼」注册成提示词变量 `{{user_nickname}}`，并挂一个
 * `/dsh-brand-rename-api` 让浏览器半边读写。
 *
 * 用法：node tests/host-nickname.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const chk = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w)
  if (ok) { pass++; console.log('  ✓', n) }
  else { fail++; console.log('  ✗', n, '\n      得到:', JSON.stringify(g), '\n      期望:', JSON.stringify(w)) }
}

/** 每个用例一个干净的 DSH_HOME，避免互相看到落盘的昵称。 */
async function mount() {
  const home = mkdtempSync(join(tmpdir(), 'dsha-nick-'))
  process.env.DSH_HOME = home
  const mod = await import('../index.js?home=' + encodeURIComponent(home))
  const variables = {}
  let route = null
  let logged = ''
  const realLog = console.log
  console.log = (line) => { logged += String(line) + '\n' }
  mod.apply({
    systemPrompt: { variable: (name, provider) => { variables[name] = provider } },
    inject: (deps, cb) => cb({
      webServer: { register: (r) => { route = r; return () => {} } },
      effect: (fn) => { fn(); return () => {} }
    })
  })
  console.log = realLog

  const call = async (method, body) => {
    const listeners = {}
    const req = {
      method,
      on(ev, fn) {
        listeners[ev] = fn
        if (ev === 'data' && body !== undefined) setTimeout(() => fn(Buffer.from(body)), 0)
        if (ev === 'end') setTimeout(() => fn(), 0)
        return this
      }
    }
    const res = {
      code: 0,
      writeHead(code) { this.code = code },
      end(text) { this.text = text }
    }
    await route.handler(req, res)
    return { code: res.code, body: JSON.parse(res.text) }
  }
  const store = () => join(home, 'dsh-brand-rename.json')
  const cleanup = () => rmSync(home, { recursive: true, force: true })
  return { variables, route, call, store, logged, inject: mod.inject, cleanup }
}

console.log('【1】注册提示词变量');
{ const m = await mount()
  chk('变量名就是 chat 预设里的那个', Object.keys(m.variables), ['user_nickname'])
  chk('没设置过时的默认称呼', m.variables.user_nickname({}), '伙伴')
  chk('挂了主机接口', m.route.path, '/dsh-brand-rename-api')
  chk('接口是精确匹配', m.route.kind, 'exact')
  chk('启动日志里能看到变量名', m.logged.includes('user_nickname'), true)
  chk('声明了 systemPrompt 依赖（漏了就取不到服务）', m.inject, ['systemPrompt'])
  m.cleanup() }

console.log('【2】读接口');
{ const m = await mount()
  const res = await m.call('GET')
  chk('GET 返回当前昵称', [res.code, res.body.nickname], [200, '伙伴'])
  chk('顺带给出默认值与上限', [res.body.default, res.body.max], ['伙伴', 24])
  chk('回显变量名，便于外部确认已注册', res.body.variable, 'user_nickname')
  m.cleanup() }

console.log('【3】写接口：改完立即可见 + 落盘');
{ const m = await mount()
  const res = await m.call('POST', JSON.stringify({ nickname: '旅人' }))
  chk('POST 成功并回读', [res.code, res.body.nickname], [200, '旅人'])
  chk('下一轮装配立刻拿到新值', m.variables.user_nickname({}), '旅人')
  chk('落盘了', JSON.parse(readFileSync(m.store(), 'utf8')).nickname, '旅人')
  m.cleanup() }

console.log('【4】提示词注入防护：换行 / 花括号 / 控制字符一律清掉');
{ const m = await mount()
  const res = await m.call('POST', JSON.stringify({ nickname: '坏\n人{{system}}' }))
  chk('换行与花括号被清掉', res.body.nickname, '坏 人system')
  chk('变量里也没有花括号', m.variables.user_nickname({}).includes('{'), false)
  m.cleanup() }
{ const m = await mount()
  const res = await m.call('POST', JSON.stringify({ nickname: 'x'.repeat(50) }))
  chk('超长被截到上限', res.body.nickname.length, 24)
  m.cleanup() }
{ const m = await mount()
  const res = await m.call('POST', JSON.stringify({ nickname: '\n\t  ' }))
  chk('空白 = 恢复默认', res.body.nickname, '伙伴')
  m.cleanup() }
{ const m = await mount()
  const res = await m.call('POST', JSON.stringify({ nickname: '{{}}' }))
  chk('清完是空 → 400，不动当前值', [res.code, res.body.ok, m.variables.user_nickname({})], [400, false, '伙伴'])
  m.cleanup() }

console.log('【5】坏请求不炸');
{ const m = await mount()
  chk('非法 JSON → 400', (await m.call('POST', 'not json')).code, 400)
  chk('空体 → 400，不动当前值', [((await m.call('POST', '')).code), m.variables.user_nickname({})], [400, '伙伴'])
  chk('PUT → 405', (await m.call('PUT')).code, 405)
  m.cleanup() }

console.log('【5b】预设有没有用上变量（决定设置界面要不要提醒）');
{ const m = await mount()
  chk('没有预设文件 → false', (await m.call('GET')).body.presetUsesVariable, false)
  m.cleanup() }
{ const home = mkdtempSync(join(tmpdir(), 'dsha-nick-'))
  process.env.DSH_HOME = home
  mkdirSync(join(home, '.agent-presets', 'chat'), { recursive: true })
  writeFileSync(join(home, '.agent-presets', 'chat', 'agent.cordis.yml'), 'prefix: 用“{{user_nickname}}，……”开头')
  const mod = await import('../index.js?preset=' + Date.now())
  let route = null
  mod.apply({
    systemPrompt: { variable: () => {} },
    inject: (d, cb) => cb({ webServer: { register: (r) => { route = r; return () => {} } }, effect: (fn) => (fn(), () => {}) })
  })
  const res = { code: 0, writeHead(c) { this.code = c }, end(t) { this.text = t } }
  await route.handler({ method: 'GET', on() { return this } }, res)
  chk('预设写上了变量 → true', JSON.parse(res.text).presetUsesVariable, true)
  rmSync(home, { recursive: true, force: true }) }

console.log('【6】重启后读回落盘的值');
{ const m = await mount()
  await m.call('POST', JSON.stringify({ nickname: '旧友' }))
  const home = m.store().replace('/dsh-brand-rename.json', '')
  process.env.DSH_HOME = home
  const mod = await import('../index.js?again=' + Date.now())
  const variables = {}
  mod.apply({
    systemPrompt: { variable: (n, p) => { variables[n] = p } },
    inject: () => () => {}
  })
  chk('换一份模块实例也读到落盘值', variables.user_nickname({}), '旧友')
  m.cleanup() }
{ const m = await mount()
  writeFileSync(m.store(), '{ 坏文件')
  const variables = {}
  const mod = await import('../index.js?broken=' + Date.now())
  mod.apply({ systemPrompt: { variable: (n, p) => { variables[n] = p } }, inject: () => () => {} })
  chk('文件坏了退回默认值', variables.user_nickname({}), '伙伴')
  m.cleanup() }

console.log(`\n结果：通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
