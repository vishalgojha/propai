import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const entryPath = require.resolve('@page-agent/page-controller')
const distDir = dirname(entryPath)
const distFile = join(distDir, 'page-controller.js')

const source = readFileSync(distFile, 'utf8')
const from = 'const asyncFunction = eval(`(async () => { ${script} })`);'
const to = 'const asyncFunction = (0, eval)(`(async () => { ${script} })`);'

if (source.includes(to)) {
	console.log('[patch-page-controller] already patched')
	process.exit(0)
}

if (!source.includes(from)) {
	console.warn('[patch-page-controller] target snippet not found, skipping')
	process.exit(0)
}

writeFileSync(distFile, source.replace(from, to), 'utf8')
console.log('[patch-page-controller] patched direct eval in page-controller dist')
