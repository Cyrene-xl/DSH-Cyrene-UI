/**
 * 宿主半边：GIF 路由 + 开关读写。
 * 用临时 DSH_HOME 动态导入，避免动到真实 ~/.dsh。
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'dsh-thinking-'));
process.env.DSH_HOME = home;

let routes;
before(async () => {
  routes = new Map();
  const ctx = {
    webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => routes.delete(path); } },
    effect: (fn) => fn()
  };
  const mod = await import('../index.js');
  mod.apply(ctx);
});

function fakeRes() {
  return { status: 0, headers: {}, body: null, writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b; } };
}

test('GIF 路由返回 image/gif', async () => {
  const res = fakeRes();
  await routes.get('/dsh-cyrene-thinking/thinking.gif')({ method: 'GET' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/gif');
  assert.ok(res.body.length > 1000);
});

test('开关默认开，POST 关闭后可回读', async () => {
  let res = fakeRes();
  await routes.get('/dsh-cyrene-thinking-api')({ method: 'GET' }, res);
  assert.equal(JSON.parse(res.body).enabled, true);

  res = fakeRes();
  const req = {
    method: 'POST',
    on(event, fn) {
      if (event === 'data') fn(Buffer.from(JSON.stringify({ enabled: false })));
      if (event === 'end') fn();
    }
  };
  await routes.get('/dsh-cyrene-thinking-api')(req, res);
  assert.equal(JSON.parse(res.body).enabled, false);
  assert.equal(JSON.parse(readFileSync(join(home, 'dsh-cyrene-thinking.json'), 'utf8')).enabled, false);
});
