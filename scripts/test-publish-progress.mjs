import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/editor/EditorPage.tsx', import.meta.url), 'utf8')

assert.match(
  source,
  /const shouldPoll = publishProgress\.running \|\| publishProgress\.stage === 'pending'[\s\S]*?if \(!shouldPoll\) return/,
  'publish progress polling must start while a publish request is running, before a commit exists',
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

console.log('publish progress regression checks passed')
