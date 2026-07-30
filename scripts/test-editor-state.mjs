import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/editor/contentState.ts', import.meta.url), 'utf8')
const editorPage = await readFile(new URL('../src/editor/EditorPage.tsx', import.meta.url), 'utf8')

assert.match(source, /function shouldUseEditorApi\(\)/, 'local preview must be able to identify the editor host')
assert.match(
  source,
  /const stateUrl = preview \|\| shouldUseEditorApi\(\)[\s\S]*?\/api\/editor\/state/,
  'local preview must request the current editor state before using the published snapshot',
)
assert.match(
  source,
  /if \(state\) \{[\s\S]*?return getCachedEditorState\(preview\) \?\? state/,
  'a valid state response must not be discarded when the cache generation changes',
)
assert.match(
  editorPage,
  /const saved = await saveState\(next, '[^']+'\)\r?\n\s+if \(saved && galleryId\) preservePreviewLocation\(galleryId\)/,
  'deleting an inserted gallery image must restore the gallery context after the state update',
)
assert.match(
  editorPage,
  /if \(deletionInFlightRef\.current \|\| !stateReady\) return[\s\S]*?deletionInFlightRef\.current = `\$\{galleryId\}:\$\{imageId\}`[\s\S]*?if \(saved\) preservePreviewLocation\(galleryId\)/,
  'deleting a built-in gallery image must preserve the page and prevent duplicate deletes',
)

console.log('editor state synchronization regression checks passed')
