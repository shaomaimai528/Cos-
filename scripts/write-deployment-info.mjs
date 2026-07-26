import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const publicDir = path.join(root, 'public')

function getCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

await fs.mkdir(publicDir, { recursive: true })
await fs.writeFile(path.join(publicDir, 'deployment-info.json'), JSON.stringify({
  commit: getCommit(),
  environment: process.env.VERCEL_ENV || 'local',
  generatedAt: new Date().toISOString(),
}, null, 2), 'utf8')
