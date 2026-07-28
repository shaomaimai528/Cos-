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

function buildGallerySections(state: EditorState | null, showPlaceholders: boolean, mobileViewport: boolean) {
  const definitions = resolveGallerySections(state)
  const sections = definitions.map((section) => {
    const insertedImages = (state?.insertions ?? [])
      .filter((item) => item.kind === 'image' && insertionSectionId(item.parentSelector) === section.id)
      .map((item) => {
        const src = (mobileViewport && item.srcMobile ? item.srcMobile : item.src) || '/placeholders/black.svg'
        return ({
        id: item.id,
        insertionId: item.id,
        src,
        alt: item.alt || '',
        portrait: item.styles?.['aspect-ratio'] === '3 / 4' || section.portrait,
        placeholder: isPlaceholderImage(src),
      })
      })
    const images = [...(defaultSectionImages[section.id] ?? []), ...insertedImages]
    return {
      ...section,
      images: showPlaceholders ? images : images.filter((image) => !image.placeholder),
    }
  })
  return sections.filter((section) => showPlaceholders || section.images.length > 0)
}

let galleryStateSnapshot: EditorState | null = null
const galleryStateListeners = new Set<(state: EditorState) => void>()
const galleryStateRequests = new Map<string, Promise<EditorState | null>>()

function publishGalleryState(state: EditorState) {
  galleryStateSnapshot = state
  galleryStateListeners.forEach((listener) => listener(state))
}

function loadGalleryState(editorPreview: boolean) {
  const cacheKey = editorPreview ? 'preview' : 'published'
  const existing = galleryStateRequests.get(cacheKey)
  if (existing) return existing

  const endpoint = editorPreview ? `/api/editor/state?ts=${Date.now()}` : `/editor-content.json?ts=${Date.now()}`
  const request = fetch(endpoint, { cache: 'no-store' })
    .then((response) => response.ok ? response.json() as Promise<EditorState> : null)
    .catch(() => null)

  galleryStateRequests.set(cacheKey, request)
  void request.then((state) => {
    if (state) publishGalleryState(state)
    else galleryStateRequests.delete(cacheKey)
  })
  return request
}

export function useEditorContentState() {
  const [state, setState] = useState<EditorState | null>(galleryStateSnapshot)
  const editorPreview = new URLSearchParams(window.location.search).get('editorPreview') === '1'

  useEffect(() => {
    let active = true
    const onMessage = (event: MessageEvent) => {
      if (active && event.data?.type === 'editor:state' && event.data.state) publishGalleryState(event.data.state as EditorState)
    }
    window.addEventListener('message', onMessage)
    galleryStateListeners.add(setState)
    void loadGalleryState(editorPreview)
    return () => {
      active = false
      window.removeEventListener('message', onMessage)
      galleryStateListeners.delete(setState)
    }
  }, [editorPreview])

  return { state, editorPreview }
}

export function useGallerySections() {
  const { state, editorPreview } = useEditorContentState()
  const [mobileViewport, setMobileViewport] = useState(() => window.matchMedia('(max-width: 760px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setMobileViewport(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return useMemo(() => buildGallerySections(state, editorPreview, mobileViewport), [editorPreview, mobileViewport, state])
}
