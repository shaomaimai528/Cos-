export type EditorElementKind = 'text' | 'image' | 'video' | 'audio' | 'element'

export type EditorStyles = Record<string, string>

export type EditorOverride = {
  selector: string
  page: string
  kind: EditorElementKind
  value?: string
  src?: string
  srcMobile?: string
  srcDesktop?: string
  alt?: string
  hidden?: boolean
  styles?: EditorStyles
  parentStyles?: EditorStyles
}

export type EditorInsertion = {
  id: string
  page: string
  parentSelector: string
  insertPosition?: 'start' | 'end'
  kind: 'text' | 'image'
  value?: string
  src?: string
  srcMobile?: string
  srcDesktop?: string
  alt?: string
  styles?: EditorStyles
}

export type EditorPageDefinition = {
  path: string
  label: string
}

export type EditorState = {
  version: number
  overrides: Record<string, EditorOverride>
  insertions: EditorInsertion[]
  pages: EditorPageDefinition[]
}

export type EditorSelection = {
  selector: string
  parentSelector: string
  containerSelector?: string
  galleryId?: string
  page: string
  kind: EditorElementKind
  text: string
  src: string
  alt: string
  tag: string
  insertionId?: string
}

export function editorOverrideKey(page: string, selector: string) {
  return `${page}::${selector}`
}

// 画廊/例图类图片的 key（composite-01、semi-03、retouch-02、restoration-05 等）。
// 这些图片在“例图展示页 / 首页画廊 / 首页作品轮播”共用同一底图，任意页面上传后需要全站同步。
export function isGalleryImageSelector(selector: string) {
  return /data-editor-image-key="(composite|semi|retouch|restoration)-\d+"/.test(selector)
}

export function editorOverrideAppliesToPage(override: EditorOverride, page: string) {
  if (!override.page || override.page === page) return true
  // 例图图片在多个页面共用，任意页面上传后全站同步
  if (override.kind === 'image' && isGalleryImageSelector(override.selector)) return true
  return page === '/#contact' && override.page === '/' && override.selector.includes('data-editor-text-key="contact-')
}

export const defaultEditorState: EditorState = {
  version: 1,
  overrides: {},
  insertions: [],
  pages: [],
}
