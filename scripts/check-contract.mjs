#!/usr/bin/env node
/**
 * 发布契约自检：engines / exports 是否都是文件 / files 覆盖 / 无生命周期脚本 / 零运行时依赖。
 * 用法：node scripts-check-contract.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

const root = dirname(fileURLToPath(import.meta.url))
const packagesDir = join(root, 'packages')
let failed = 0

for (const name of readdirSync(packagesDir)) {
  const dir = join(packagesDir, name)
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) continue
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const errors = []
  if (!pkg.name || !pkg.version) errors.push('缺 name/version')
  if (!pkg.engines?.node) errors.push('缺 engines.node')
  if (!pkg.engines?.dsh) errors.push('缺 engines.dsh')
  if (!pkg.license) errors.push('缺 license')
  if (!existsSync(join(dir, 'LICENSE'))) errors.push('缺 LICENSE 文件')
  if (pkg.private === true) errors.push('仍是 private')
  for (const bad of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (pkg.scripts?.[bad]) errors.push(`含生命周期脚本 ${bad}`)
  }
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) errors.push('含运行时依赖')
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (!target.startsWith('./')) { errors.push(`exports ${key} 不是相对路径`); continue }
    if (!existsSync(resolve(dir, target))) errors.push(`exports ${key} 指向不存在的文件：${target}`)
  }
  for (const file of pkg.files ?? []) {
    if (!existsSync(join(dir, file))) errors.push(`files 含不存在的路径：${file}`)
  }
  if (errors.length > 0) {
    failed += 1
    console.log(`✖ ${pkg.name}`)
    for (const e of errors) console.log('  -', e)
  } else {
    console.log(`✔ ${pkg.name} @ ${pkg.version}`)
  }
}
process.exit(failed === 0 ? 0 : 1)
