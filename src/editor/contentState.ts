import { useEffect, useState } from 'react'
import type { EditorState } from './types'

type StateCacheValue = EditorState | null

const stateCache = new Map<string, StateCacheValue>()
const stateRequests = new Map<string, Promise<StateCacheValue>>()
const stateCacheTimes = new Map<string, number>()
const stateStoragePrefix = 'clean-site-editor-state:'
const stateRefreshWindowMs = 30_000
// A preview iframe can receive the authoritative state from the parent while
// its initial no-store request is still in flight. Keep the late response
// from putting that older snapshot back into the shared cache.
const stateCacheGenerations = new Map<string, number>()

function cacheKey(preview: boolean) {
  return preview ? 'preview' : 'published'
}

function isEditorState(value: unknown): value is EditorState {
  return Boolean(
    value
      && typeof value === 'object'
      && 'overrides' in value
      && 'insertions' in value
      && Array.isArray((value as EditorState).insertions),
  )
}

function hydratePublishedCache() {
  const key = cacheKey(false)
  if (stateCache.has(key) || typeof window === 'undefined') return
  try {
    const stored = window.localStorage.getItem(stateStoragePrefix + key)
    if (!stored) return
    const parsed = JSON.parse(stored) as unknown
    if (isEditorState(parsed)) {
      stateCache.set(key, parsed)
      // A persisted snapshot is immediately usable, but should still be
      // revalidated in the background after the first paint.
      stateCacheTimes.set(key, 0)
    }
  } catch {
    // Storage can be disabled or contain a stale/corrupt snapshot.
  }
}

function shouldUseEditorApi() {
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

async function requestState(url: string, cache: RequestCache = 'default') {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { cache, signal: controller.signal })
    if (!response.ok) return null
    const state = await response.json() as EditorState
    if (!isEditorState(state)) return null
    return state
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

export function getCachedEditorState(preview: boolean) {
  const key = cacheKey(preview)
  hydratePublishedCache()
  return stateCache.has(key) ? stateCache.get(key) ?? null : undefined
}

export function cacheEditorState(preview: boolean, state: EditorState) {
  const key = cacheKey(preview)
  stateCacheGenerations.set(key, (stateCacheGenerations.get(key) ?? 0) + 1)
  stateCache.set(key, state)
  stateCacheTimes.set(key, Date.now())
  if (!preview && typeof window !== 'undefined') {
    try { window.localStorage.setItem(stateStoragePrefix + key, JSON.stringify(state)) } catch { /* best effort */ }
  }
}

export function loadEditorState(preview: boolean) {
  const key = cacheKey(preview)
  hydratePublishedCache()
  if (stateCache.has(key) && Date.now() - (stateCacheTimes.get(key) ?? 0) < stateRefreshWindowMs) {
    return Promise.resolve(stateCache.get(key) ?? null)
  }

  const pending = stateRequests.get(key)
  if (pending) return pending

  const requestGeneration = stateCacheGenerations.get(key) ?? 0
  const cacheIfCurrent = (state: EditorState | null) => {
    if (stateCacheGenerations.get(key) !== requestGeneration) return false
    stateCache.set(key, state)
    stateCacheTimes.set(key, Date.now())
    if (state && !preview && typeof window !== 'undefined') {
      try { window.localStorage.setItem(stateStoragePrefix + key, JSON.stringify(state)) } catch { /* best effort */ }
    }
    return true
  }

  const request = (async () => {
    // Local preview must reflect the state currently shown in the editor. The
    // published site has no editor API, so it reads the exact snapshot copied
    // into public/editor-content.json during build/publish.
    const localEditorApi = preview || shouldUseEditorApi()
    const stateUrl = localEditorApi
      ? `/api/editor/state?ts=${Date.now()}`
      : '/editor-content.json'
    const state = await requestState(stateUrl, localEditorApi ? 'no-store' : 'default')
    if (state) {
      if (cacheIfCurrent(state)) return state
      // A newer parent message may have advanced the generation while the
      // request was in flight. Keep that newer state; if it was not cached
      // yet, the valid response is still better than falling back to defaults.
      return getCachedEditorState(preview) ?? state
    }
    // The preview can still use the published file when the local editor API is restarting.
    if (preview || shouldUseEditorApi()) {
      const published = await requestState('/editor-content.json')
      if (published && cacheIfCurrent(published)) {
        return published
      }
    }
    cacheIfCurrent(null)
    return null
  })()

  stateRequests.set(key, request)
  void request.finally(() => stateRequests.delete(key))
  return request
}

export function useEditorContentState() {
  const editorPreview = new URLSearchParams(window.location.search).get('editorPreview') === '1'
  const [state, setState] = useState<EditorState | null>(() => getCachedEditorState(editorPreview) ?? null)

  useEffect(() => {
    let active = true
    let parentStateReceived = false
    const onMessage = (event: MessageEvent) => {
      if (!active || event.data?.type !== 'editor:state' || !event.data.state) return
      const next = event.data.state as EditorState
      parentStateReceived = true
      cacheEditorState(editorPreview, next)
      setState(next)
    }
    window.addEventListener('message', onMessage)
    void loadEditorState(editorPreview).then((next) => {
      if (active && !parentStateReceived && next) setState(next)
    })
    return () => {
      active = false
      window.removeEventListener('message', onMessage)
    }
  }, [editorPreview])

  return { state, editorPreview, ready: state !== null }
}
