import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/editor/EditorPage.tsx', import.meta.url), 'utf8')

assert.match(
  source,
  /const shouldPoll = publishProgress\.running \|\| \(publishProgress\.stage === 'success' && publishProgress\.vercelStatus === 'deploying'\)[\s\S]*?if \(!shouldPoll\) return/,
  'publish progress polling must continue only while the background Vercel update is active',
)
assert.match(
  source,
  /if \(url === '\/api\/editor\/publish'\)\s*\{[\s\S]*?setPublishProgress\(\{[\s\S]*?stage: 'build'[\s\S]*?\}\)/,
  'publish must render an initial in-progress state before waiting for the API response',
)
assert.match(
  source,
  /if \(url === '\/api\/editor\/publish' && !failure\.details\?\.progress\)\s*\{[\s\S]*?running: false[\s\S]*?stage: 'error'/,
  'publish must leave the in-progress state when the API request fails without progress details',
)
assert.match(
  source,
  /result\.progress\.vercelStatus === 'deployed' \? '发布完成，线上版本已更新' : '发布完成，Vercel 正在自动更新'/,
  'GitHub verification must complete the publish action without waiting for Vercel confirmation',
)
assert.doesNotMatch(source, /recheckVercel\(\)|stage === 'pending'/, 'publish UI must not require manual Vercel confirmation')

console.log('publish progress regression checks passed')
