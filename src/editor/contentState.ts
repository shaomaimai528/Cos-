import { useEffect, useState } from 'react'
import type { EditorState } from './types'

type StateCacheValue = EditorState | null

const stateCache = new Map<string, StateCacheValue>()
const stateRequests = new Map<string, Promise<StateCacheValue>>()

function cacheKey(preview: boolean) {
  return preview ? 'preview' : 'published'
}

async function requestState(url: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) return null
    const state = await response.json() as EditorState
    if (!state || typeof state !== 'object' || !state.overrides || !Array.isArray(state.insertions)) return null
    return state
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

export function getCachedEditorState(preview: boolean) {
  const key = cacheKey(preview)
  return stateCache.has(key) ? stateCache.get(key) ?? null : undefined
}

export function cacheEditorState(preview: boolean, state: EditorState) {
  stateCache.set(cacheKey(preview), state)
}

export function loadEditorState(preview: boolean) {
  const key = cacheKey(preview)
  if (stateCache.has(key)) return Promise.resolve(stateCache.get(key) ?? null)

  const pending = stateRequests.get(key)
  if (pending) return pending

  const request = (async () => {
    const state = await requestState(preview ? `/api/editor/state?ts=${Date.now()}` : `/editor-content.json?ts=${Date.now()}`)
    if (state) {
      stateCache.set(key, state)
      return state
    }
    // The preview can still use the published file when the local editor API is restarting.
    if (preview) {
      const published = await requestState(`/editor-content.json?ts=${Date.now()}`)
      if (published) {
        stateCache.set(key, published)
        return published
      }
    }
    stateCache.set(key, null)
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
    const onMessage = (event: MessageEvent) => {
      if (!active || event.data?.type !== 'editor:state' || !event.data.state) return
      const next = event.data.state as EditorState
      cacheEditorState(editorPreview, next)
      setState(next)
    }
    window.addEventListener('message', onMessage)
    void loadEditorState(editorPreview).then((next) => {
      if (active && next) setState(next)
    })
    return () => {
      active = false
      window.removeEventListener('message', onMessage)
    }
  }, [editorPreview])

  return { state, editorPreview, ready: state !== null }
}
