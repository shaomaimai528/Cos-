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

// 顶部导航栏元素（Logo、品牌文字、导航链接）是全站公用的，编辑后全站同步。
export function isGlobalNavSelector(selector: string) {
  return /data-editor-(image-key|text-key)=”nav-(logo|brand-title|link)”/.test(selector) || selector.includes('nav-brand')
}

export function editorOverrideAppliesToPage(override: EditorOverride, page: string) {
  if (!override.page || override.page === page) return true
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
