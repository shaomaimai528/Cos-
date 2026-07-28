import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')

async function assertFile(relativePath) {
  const target = path.join(dist, relativePath)
  try {
    await access(target)
  } catch {
    throw new Error(`Missing build output: ${relativePath}`)
  }
}

await assertFile('index.html')
await assertFile('deployment-info.json')
await assertFile('editor-content.json')

const html = await readFile(path.join(dist, 'index.html'), 'utf8')
if (!html.includes('/assets/')) throw new Error('index.html does not reference bundled assets')

console.log('Deployment build check passed.')
