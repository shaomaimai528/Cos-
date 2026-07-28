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

export type EditorGallerySection = {
  id: string
  label: string
  portrait?: boolean
}

export type EditorContactButton = {
  id: string
  label: string
  value: string
  kind?: 'qq' | 'link'
}

export type EditorContactCard = {
  id: string
  label: string
  value: string
}

export const defaultContactCards: EditorContactCard[] = [
  { id: 'contact-card-personal', label: '个人 QQ/WX', value: '' },
  { id: 'contact-card-group', label: 'QQ群', value: '' },
  { id: 'contact-card-douyin', label: '抖音', value: '' },
]

export type EditorPricingOffer = {
  id: string
  label: string
  title: string
  copy: string
}

export type EditorState = {
  version: number
  overrides: Record<string, EditorOverride>
  insertions: EditorInsertion[]
  pages: EditorPageDefinition[]
  gallerySections?: EditorGallerySection[]
  galleryImageOrder?: Record<string, string[]>
  galleryHiddenImageIds?: string[]
  contactCards?: EditorContactCard[]
  contactButtons?: EditorContactButton[]
  pricingOffers?: EditorPricingOffer[]
}

export type EditorSelection = {
  selector: string
  parentSelector: string
  containerSelector?: string
  galleryId?: string
  galleryImageId?: string
  page: string
  kind: EditorElementKind
  text: string
  src: string
  alt: string
  tag: string
  insertionId?: string
}

export function isExternalContactUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export function editorOverrideKey(page: string, selector: string) {
  return `${page}::${selector}`
}

export function getEditorOverride(state: EditorState, selector: string, page: string) {
  const exact = state.overrides[editorOverrideKey(page, selector)]
  if (exact) return exact

  const aliasPage = page === '/works' ? '/#works'
    : page === '/pricing' ? '/#pricing'
      : page === '/#works' ? '/works'
        : page === '/#pricing' ? '/pricing'
          : null
  if (aliasPage) {
    const alias = state.overrides[editorOverrideKey(aliasPage, selector)]
    if (alias) return alias
  }

  const legacy = state.overrides[selector]
  return legacy && editorOverrideAppliesToPage(legacy, page) ? legacy : undefined
}

// 顶部导航栏元素（Logo、品牌文字、导航链接）是全站公用的，编辑后全站同步。
export function isGlobalNavSelector(selector: string) {
  return /data-editor-(image-key|text-key)=”nav-(logo|brand-title|link)”/.test(selector) || selector.includes('nav-brand')
}

export function editorOverrideAppliesToPage(override: EditorOverride, page: string) {
  if (!override.page || override.page === page) return true
  if ((override.page === '/#works' && page === '/works') || (override.page === '/works' && page === '/#works')) return true
  if ((override.page === '/#pricing' && page === '/pricing') || (override.page === '/pricing' && page === '/#pricing')) return true
  // 导航栏是全站通用组件，任意页面修改后全站生效
  if (isGlobalNavSelector(override.selector)) return true
  return page === '/#contact' && override.page === '/' && override.selector.includes('data-editor-text-key=”contact-')
}

export const defaultEditorState: EditorState = {
  version: 1,
  overrides: {},
  insertions: [],
  pages: [],
}
