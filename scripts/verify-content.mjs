import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const publicDir = path.join(root, 'public')
const statePath = path.join(publicDir, 'editor-content.json')

const state = JSON.parse(await readFile(statePath, 'utf8'))
const insertionIds = new Set()
const sectionIds = new Set()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function assertPublicAsset(src, owner) {
  if (!src || !src.startsWith('/')) return
  const target = path.resolve(publicDir, src.slice(1))
  assert(target.startsWith(publicDir + path.sep), `${owner} points outside public/: ${src}`)
  try {
    await access(target)
  } catch {
    throw new Error(`${owner} points to a missing asset: ${src}`)
  }
}

assert(state && typeof state === 'object', 'editor-content.json must contain an object')
assert(Number.isInteger(state.version), 'editor-content.json is missing an integer version')
assert(Array.isArray(state.insertions), 'insertions must be an array')
assert(Array.isArray(state.gallerySections), 'gallerySections must be an array')

for (const section of state.gallerySections) {
  assert(section?.id && !sectionIds.has(section.id), `duplicate gallery section id: ${section?.id || '(empty)'}`)
  sectionIds.add(section.id)
}

for (const insertion of state.insertions) {
  assert(insertion?.id && !insertionIds.has(insertion.id), `duplicate insertion id: ${insertion?.id || '(empty)'}`)
  insertionIds.add(insertion.id)
  await assertPublicAsset(insertion.src, `insertion ${insertion.id}`)
  await assertPublicAsset(insertion.srcMobile, `insertion ${insertion.id} mobile source`)
  await assertPublicAsset(insertion.srcDesktop, `insertion ${insertion.id} desktop source`)
}

for (const [key, override] of Object.entries(state.overrides || {})) {
  await assertPublicAsset(override?.src, `override ${key}`)
  await assertPublicAsset(override?.srcMobile, `override ${key} mobile source`)
  await assertPublicAsset(override?.srcDesktop, `override ${key} desktop source`)
}

console.log(`Content check passed: ${state.gallerySections.length} sections, ${state.insertions.length} insertions, ${Object.keys(state.overrides || {}).length} overrides.`)
