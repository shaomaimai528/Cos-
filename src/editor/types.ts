export type EditorElementKind = 'text' | 'image' | 'video' | 'audio' | 'element'

export type EditorStyles = Record<string, string>

export type EditorOverride = {
  selector: string
  page: string
  kind: EditorElementKind
  value?: string
  src?: string
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

export function editorOverrideAppliesToPage(override: EditorOverride, page: string) {
  if (!override.page || override.page === page) return true
  return page === '/#contact' && override.page === '/' && override.selector.includes('data-editor-text-key="contact-')
}

export const defaultEditorState: EditorState = {
  version: 1,
  overrides: {},
  insertions: [],
  pages: [],
}
