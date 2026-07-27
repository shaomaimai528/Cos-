import { useEffect, useMemo, useState } from 'react'
import { imageConfig, isPlaceholderImage } from './config'
import type { GalleryImage } from './components/SimpleImageLightbox'
import type { EditorGallerySection, EditorState } from './editor/types'

const toImages = (prefix: string, sources: string[], portrait = false): GalleryImage[] => sources.map((src, index) => ({
  id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
  src,
  alt: '',
  portrait,
  placeholder: isPlaceholderImage(src),
}))

export const defaultGallerySections: EditorGallerySection[] = [
  { id: 'composite', label: '大合成' },
  { id: 'semi', label: '半合成' },
  { id: 'retouch', label: '人像精修', portrait: true },
  { id: 'restoration', label: '立绘还原' },
]

const defaultSectionImages: Record<string, GalleryImage[]> = {
  composite: toImages('composite', imageConfig.works.composite),
  semi: toImages('semi', imageConfig.works.semiFinished.slice(0, 10)),
  retouch: Array.from({ length: 10 }, (_, index) => ({
    id: `retouch-${String(index + 1).padStart(2, '0')}`,
    src: '/placeholders/black.svg',
    alt: '',
    portrait: true,
    placeholder: isPlaceholderImage('/placeholders/black.svg'),
  })),
  restoration: toImages('restoration', imageConfig.works.semiFinished.slice(10, 20)),
}

export const gallerySections = defaultGallerySections.map((section) => ({
  ...section,
  images: defaultSectionImages[section.id] ?? [],
}))

function insertionSectionId(parentSelector: string) {
  return parentSelector.match(/data-editor-gallery-id="([a-zA-Z0-9_-]+)"/)?.[1] ?? null
}

function storedGalleryLabel(state: EditorState | null, section: EditorGallerySection) {
  const legacyOverride = Object.values(state?.overrides ?? {}).find((override) => (
    override.page === '/works'
      && override.kind === 'text'
      && override.selector === `[data-editor-text-key="gallery-${section.id}-heading"]`
      && override.value?.trim()
  ))
  return legacyOverride?.value?.trim() || section.label
}

export function resolveGallerySections(state: EditorState | null) {
  const definitions = state?.gallerySections?.length ? state.gallerySections : defaultGallerySections
  return definitions.map((section) => ({ ...section, label: storedGalleryLabel(state, section) }))
}

function buildGallerySections(state: EditorState | null, showPlaceholders: boolean) {
  const definitions = resolveGallerySections(state)
  return definitions.map((section) => {
    const insertedImages = (state?.insertions ?? [])
      .filter((item) => item.kind === 'image' && insertionSectionId(item.parentSelector) === section.id)
      .map((item) => ({
        id: item.id,
        insertionId: item.id,
        src: item.src || '/placeholders/black.svg',
        alt: item.alt || '',
        portrait: item.styles?.['aspect-ratio'] === '3 / 4' || section.portrait,
        placeholder: isPlaceholderImage(item.src),
      }))
    const images = [...(defaultSectionImages[section.id] ?? []), ...insertedImages]
    return {
      ...section,
      images: showPlaceholders ? images : images.filter((image) => !image.placeholder),
    }
  })
}

let galleryStateSnapshot: EditorState | null = null
const galleryStateListeners = new Set<(state: EditorState) => void>()

function publishGalleryState(state: EditorState) {
  galleryStateSnapshot = state
  galleryStateListeners.forEach((listener) => listener(state))
}

export function useGallerySections() {
  const [state, setState] = useState<EditorState | null>(galleryStateSnapshot)
  const editorPreview = new URLSearchParams(window.location.search).get('editorPreview') === '1'

  useEffect(() => {
    let active = true
    const onMessage = (event: MessageEvent) => {
      if (active && event.data?.type === 'editor:state' && event.data.state) publishGalleryState(event.data.state as EditorState)
    }
    window.addEventListener('message', onMessage)
    galleryStateListeners.add(setState)
    const endpoint = editorPreview ? `/api/editor/state?ts=${Date.now()}` : `/editor-content.json?ts=${Date.now()}`
    fetch(endpoint, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<EditorState> : null)
      .then((next) => { if (active && next) publishGalleryState(next) })
      .catch(() => undefined)
    return () => {
      active = false
      window.removeEventListener('message', onMessage)
      galleryStateListeners.delete(setState)
    }
  }, [])

  return useMemo(() => buildGallerySections(state, editorPreview), [editorPreview, state])
}
