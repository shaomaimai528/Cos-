import { useEffect, useMemo, useState } from 'react'
import { imageConfig, isPlaceholderImage } from './config'
import type { GalleryImage } from './components/SimpleImageLightbox'
import type { EditorGallerySection, EditorState } from './editor/types'
import { useEditorContentState } from './editor/contentState'
import { subscribeToMediaQuery } from './browserSupport'

export { useEditorContentState } from './editor/contentState'

export function normalizeGalleryAspectRatio(value: string | undefined) {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  return `${width} / ${height}`
}

export function normalizeGalleryColumns(value: number | undefined) {
  const columns = Number(value)
  if (!Number.isFinite(columns)) return 3
  return Math.min(6, Math.max(1, Math.round(columns)))
}

function isPortraitAspectRatio(value: string | undefined) {
  const normalized = normalizeGalleryAspectRatio(value)
  if (!normalized) return false
  const [width, height] = normalized.split('/').map(Number)
  return width < height
}

const toImages = (prefix: string, sources: string[], portrait = false): GalleryImage[] => sources.map((src, index) => ({
  id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
  galleryId: prefix,
  src,
  alt: '',
  portrait,
  aspectRatio: portrait ? '3 / 4' : undefined,
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
    galleryId: 'retouch',
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

function isPublishedGalleryInsertion(item: { page: string; kind: string }) {
  return item.kind === 'image' && (item.page === '/works' || item.page === '/#works')
}

function orderedImages(images: GalleryImage[], order: string[] | undefined) {
  if (!order?.length) return images
  const byId = new Map(images.map((image) => [image.id, image]))
  const ordered = order.flatMap((id) => {
    const image = byId.get(id)
    if (!image) return []
    byId.delete(id)
    return [image]
  })
  return [...ordered, ...byId.values()]
}

function insertionImageAspectRatio(item: { styles?: Record<string, string> }, sectionAspectRatio: string) {
  const savedRatio = normalizeGalleryAspectRatio(item.styles?.['aspect-ratio'] || item.styles?.aspectRatio)
  return savedRatio && isPortraitAspectRatio(savedRatio) ? savedRatio : sectionAspectRatio
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
  const definitions = Array.isArray(state?.gallerySections) ? state.gallerySections : state ? [] : defaultGallerySections
  return definitions.map((section) => {
    const aspectRatio = normalizeGalleryAspectRatio(section.aspectRatio) || (section.portrait ? '3 / 4' : '16 / 9')
    return {
      ...section,
      label: storedGalleryLabel(state, section),
      aspectRatio,
      columns: normalizeGalleryColumns(section.columns),
      portrait: isPortraitAspectRatio(aspectRatio),
    }
  })
}

function buildGallerySections(state: EditorState | null, showPlaceholders: boolean, mobileViewport: boolean) {
  if (!state) return []
  const definitions = resolveGallerySections(state)
  const sections = definitions.map((section) => {
    const sectionAspectRatio = section.aspectRatio || '16 / 9'
    const insertedImages = (state?.insertions ?? [])
      .filter((item) => isPublishedGalleryInsertion(item) && insertionSectionId(item.parentSelector) === section.id)
      .map((item) => {
        const src = (mobileViewport && item.srcMobile ? item.srcMobile : item.src) || '/placeholders/black.svg'
        const imageAspectRatio = insertionImageAspectRatio(item, sectionAspectRatio)
        return ({
        id: item.id,
        galleryId: section.id,
        insertionId: item.id,
        src,
        alt: item.alt || '',
        aspectRatio: imageAspectRatio,
        portrait: isPortraitAspectRatio(imageAspectRatio),
        placeholder: isPlaceholderImage(src),
      })
      })
    const hiddenIds = new Set(state?.galleryHiddenImageIds ?? [])
    const images = orderedImages(
      insertedImages
        .filter((image) => !hiddenIds.has(image.id)),
      state?.galleryImageOrder?.[section.id],
    )
    return {
      ...section,
      images: showPlaceholders ? images : images.filter((image) => !image.placeholder),
    }
  })
  return sections.filter((section) => showPlaceholders || section.images.length > 0)
}

export function useGallerySections() {
  const { state, editorPreview } = useEditorContentState()
  const [mobileViewport, setMobileViewport] = useState(() => window.matchMedia('(max-width: 760px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setMobileViewport(media.matches)
    update()
    return subscribeToMediaQuery(media, update)
  }, [])

  return useMemo(() => buildGallerySections(state, editorPreview, mobileViewport), [editorPreview, mobileViewport, state])
}
