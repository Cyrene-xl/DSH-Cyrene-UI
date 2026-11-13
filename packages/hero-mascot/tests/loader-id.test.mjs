/** client bundle 必须以 package.json 的包名注册，否则 DSH 0.2.x 加载后判定「未注册」。 */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('hero-mascot: loader id 等于包名', () => {
  const src = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const id = /__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/.exec(src)?.[1];
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(id, pkg.name);
});
