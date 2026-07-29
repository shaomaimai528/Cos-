import { Archive, ArrowDown, ArrowUp, Eye, EyeOff, Github, ImagePlus, Monitor, Music, Play, Plus, Save, Send, Settings, Smartphone, Trash2, Upload, Video } from 'lucide-react'
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { defaultContactCards, defaultEditorState, editorOverrideAppliesToPage, editorOverrideKey, EditorContactButton, EditorContactCard, EditorGallerySection, EditorOverride, EditorSelection, EditorState, getEditorOverride, isExternalContactUrl } from './types'
import { defaultGallerySections, gallerySections, normalizeGalleryAspectRatio, resolveGallerySections } from '../galleryData'
import { resolvePricingOffers } from '../pricingData'
import './editor.css'

type EditorPageItem = {
  path: string
  hash?: string
  label: string
  description?: string
  children?: EditorPageItem[]
}

const pages: EditorPageItem[] = [
  {
    path: '/',
    label: '例图画廊',
    description: '网站第一个窗口',
    children: [{ path: '/works', label: '完整例图', description: '画廊展开内容' }],
  },
  { path: '/', hash: '#pricing', label: '价格与活动', description: '网站第二个窗口' },
  { path: '/', hash: '#contact', label: '联系方式', description: '网站第三个窗口' },
]

function pageKey(item: Pick<EditorPageItem, 'path' | 'hash'>) {
  return `${item.path}${item.hash ?? ''}`
}

function findPageLabel(path: string, hash: string) {
  const key = `${path}${hash}`
  if (key === '/#works') return '例图画廊'
  const visit = (items: EditorPageItem[]): string | undefined => {
    for (const item of items) {
      if (pageKey(item) === key) return item.label
      const childLabel = item.children ? visit(item.children) : undefined
      if (childLabel) return childLabel
    }
    return undefined
  }
  return visit(pages)
}

const styleFields = [
  ['color', '文字颜色'], ['background-color', '背景颜色'], ['font-size', '字号'], ['font-weight', '字重'],
  ['line-height', '行高'], ['letter-spacing', '字间距'], ['width', '宽度'], ['height', '高度'],
  ['padding', '内边距'], ['margin', '外边距'], ['border-radius', '圆角'], ['opacity', '透明度'],
  ['position', '定位方式'], ['top', '上下位置'], ['left', '左右位置'], ['transform', '移动/旋转'], ['z-index', '层级'],
] as const

const galleryAspectOptions = [
  ['16 / 9', '16:9'], ['21 / 9', '21:9'], ['4 / 3', '4:3'], ['1 / 1', '1:1'], ['3 / 4', '3:4'], ['2 / 3', '2:3'],
] as const

function GalleryRatioControl({ section, onChange }: { section: EditorGallerySection; onChange: (value: string) => void }) {
  const current = section.aspectRatio || '16 / 9'
  return (
    <div className="editor-gallery-ratio-control">
      <select aria-label={`图片比例：${section.label}`} value={current} onChange={(event) => onChange(event.currentTarget.value)}>
        {!galleryAspectOptions.some(([value]) => value === current) ? <option value={current}>{current}</option> : null}
        {galleryAspectOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
      <input aria-label={`自定义图片比例：${section.label}`} defaultValue={current} placeholder="5 / 4" onBlur={(event) => { if (event.currentTarget.value.trim()) onChange(event.currentTarget.value) }} />
    </div>
  )
}

function GalleryColumnWidthControl({ section, onChange }: { section: EditorGallerySection; onChange: (value: number) => void }) {
  const current = section.columnWidth ?? 1
  return (
    <label className="editor-gallery-width-control">
      <span>列宽</span>
      <input
        aria-label={`画廊列宽：${section.label}`}
        type="number"
        min="0.5"
        max="3"
        step="0.1"
        defaultValue={current}
        onBlur={(event) => {
          const value = Number(event.currentTarget.value)
          if (Number.isFinite(value)) onChange(value)
        }}
      />
    </label>
  )
}

type SettingsState = { githubRepo: string; branch: string; vercelSiteUrl: string }
type AuthStatus = { github: { loggedIn: boolean; account: string; connected: boolean }; vercel: { connected: boolean; url: string } }
type PublishStatus = { status?: string; message?: string; commit?: string; deployedCommit?: string; url?: string; detail?: string }
type PublishProgress = { running: boolean; stage: string; currentStep: number; totalSteps: number; message: string; detail?: string; errorStep?: number; updatedAt?: number }
type PublishResult = { output?: string; path?: string; settings?: SettingsState; github?: PublishStatus; vercel?: PublishStatus; progress?: PublishProgress }
type SaveStateOptions = { optimistic?: boolean; rollbackState?: EditorState }
const emptySettings: SettingsState = { githubRepo: '', branch: 'main', vercelSiteUrl: '' }
const emptyAuth: AuthStatus = { github: { loggedIn: false, account: '', connected: false }, vercel: { connected: false, url: '' } }
const emptyPublishProgress: PublishProgress = { running: false, stage: 'idle', currentStep: 0, totalSteps: 5, message: '等待发布' }

type ApiFailure = Error & { details?: { output?: string; github?: PublishStatus; vercel?: PublishStatus; progress?: PublishProgress } }

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

// 不同接口耗时差异极大：发布/检查/备份要跑构建和 git 推送，可能几分钟；读写状态是毫秒级。
// 统一 10 秒超时会把慢操作误判成“连不上服务”，这里按接口给足超时。
function timeoutForUrl(url: string): number {
  if (url.includes('/publish') || url.includes('/build') || url.includes('/backup')) return 600000 // 10 分钟
  if (url.includes('/upload')) return 120000 // 上传大文件 2 分钟
  if (url.includes('/login-github') || url.includes('/open-vercel')) return 30000
  return 15000
}

async function api<T>(url: string, options?: RequestInit, retry = 0): Promise<T> {
  const method = String(options?.method || 'GET').toUpperCase()
  let response: Response
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), timeoutForUrl(url))
    response = await fetch(url, { ...options, signal: controller.signal })
    window.clearTimeout(timeout)
  } catch (error) {
    const canRetry = retry < 1 && (method === 'GET' || url === '/api/editor/state' || url === '/api/editor/settings')
    if (canRetry) {
      await wait(350)
      return api<T>(url, options, retry + 1)
    }
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    const hint = aborted
      ? '这一步耗时较长（构建或上传），已超过等待上限。请确认后台管理器黑色窗口仍在运行、没有报错，然后重试；如果窗口已关闭，请重新双击"打开后台管理软件"。'
      : '通常是后台管理器黑色窗口被关闭或卡住了。解决方法：1）确认黑色命令行窗口还开着；2）如果关了就重新双击"打开后台管理软件"；3）都正常再点一次这个按钮。'
    throw new Error(`无法连接本地管理服务（${url}）。${hint}`, { cause: error })
  }
  const raw = await response.text()
  let data: T & { message?: string; output?: string }
  try {
    data = (raw ? JSON.parse(raw) : {}) as T & { message?: string; output?: string }
  } catch (error) {
    throw new Error(`本地管理服务返回了无法识别的内容（HTTP ${response.status}）。请重新打开后台管理器后重试。`, { cause: error })
  }
  if (!response.ok) {
    const error = Object.assign(new Error(data.message || data.output || '操作失败'), { details: data }) as ApiFailure
    throw error
  }
  return data
}

function cloneState(state: EditorState): EditorState {
  return JSON.parse(JSON.stringify(state)) as EditorState
}

function galleryDefinitions(state: EditorState) {
  return resolveGallerySections(state)
}

function galleryImageIds(state: EditorState, galleryId: string) {
  const defaults = gallerySections.find((section) => section.id === galleryId)?.images.map((image) => image.id) ?? []
  const inserted = state.insertions
    .filter((item) => item.kind === 'image' && item.parentSelector.includes(`data-editor-gallery-id="${galleryId}"`))
    .map((item) => item.id)
  const hidden = new Set(state.galleryHiddenImageIds ?? [])
  return [...defaults, ...inserted].filter((id, index, all) => !hidden.has(id) && all.indexOf(id) === index)
}

function normalizedGalleryImageOrder(state: EditorState, galleryId: string) {
  const ids = galleryImageIds(state, galleryId)
  const stored = state.galleryImageOrder?.[galleryId] ?? []
  return [...stored.filter((id) => ids.includes(id)), ...ids.filter((id) => !stored.includes(id))]
}

function contactButtonDefinitions(state: EditorState): EditorContactButton[] {
  return Array.isArray(state.contactButtons) ? state.contactButtons : []
}

function linkButtonDefinitions(state: EditorState): EditorContactButton[] {
  return contactButtonDefinitions(state).filter((button) => button.kind === 'link')
}

function contactButtonKind(button: EditorContactButton): 'qq' | 'wechat' | 'link' {
  if (button.kind === 'link') return 'link'
  if (button.kind === 'wechat') return 'wechat'
  return 'qq'
}

function wechatButtonDefinitions(state: EditorState): EditorContactButton[] {
  return contactButtonDefinitions(state).filter((button) => contactButtonKind(button) === 'wechat')
}

function contactCardDefinitions(state: EditorState): EditorContactCard[] {
  return Array.isArray(state.contactCards) ? state.contactCards : defaultContactCards
}

function contactCardTextSelector(index: number, field: 'label' | 'value') {
  return `[data-editor-text-key="contact-card-${index}-${field}"]`
}

function remapContactCardOverrides(state: EditorState, previousCards: EditorContactCard[], nextCards: EditorContactCard[]) {
  const previousOverrides = previousCards.map((_, index) => ({
    label: getEditorOverride(state, contactCardTextSelector(index, 'label'), '/#contact'),
    value: getEditorOverride(state, contactCardTextSelector(index, 'value'), '/#contact'),
  }))
  Object.keys(state.overrides).forEach((key) => {
    if (key.includes('contact-card-') && (key.includes('-label') || key.includes('-value'))) delete state.overrides[key]
  })
  nextCards.forEach((card, nextIndex) => {
    const previousIndex = previousCards.findIndex((item) => item.id === card.id)
    if (previousIndex < 0) return
    ;(['label', 'value'] as const).forEach((field) => {
      const override = previousOverrides[previousIndex][field]
      if (!override) return
      const selector = contactCardTextSelector(nextIndex, field)
      state.overrides[editorOverrideKey('/#contact', selector)] = { ...override, selector, page: '/#contact' }
    })
  })
}

type NoticeTone = 'info' | 'pending' | 'success' | 'error'
type QuickUploadKind = 'image' | 'video' | 'audio'

const quickUploadLabels: Record<QuickUploadKind, string> = {
  image: '背景图片',
  video: '背景视频',
  audio: 'BGM',
}

function previewHasQuickUpload(frame: HTMLIFrameElement | null, src: string, kind: QuickUploadKind) {
  const document = frame?.contentDocument
  if (!document) return false
  const expected = new URL(src, frame?.contentWindow?.location.href || window.location.href).href
  if (kind === 'image') {
    const background = document.querySelector<HTMLElement>('[data-editor-page-background-image]')
    const backgroundRoot = document.querySelector<HTMLElement>('[data-editor-page-background]')
    const backgroundStyle = background ? `${background.style.backgroundImage} ${getComputedStyle(background).backgroundImage}` : ''
    return Boolean(background && backgroundRoot && !background.hidden && !backgroundRoot.hidden && (backgroundStyle.includes(src) || backgroundStyle.includes(expected)))
  }
  const selector = kind === 'video' ? '[data-editor-page-background-video]' : 'audio[data-editor-page-audio]'
  const media = document.querySelector<HTMLMediaElement>(selector)
  return Boolean(media && (kind === 'audio' || !media.hidden) && (media.src === expected || media.getAttribute('src') === src))
}

function previewHasQuickUploadCleared(frame: HTMLIFrameElement | null, kind: QuickUploadKind) {
  const document = frame?.contentDocument
  if (!document) return false
  if (kind === 'image') {
    const background = document.querySelector<HTMLElement>('[data-editor-page-background-image]')
    return Boolean(background && background.hidden && !background.style.backgroundImage)
  }
  if (kind === 'video') {
    const background = document.querySelector<HTMLVideoElement>('[data-editor-page-background-video]')
    return Boolean(background && background.hidden && !background.getAttribute('src'))
  }
  return !document.querySelector('audio[data-editor-page-audio]')
}

async function waitForQuickUploadPreview(frame: HTMLIFrameElement | null, src: string, kind: QuickUploadKind) {
  const deadline = Date.now() + 3500
  while (Date.now() < deadline) {
    if (previewHasQuickUpload(frame, src, kind)) return true
    await new Promise((resolve) => window.setTimeout(resolve, 60))
  }
  return previewHasQuickUpload(frame, src, kind)
}

async function waitForQuickUploadClear(frame: HTMLIFrameElement | null, kind: QuickUploadKind) {
  const deadline = Date.now() + 1800
  while (Date.now() < deadline) {
    if (previewHasQuickUploadCleared(frame, kind)) return true
    await new Promise((resolve) => window.setTimeout(resolve, 60))
  }
  return previewHasQuickUploadCleared(frame, kind)
}

async function waitForPreviewElement(frame: HTMLIFrameElement | null, selector: string, timeoutMilliseconds = 3500) {
  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    if (frame?.contentDocument?.querySelector(selector)) return true
    await wait(80)
  }
  return Boolean(frame?.contentDocument?.querySelector(selector))
}

function contactValueSelector(selection: EditorSelection | null) {
  const match = selection?.selector.match(/\[data-editor-text-key="(contact-card-\d+)-(?:label|value)"\]/)
  return match ? `[data-editor-text-key="${match[1]}-value"]` : null
}

function isContactCardLabel(selection: EditorSelection | null) {
  return Boolean(selection?.selector.match(/\[data-editor-text-key="contact-card-\d+-label"\]/))
}

function savedOverride(state: EditorState, selection: EditorSelection) {
  const pageOverride = state.overrides[editorOverrideKey(selection.page, selection.selector)]
  const legacyOverride = state.overrides[selection.selector]
  return pageOverride ?? (legacyOverride && editorOverrideAppliesToPage(legacyOverride, selection.page) ? legacyOverride : undefined)
}

export function EditorPage() {
  const [state, setState] = useState<EditorState>(defaultEditorState)
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [form, setForm] = useState<EditorOverride | null>(null)
  const [page, setPage] = useState('/')
  const [hash, setHash] = useState('')
  const hashRef = useRef('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [mode, setMode] = useState<'edit' | 'browse'>('edit')
  const [settings, setSettings] = useState<SettingsState>(emptySettings)
  const [stateReady, setStateReady] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus>(emptyAuth)
  const [showSetup, setShowSetup] = useState(false)
  const [notice, setNotice] = useState('正在启动本地管理器…')
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('info')
  const [mediaNotice, setMediaNotice] = useState('请选择背景图片、背景视频或 BGM')
  const [mediaNoticeTone, setMediaNoticeTone] = useState<NoticeTone>('info')
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)
  const [publishProgress, setPublishProgress] = useState<PublishProgress>(emptyPublishProgress)
  const [dragOver, setDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ active: boolean; percent: number; name: string }>({ active: false, percent: 0, name: '' })
  const [batchProgress, setBatchProgress] = useState<{ active: boolean; done: number; total: number; canceled: boolean; currentName: string; currentPercent: number }>({ active: false, done: 0, total: 0, canceled: false, currentName: '', currentPercent: 0 })
  const [batchTargetId, setBatchTargetId] = useState<string | null>(null)
  const [invalidContactLinks, setInvalidContactLinks] = useState<Record<string, boolean>>({})
  const batchCancelRef = useRef(false)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  const pageRef = useRef(page)
  const previewLocationGuardRef = useRef<{ page: string; hash: string; until: number } | null>(null)
  const deletionInFlightRef = useRef<string | null>(null)
  const publishPollRef = useRef<number | null>(null)
  const addGalleryBusyRef = useRef(false)
  const addGalleryLastClickRef = useRef(0)
  const setFeedback = (message: string, tone: NoticeTone = 'info') => {
    setNotice(message)
    setNoticeTone(tone)
  }
  const setMediaFeedback = (message: string, tone: NoticeTone = 'info') => {
    setMediaNotice(message)
    setMediaNoticeTone(tone)
    setFeedback(message, tone)
  }

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    pageRef.current = page
  }, [page])

  const preservePreviewLocation = (galleryId?: string) => {
    const preserved = { page: pageRef.current, hash: hashRef.current }
    previewLocationGuardRef.current = { ...preserved, until: performance.now() + 2200 }
    hashRef.current = preserved.hash
    setPage(preserved.page)
    setHash(preserved.hash)
    if (galleryId) {
      setBatchTargetId(galleryId)
      const safeGalleryId = galleryId.replace(/[^a-zA-Z0-9_-]/g, '')
      window.setTimeout(() => {
        document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:highlight', selector: `[data-editor-gallery-id="${safeGalleryId}"]` }, window.location.origin)
      }, 80)
    }
  }

  const refreshPublishProgress = async () => {
    try {
      const result = await api<{ progress: PublishProgress }>('/api/editor/publish-status')
      setPublishProgress(result.progress)
      return result.progress
    } catch {
      return null
    }
  }

  const stopPublishPolling = () => {
    if (publishPollRef.current !== null) {
      window.clearInterval(publishPollRef.current)
      publishPollRef.current = null
    }
  }

  useEffect(() => {
    let active = true
    void Promise.all([
      api<EditorState>('/api/editor/state'),
      api<SettingsState>('/api/editor/settings'),
      api<AuthStatus>('/api/editor/auth-status'),
    ]).then(([content, savedSettings, auth]) => {
      const loadedState = { ...defaultEditorState, ...content, gallerySections: content.gallerySections?.length ? content.gallerySections : defaultGallerySections }
      stateRef.current = loadedState
      setState(loadedState)
      setSettings(savedSettings)
      setAuthStatus(auth)
      // Opening the local editor should stay focused on editing. The publish
      // center is opt-in from the top bar, even before first deployment.
      setShowSetup(false)
      setFeedback('管理器已连接，可以点击中间网页上的内容进行修改')
      if (active) setStateReady(true)
    }).catch((error) => setFeedback(error instanceof Error ? error.message : '无法连接本地服务', 'error'))
    return () => { active = false }
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const previewWindow = document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow
      if (event.origin !== window.location.origin || event.source !== previewWindow) return
      if (event.data?.type === 'editor:navigate' && typeof event.data.path === 'string') {
        const nextUrl = new URL(event.data.path, window.location.origin)
        const guard = previewLocationGuardRef.current
        if (guard && performance.now() < guard.until && (nextUrl.pathname !== guard.page || nextUrl.hash !== guard.hash)) return
        setPage(nextUrl.pathname)
        hashRef.current = nextUrl.hash
        setHash(nextUrl.hash)
        setSelection(null)
        setForm(null)
        return
      }
      if (event.data?.type === 'editor:add-gallery' && typeof event.data.galleryId === 'string') {
        void addGalleryWindow(event.data.galleryId)
        return
      }
      if (event.data?.type === 'editor:add-gallery-section') {
        void addGallerySection()
        return
      }
      if (event.data?.type === 'editor:delete-gallery-section' && typeof event.data.galleryId === 'string') {
        void deleteGallerySection(event.data.galleryId)
        return
      }
      if (event.data?.type === 'editor:delete-insertion' && typeof event.data.insertionId === 'string') {
        void deleteInsertionById(event.data.insertionId)
        return
      }
      if (event.data?.type === 'editor:delete-selection' && event.data.selection && typeof event.data.selection === 'object') {
        void deleteSelectedPreviewElement(event.data.selection as EditorSelection)
        return
      }
      if (
        event.data?.type === 'editor:delete-gallery-image'
        && typeof event.data.galleryId === 'string'
        && typeof event.data.imageId === 'string'
      ) {
        void deleteGalleryImageById(event.data.galleryId, event.data.imageId)
        return
      }
      if (
        event.data?.type === 'editor:reorder-gallery-image'
        && typeof event.data.galleryId === 'string'
        && typeof event.data.imageId === 'string'
        && typeof event.data.targetImageId === 'string'
        && (event.data.placement === 'before' || event.data.placement === 'after')
      ) {
        void reorderGalleryImage(event.data.galleryId, event.data.imageId, event.data.targetImageId, event.data.placement)
        return
      }
      if (
        event.data?.type === 'editor:reorder-insertion'
        && typeof event.data.insertionId === 'string'
        && typeof event.data.targetInsertionId === 'string'
        && (event.data.placement === 'before' || event.data.placement === 'after')
      ) {
        void reorderInsertion(event.data.insertionId, event.data.targetInsertionId, event.data.placement)
        return
      }
      if (
        event.data?.type === 'editor:update-gallery-column-layout'
        && event.data.widths && typeof event.data.widths === 'object'
      ) {
        void updateGalleryColumnLayout(event.data.widths as Record<string, number>)
        return
      }
      if (
        event.data?.type === 'editor:update-contact-button-layout'
        && typeof event.data.buttonId === 'string'
        && event.data.styles && typeof event.data.styles === 'object'
      ) {
        void updateContactButtonLayout(
          event.data.buttonId,
          event.data.styles as Record<string, string>,
          Array.isArray(event.data.orderedButtonIds)
            ? event.data.orderedButtonIds.filter((id: unknown): id is string => typeof id === 'string')
            : undefined,
        )
        return
      }
      if (event.data?.type === 'editor:drop-file') {
        // iframe 中用户拖放了文件到某个元素上，iframe 已经 select 了那个元素。
        // 使用暂存的 pendingDropFile（因为 File 对象无法跨 iframe postMessage）
        const pending = pendingDropFile.current
        if (pending) {
          pendingDropFile.current = null
          // 等 50ms 让 editor:select 先处理完
          window.setTimeout(() => triggerUploadForFile(pending), 50)
        }
        return
      }
      if (event.data?.type === 'editor:drop-gallery-file' && typeof event.data.galleryId === 'string') {
        const pending = pendingDropFile.current
        if (pending) {
          pendingDropFile.current = null
          window.setTimeout(() => { void addGalleryImageFromFile(pending, event.data.galleryId) }, 50)
        }
        return
      }
      if (event.data?.type !== 'editor:select') return
      const next = event.data.selection as EditorSelection
      const saved = savedOverride(state, next)
      setSelection(next)
      setForm({
        selector: next.selector,
        page: next.page,
        kind: next.kind,
        value: saved?.value ?? next.text,
        src: saved?.src ?? next.src,
        alt: saved?.alt ?? next.alt,
        hidden: saved?.hidden ?? false,
        styles: { ...(saved?.styles ?? {}) },
        parentStyles: { ...(saved?.parentStyles ?? {}) },
      })
      setNotice(next.kind === 'text' ? '已选中文字' : next.kind === 'element' ? '已选中模块' : `已选中${next.kind === 'image' ? '图片' : next.kind === 'video' ? '视频' : 'BGM'}`)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [state.overrides])

  const frameUrl = useMemo(() => `${page}?editorPreview=1&editorMode=${mode}${hash || hashRef.current}`, [page, hash, mode])
  const syncPreviewMode = () => {
    const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame')
    frame?.contentWindow?.postMessage({ type: 'editor:mode', mode }, window.location.origin)
    if (stateReady && state) {
      // The parent already has the authoritative editor state. Sending it as
      // soon as the iframe is ready avoids a second slow state round-trip.
      frame?.contentWindow?.postMessage({ type: 'editor:state', state }, window.location.origin)
    }
  }

  useEffect(() => {
    if (!stateReady || !state) return
    const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame')
    frame?.contentWindow?.postMessage({ type: 'editor:state', state }, window.location.origin)
  }, [frameUrl, state, stateReady])
  const updateForm = (patch: Partial<EditorOverride>) => setForm((current) => {
    if (!current) return current
    const nextForm = { ...current, ...patch }
    if (selection) {
      const draft = cloneState(state)
      draft.overrides[editorOverrideKey(selection.page, selection.selector)] = nextForm
      document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:state', state: draft }, window.location.origin)
    }
    return nextForm
  })

  const saveState = async (next: EditorState, message: string, options: SaveStateOptions = {}): Promise<boolean> => {
    if (!stateReady) {
      setFeedback('正在加载网站内容，请稍候再保存', 'pending')
      return false
    }
    const rollbackState = options.rollbackState ?? stateRef.current
    const optimistic = options.optimistic ?? Boolean(deletionInFlightRef.current)
    const postPreviewState = (previewState: EditorState) => {
      document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:state', state: previewState }, window.location.origin)
    }
    setBusy(true)
    if (optimistic) {
      stateRef.current = next
      setState(next)
      postPreviewState(next)
    }
    try {
      await api('/api/editor/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      if (!optimistic) {
        stateRef.current = next
        setState(next)
        postPreviewState(next)
      }
      setFeedback(message, 'success')
      return true
    } catch (error) {
      if (optimistic) {
        stateRef.current = rollbackState
        setState(rollbackState)
        postPreviewState(rollbackState)
      }
      setFeedback(error instanceof Error ? error.message : '保存失败', 'error')
      return false
    } finally {
      setBusy(false)
      if (deletionInFlightRef.current) deletionInFlightRef.current = null
    }
  }

  const saveSelection = async () => {
    if (!selection || !form) return
    const next = cloneState(state)
    next.overrides[editorOverrideKey(selection.page, selection.selector)] = { ...form, styles: Object.fromEntries(Object.entries(form.styles ?? {}).filter(([, value]) => value.trim())) }
    const galleryHeading = selection.selector.match(/data-editor-text-key="gallery-([a-zA-Z0-9_-]+)-heading"/)
    if (galleryHeading && form.value?.trim()) {
      next.gallerySections = galleryDefinitions(next).map((section) => section.id === galleryHeading[1] ? { ...section, label: form.value!.trim() } : section)
    }
    if (selection.insertionId && form.kind === 'image') {
      const insertion = next.insertions.find((item) => item.id === selection.insertionId)
      if (insertion) {
        insertion.src = form.src || '/placeholders/black.svg'
        insertion.srcMobile = form.srcMobile || undefined
        insertion.alt = form.alt || insertion.alt
        insertion.styles = { ...(insertion.styles ?? {}), ...(form.parentStyles ?? {}) }
      }
    }
    setFeedback('正在保存…', 'pending')
    const ok = await saveState(next, '✓ 修改已保存到网站，可继续编辑或点击"发布上线"')
    if (!ok) setFeedback('✕ 保存失败，请检查后台管理器是否仍在运行，然后重试', 'error')
  }

  const restoreSelection = async () => {
    if (!selection) return
    const next = cloneState(state)
    delete next.overrides[editorOverrideKey(selection.page, selection.selector)]
    if (next.overrides[selection.selector]?.page === selection.page) delete next.overrides[selection.selector]
    setForm(null)
    setSelection(null)
    await saveState(next, '已恢复该内容的原始状态')
    document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.location.reload()
  }

  const deleteInsertionById = async (insertionId: string) => {
    if (deletionInFlightRef.current) return
    const baseState = stateRef.current
    const next = cloneState(baseState)
    const insertion = next.insertions.find((item) => item.id === insertionId)
    if (!insertion) return
    if (!stateReady) return
    const galleryId = insertion.parentSelector.match(/data-editor-gallery-id="([a-zA-Z0-9_-]+)"/)?.[1]
    if (galleryId) preservePreviewLocation(galleryId)
    deletionInFlightRef.current = insertionId
    next.insertions = next.insertions.filter((item) => item.id !== insertionId)
    if (next.galleryImageOrder) {
      next.galleryImageOrder = Object.fromEntries(Object.entries(next.galleryImageOrder).map(([id, order]) => [id, order.filter((imageId) => imageId !== insertionId)]))
    }
    Object.keys(next.overrides).forEach((selector) => {
      if (selector.includes(`data-editor-insert-id=\"${insertionId}\"`)) delete next.overrides[selector]
    })
    if (selection?.insertionId === insertionId) {
      setSelection(null)
      setForm(null)
    }
    await saveState(next, '图片窗口已删除')
  }

  const deleteInsertion = async () => {
    if (!selection?.insertionId) return
    await deleteInsertionById(selection.insertionId)
    return
    /*
    await saveState(next, '新增窗口已删除')
    */
  }

  const deleteGalleryImageById = async (galleryId: string, imageId: string) => {
    const baseState = stateRef.current
    if (baseState.insertions.some((item) => item.id === imageId)) {
      await deleteInsertionById(imageId)
      return
    }
    if (!galleryImageIds(baseState, galleryId).includes(imageId)) return
    preservePreviewLocation(galleryId)
    const next = cloneState(baseState)
    next.galleryHiddenImageIds = Array.from(new Set([...(next.galleryHiddenImageIds ?? []), imageId]))
    next.galleryImageOrder = {
      ...(next.galleryImageOrder ?? {}),
      [galleryId]: (next.galleryImageOrder?.[galleryId] ?? []).filter((id) => id !== imageId),
    }
    Object.keys(next.overrides).forEach((key) => {
      if (key.includes(`data-editor-image-key="${imageId}"`) || key.includes(`data-editor-card-id="${imageId}"`)) delete next.overrides[key]
    })
    if (selection?.galleryId === galleryId && selection.galleryImageId === imageId) {
      setSelection(null)
      setForm(null)
    }
    await saveState(next, '画廊图片窗口已删除')
  }

  const reorderGalleryImage = async (galleryId: string, imageId: string, targetImageId: string, placement: 'before' | 'after') => {
    if (imageId === targetImageId) return
    const baseState = stateRef.current
    const currentOrder = normalizedGalleryImageOrder(baseState, galleryId)
    if (!currentOrder.includes(imageId) || !currentOrder.includes(targetImageId)) return
    const nextOrder = currentOrder.filter((id) => id !== imageId)
    const targetIndex = nextOrder.indexOf(targetImageId)
    if (targetIndex < 0) return
    nextOrder.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, imageId)
    const next = cloneState(baseState)
    next.galleryImageOrder = { ...(next.galleryImageOrder ?? {}), [galleryId]: nextOrder }
    await saveState(next, '画廊图片顺序已调整')
  }

  const reorderInsertion = async (insertionId: string, targetInsertionId: string, placement: 'before' | 'after') => {
    const next = cloneState(state)
    const source = next.insertions.find((item) => item.id === insertionId)
    const target = next.insertions.find((item) => item.id === targetInsertionId)
    if (!source || !target || source.id === target.id || source.parentSelector !== target.parentSelector) return

    const group = next.insertions.filter((item) => item.parentSelector === source.parentSelector)
    const withoutSource = group.filter((item) => item.id !== source.id)
    const targetIndex = withoutSource.findIndex((item) => item.id === target.id)
    if (targetIndex < 0) return
    withoutSource.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, source)

    let groupIndex = 0
    next.insertions = next.insertions.map((item) => item.parentSelector === source.parentSelector ? withoutSource[groupIndex++] : item)
    await saveState(next, '图片顺序已调整')
  }

  const renameGallerySection = async (id: string, label: string) => {
    const nextLabel = label.trim()
    const current = galleryDefinitions(state).find((section) => section.id === id)
    if (!nextLabel || !current || current.label === nextLabel) return
    const next = cloneState(state)
    next.gallerySections = galleryDefinitions(next).map((section) => section.id === id ? { ...section, label: nextLabel } : section)
    const headingSelector = `[data-editor-text-key="gallery-${id}-heading"]`
    const existingOverride = next.overrides[editorOverrideKey('/works', headingSelector)]
    if (existingOverride) existingOverride.value = nextLabel
    await saveState(next, '模块名称已同步到例图画廊和批量上传')
  }

  const updateGalleryAspectRatio = async (id: string, value: string) => {
    const normalized = normalizeGalleryAspectRatio(value.replace(':', ' / '))
    const current = galleryDefinitions(state).find((section) => section.id === id)
    if (!normalized) {
      setFeedback('图片比例格式不正确，请填写例如 5 / 4 或 1:1', 'error')
      return
    }
    if (!current || current.aspectRatio === normalized) return
    const next = cloneState(state)
    next.gallerySections = galleryDefinitions(next).map((section) => section.id === id ? { ...section, aspectRatio: normalized } : section)
    await saveState(next, '图片模块比例已同步到例图画廊和批量上传')
  }

  const updateGalleryColumnLayout = async (widths: Record<string, number>) => {
    const safeWidths = Object.fromEntries(Object.entries(widths).flatMap(([id, value]) => {
      const width = Number(value)
      return Number.isFinite(width) && width > 0 ? [[id, Math.min(3, Math.max(0.5, width))]] : []
    }))
    if (!Object.keys(safeWidths).length) return
    const baseState = stateRef.current
    const next = cloneState(baseState)
    next.gallerySections = galleryDefinitions(next).map((section) => (
      safeWidths[section.id] ? { ...section, columnWidth: safeWidths[section.id] } : section
    ))
    await saveState(next, '鐢诲粖鍒楀姣斾緥宸插畾浣嶅苟淇濆瓨', { optimistic: true, rollbackState: baseState })
  }

  const addGallerySection = async () => {
    const next = cloneState(state)
    const baseId = `gallery-${Date.now()}`
    next.gallerySections = [...galleryDefinitions(next), { id: baseId, label: '新模块' }]
    await saveState(next, '已新增一个大模块，现在可以批量上传图片')
  }

  const deleteGallerySection = async (id: string) => {
    const sections = galleryDefinitions(state)
    if (sections.length <= 1) {
      setFeedback('至少保留一个大模块', 'error')
      return
    }
    const section = sections.find((item) => item.id === id)
    if (!section || !window.confirm(`确定删除“${section.label}”及其中的全部图片吗？删除后需要重新上传。`)) return
    const next = cloneState(state)
    const removedInsertionIds = next.insertions
      .filter((item) => item.parentSelector.includes(`data-editor-gallery-id="${id}"`))
      .map((item) => item.id)
    next.gallerySections = sections.filter((item) => item.id !== id)
    next.insertions = next.insertions.filter((item) => !item.parentSelector.includes(`data-editor-gallery-id="${id}"`))
    if (next.galleryImageOrder) {
      delete next.galleryImageOrder[id]
    }
    Object.keys(next.overrides).forEach((key) => {
      if (key.includes(`gallery-${id}-heading`) || removedInsertionIds.some((insertionId) => key.includes(insertionId))) delete next.overrides[key]
    })
    setBatchTargetId((current) => current === id ? null : current)
    setSelection(null)
    setForm(null)
    await saveState(next, `模块“${section.label}”及其中图片已删除`)
  }

  const moveGallerySection = async (id: string, direction: -1 | 1) => {
    const sections = galleryDefinitions(state)
    const index = sections.findIndex((section) => section.id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= sections.length) return
    const nextSections = [...sections]
    const [section] = nextSections.splice(index, 1)
    nextSections.splice(targetIndex, 0, section)
    const next = cloneState(state)
    next.gallerySections = nextSections
    await saveState(next, '例图大模块顺序已调整')
  }

  const pricingOfferDefinitions = () => resolvePricingOffers(state)

  const selectPricingOffer = (id: string) => {
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '')
    document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({
      type: 'editor:highlight',
      selector: '[data-editor-card-id="' + safe + '"]',
    }, window.location.origin)
  }

  const addPricingOffer = async () => {
    const next = cloneState(state)
    const id = 'pricing-offer-' + Date.now()
    const nextNumber = String(pricingOfferDefinitions().length + 1).padStart(2, '0')
    next.pricingOffers = [
      ...pricingOfferDefinitions(),
      { id, label: nextNumber + ' / 新项目', title: '新价格项目', copy: '点击卡片中的文字即可单独编辑' },
    ]
    await saveState(next, '已新增价格活动卡片，可单独编辑文字、大小和位置')
  }

  const movePricingOffer = async (id: string, direction: -1 | 1) => {
    const offers = pricingOfferDefinitions()
    const index = offers.findIndex((offer) => offer.id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= offers.length) return
    const nextOffers = [...offers]
    const [offer] = nextOffers.splice(index, 1)
    nextOffers.splice(targetIndex, 0, offer)
    const next = cloneState(state)
    next.pricingOffers = nextOffers
    await saveState(next, '价格活动卡片顺序已调整')
  }

  const deletePricingOffer = async (id: string) => {
    const offers = pricingOfferDefinitions()
    const offer = offers.find((item) => item.id === id)
    if (!offer || offers.length <= 1 || !window.confirm('确定删除“' + offer.title + '”这个价格活动卡片吗？')) return
    const next = cloneState(state)
    next.pricingOffers = offers.filter((item) => item.id !== id)
    const textSelector = id
    const cardSelector = 'data-editor-card-id="' + id + '"'
    Object.keys(next.overrides).forEach((key) => {
      if (key.includes(textSelector) || key.includes(cardSelector)) delete next.overrides[key]
    })
    if (selection?.selector.includes(cardSelector)) {
      setSelection(null)
      setForm(null)
    }
    await saveState(next, '价格活动卡片及其单独设置已删除')
  }

  const addContactButton = async () => {
    const next = cloneState(state)
    next.contactButtons = [...contactButtonDefinitions(next), { id: `contact-qq-${Date.now()}`, label: 'QQ 联系', value: '' }]
    await saveState(next, '已新增 QQ 联系按钮，请填写 QQ 号')
  }

  const addWechatButton = async () => {
    const next = cloneState(state)
    next.contactButtons = [...contactButtonDefinitions(next), { id: `contact-wechat-${Date.now()}`, label: '微信联系', value: '', kind: 'wechat' }]
    await saveState(next, '已新增微信联系窗口，请填写微信号')
  }

  const addContactLink = async () => {
    const next = cloneState(state)
    next.contactButtons = [...contactButtonDefinitions(next), { id: `contact-link-${Date.now()}`, label: '新平台', value: '', kind: 'link' }]
    await saveState(next, '已新增平台链接，请填写名称和链接')
  }

  const updateContactLink = async (id: string, patch: Partial<Pick<EditorContactButton, 'label' | 'value'>>) => {
    const current = linkButtonDefinitions(state).find((button) => button.id === id)
    if (!current) return
    if (patch.value !== undefined && patch.value.trim() && !isExternalContactUrl(patch.value)) {
      setInvalidContactLinks((previous) => ({ ...previous, [id]: true }))
      setFeedback('链接格式不正确，请填写 http:// 或 https:// 开头的地址', 'error')
      return
    }
    if (patch.value !== undefined) {
      setInvalidContactLinks((previous) => {
        const next = { ...previous }
        delete next[id]
        return next
      })
    }
    const next = cloneState(state)
    next.contactButtons = contactButtonDefinitions(next).map((button) => button.id === id
      ? { ...button, kind: 'link' as const, ...patch }
      : button)
    await saveState(next, '平台链接已保存')
  }

  const deleteContactLink = async (id: string) => {
    const link = linkButtonDefinitions(state).find((button) => button.id === id)
    if (!link || !window.confirm(`确定删除“${link.label || '平台链接'}”吗？`)) return
    const next = cloneState(state)
    next.contactButtons = contactButtonDefinitions(next).filter((button) => button.id !== id)
    await saveState(next, '平台链接已删除')
  }

  const updateContactButton = async (id: string, patch: Partial<Pick<EditorContactButton, 'label' | 'value'>>) => {
    const next = cloneState(state)
    const buttons = contactButtonDefinitions(next)
    if (!buttons.some((button) => button.id === id)) return
    next.contactButtons = buttons.map((button) => button.id === id ? { ...button, ...patch } : button)
    await saveState(next, 'QQ 联系按钮已保存')
  }

  const updateContactButtonLayout = async (id: string, styles: Record<string, string>, orderedButtonIds?: string[]) => {
    const baseState = stateRef.current
    const button = contactButtonDefinitions(baseState).find((item) => item.id === id)
    if (!button) return
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeId) return
    const selector = `[data-editor-contact-button-id="${safeId}"]`
    const key = editorOverrideKey('/#contact', selector)
    const next = cloneState(baseState)
    const current = next.overrides[key] ?? { selector, page: '/#contact', kind: 'element' as const }
    next.overrides[key] = {
      ...current,
      selector,
      page: '/#contact',
      kind: 'element',
      styles: { ...(current.styles ?? {}), ...styles },
    }
    if (orderedButtonIds?.length) {
      const currentButtons = contactButtonDefinitions(next)
      const sameKind = (item: EditorContactButton) => contactButtonKind(item) === contactButtonKind(button)
      const sameKindIndexes = currentButtons
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => sameKind(item))
        .map(({ index }) => index)
      const sameKindIds = new Set(currentButtons.filter(sameKind).map((item) => item.id))
      const ordered = [...new Set(orderedButtonIds)].filter((buttonId) => sameKindIds.has(buttonId))
      const remaining = currentButtons.filter((item) => sameKind(item) && !ordered.includes(item.id)).map((item) => item.id)
      const nextSameKindIds = [...ordered, ...remaining]
      const reorderedButtons = [...currentButtons]
      sameKindIndexes.forEach((index, position) => {
        const nextButton = currentButtons.find((item) => item.id === nextSameKindIds[position])
        if (nextButton) reorderedButtons[index] = nextButton
      })
      next.contactButtons = reorderedButtons
    }
    await saveState(next, '联系窗口位置和大小已保存')
  }

  const moveContactButton = async (id: string, delta: -1 | 1) => {
    const buttons = contactButtonDefinitions(stateRef.current)
    const current = buttons.find((button) => button.id === id)
    if (!current) return
    const sameKindIndexes = buttons
      .map((button, index) => ({ button, index }))
      .filter(({ button }) => contactButtonKind(button) === contactButtonKind(current))
      .map(({ index }) => index)
    const position = sameKindIndexes.indexOf(buttons.indexOf(current))
    const targetPosition = position + delta
    if (position < 0 || targetPosition < 0 || targetPosition >= sameKindIndexes.length) return
    const next = cloneState(stateRef.current)
    const fromIndex = sameKindIndexes[position]
    const toIndex = sameKindIndexes[targetPosition]
    const reordered = [...contactButtonDefinitions(next)]
    ;[reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]]
    next.contactButtons = reordered
    await saveState(next, '联系窗口顺序已调整')
  }

  const deleteContactButton = async (id: string) => {
    const button = contactButtonDefinitions(state).find((item) => item.id === id)
    if (!button || !window.confirm(`确定删除“${button.label || 'QQ 联系'}”按钮吗？`)) return
    const next = cloneState(state)
    next.contactButtons = contactButtonDefinitions(next).filter((item) => item.id !== id)
    await saveState(next, 'QQ 联系按钮已删除')
  }

  const selectContactCard = (id: string) => {
    const index = contactCardDefinitions(state).findIndex((card) => card.id === id)
    if (index < 0) return
    document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({
      type: 'editor:highlight',
      selector: contactCardTextSelector(index, 'value'),
    }, window.location.origin)
  }

  const addContactCard = async () => {
    const previousCards = contactCardDefinitions(state)
    const next = cloneState(state)
    const nextCards = [...previousCards, { id: `contact-card-${Date.now()}`, label: '新联系方式', value: '' }]
    next.contactCards = nextCards
    remapContactCardOverrides(next, previousCards, nextCards)
    await saveState(next, '已新增联系方式卡片，请点击预览中的文字填写内容')
  }

  const deleteContactCard = async (id: string) => {
    const previousCards = contactCardDefinitions(state)
    const card = previousCards.find((item) => item.id === id)
    if (!card || !window.confirm(`确定删除“${card.label || '联系方式'}”这个卡片吗？`)) return
    const nextCards = previousCards.filter((item) => item.id !== id)
    const next = cloneState(state)
    next.contactCards = nextCards
    remapContactCardOverrides(next, previousCards, nextCards)
    if (selection?.selector.includes('data-editor-text-key="contact-card-')) {
      setSelection(null)
      setForm(null)
    }
    await saveState(next, '联系方式卡片已删除')
  }

  const deleteSelectedPreviewElement = async (nextSelection: EditorSelection) => {
    if (nextSelection.insertionId) {
      await deleteInsertionById(nextSelection.insertionId)
      return
    }
    if (nextSelection.galleryId && nextSelection.galleryImageId) {
      await deleteGalleryImageById(nextSelection.galleryId, nextSelection.galleryImageId)
      return
    }
    const galleryHeading = nextSelection.selector.match(/data-editor-text-key=["']gallery-([a-zA-Z0-9_-]+)-heading["']/)
    if (galleryHeading) {
      await deleteGallerySection(galleryHeading[1])
      return
    }
    const pricingCard = nextSelection.selector.match(/data-editor-card-id=["'](pricing-offer-[a-zA-Z0-9_-]+)["']/)
    if (pricingCard) {
      await deletePricingOffer(pricingCard[1])
      return
    }
    const contactButton = nextSelection.selector.match(/data-editor-contact-button-id=["']([a-zA-Z0-9_-]+)["']/)
    if (contactButton) {
      const button = contactButtonDefinitions(stateRef.current).find((item) => item.id === contactButton[1])
      if (button?.kind === 'link') await deleteContactLink(button.id)
      else if (button) await deleteContactButton(button.id)
      return
    }
    const contactCard = nextSelection.selector.match(/data-editor-text-key=["']contact-card-(\d+)-(?:label|value)["']/)
    if (contactCard) {
      const card = contactCardDefinitions(stateRef.current)[Number(contactCard[1])]
      if (card) await deleteContactCard(card.id)
    }
  }

  const moveContactCard = async (id: string, direction: -1 | 1) => {
    const previousCards = contactCardDefinitions(state)
    const index = previousCards.findIndex((item) => item.id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= previousCards.length) return
    const nextCards = [...previousCards]
    const [card] = nextCards.splice(index, 1)
    nextCards.splice(targetIndex, 0, card)
    const next = cloneState(state)
    next.contactCards = nextCards
    remapContactCardOverrides(next, previousCards, nextCards)
    await saveState(next, '联系方式卡片顺序已调整')
  }

  const addGalleryWindow = async (galleryId?: string) => {
    const now = Date.now()
    if (addGalleryBusyRef.current || now - addGalleryLastClickRef.current < 700) return
    addGalleryLastClickRef.current = now
    addGalleryBusyRef.current = true
    try {
      const parentSelector = galleryId
        ? `[data-editor-gallery-id="${galleryId.replace(/[^a-zA-Z0-9_-]/g, '')}"]`
        : selection?.containerSelector
      if (!parentSelector) {
        setNotice('新增失败：没有找到目标分类，请重新打开例图画廊')
        return
      }
      const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame')
      const parentReady = await waitForPreviewElement(frame, parentSelector)
      if (!parentReady) {
        setFeedback('新增失败：目标分类还没有加载完成，请稍后重试。', 'error')
        return
      }
      const id = `gallery-window-${Date.now()}`
      const next = cloneState(stateRef.current)
      next.insertions = [...next.insertions, {
        id,
        page: '/works',
          parentSelector,
          insertPosition: 'end',
        kind: 'image',
        src: '/placeholders/black.svg',
        alt: '例图窗口',
         styles: { width: '100%', 'aspect-ratio': '16 / 9', 'object-fit': 'cover', display: 'block', 'border-radius': '12px' },
      }]
      const saved = await saveState(next, '已新增一个图片窗口，请点击它上传图片')
      if (!saved) {
        setFeedback('新增失败：本地保存接口没有成功响应，请重新打开后台管理器后重试。', 'error')
        return
      }
      preservePreviewLocation(galleryId)
      setSelection(null)
      setForm(null)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '新增图片窗口失败，请重试。', 'error')
    } finally {
      addGalleryBusyRef.current = false
    }
  }

  // 批量导入：选中目标大类后，一次多选图片，逐张压缩上传并作为新卡片追加到该分类。
  const addGalleryImageFromFile = async (file: File, galleryId: string) => {
    if (!file.type.startsWith('image/')) {
      setFeedback('请拖入图片文件，视频和音频请使用对应的上传入口', 'error')
      return
    }
    if (addGalleryBusyRef.current) return
    const safeGalleryId = galleryId.replace(/[^a-zA-Z0-9_-]/g, '')
    const parentSelector = `[data-editor-gallery-id="${safeGalleryId}"]`
    const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame')
    if (!frame?.contentDocument?.querySelector(parentSelector)) {
      setFeedback('新增图片失败：目标画廊还没有加载完成，请稍后再试', 'error')
      return
    }

    addGalleryBusyRef.current = true
    setUploadProgress({ active: true, percent: 10, name: file.name })
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress((current) => ({ ...current, percent: Math.max(10, Math.round((event.loaded / event.total) * 45)) }))
        }
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('文件读取失败'))
        reader.onerror = () => reject(new Error(`文件读取失败：${file.name}`))
        reader.readAsDataURL(file)
      })
      setUploadProgress({ active: true, percent: 55, name: file.name })
      const result = await api<{ src: string; srcMobile?: string; width?: number; height?: number }>('/api/editor/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `gallery-drop-${Date.now()}-${file.name}`, data: dataUrl }),
      })
      if (!result.src) throw new Error('图片上传失败')
      const aspectRatio = detectAspectRatio(result.width, result.height) || '16 / 9'
      const next = cloneState(stateRef.current)
      next.insertions = [...next.insertions, {
        id: `gallery-drop-${Date.now()}`,
        page: '/works',
        parentSelector,
        insertPosition: 'end',
        kind: 'image',
        src: result.src,
        srcMobile: result.srcMobile,
        alt: file.name.replace(/\.[^.]+$/, ''),
        styles: { width: '100%', 'aspect-ratio': aspectRatio, 'object-fit': 'cover', display: 'block', 'border-radius': '12px' },
      }]
      setUploadProgress({ active: true, percent: 90, name: file.name })
      const saved = await saveState(next, `图片已添加到${galleryId}画廊`)
      if (saved) preservePreviewLocation(galleryId)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '图片添加失败，请重试', 'error')
    } finally {
      addGalleryBusyRef.current = false
      setUploadProgress({ active: false, percent: 0, name: '' })
    }
  }

  const batchImportImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (addGalleryBusyRef.current) return
    if (!batchTargetId) {
      setFeedback('批量导入失败：请先在下方选择要导入的目标大类', 'error')
      return
    }

    const safeGalleryId = batchTargetId.replace(/[^a-zA-Z0-9_-]/g, '')
    const parentSelector = `[data-editor-gallery-id="${safeGalleryId}"]`
    const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame')
    if (!frame?.contentDocument?.querySelector(parentSelector)) {
      setFeedback('批量导入失败：目标大类还没有加载完成，请稍后重试', 'error')
      return
    }

    addGalleryBusyRef.current = true
    batchCancelRef.current = false
    // 按文件名自然排序，保证 1,2,10 的顺序正确
    const sortedFiles = files.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    const batchId = Date.now()
    const uploaded: EditorState['insertions'] = []
    const failed: string[] = []

    setBatchProgress({ active: true, done: 0, total: sortedFiles.length, canceled: false, currentName: '', currentPercent: 0 })
    try {
      for (let i = 0; i < sortedFiles.length; i++) {
        if (batchCancelRef.current) break
        const file = sortedFiles[i]
        setBatchProgress(prev => ({ ...prev, done: i, currentName: file.name, currentPercent: 5 }))
        setFeedback(`正在压缩并上传 ${i + 1}/${sortedFiles.length}：${file.name}`, 'pending')
        try {
          const reader = new FileReader()
          reader.onprogress = (e) => {
            if (e.lengthComputable) setBatchProgress(prev => ({ ...prev, currentPercent: Math.round((e.loaded / e.total) * 45) }))
          }
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('读取失败'))
            reader.onerror = () => reject(new Error(`文件读取失败：${file.name}`))
            reader.readAsDataURL(file)
          })
          setBatchProgress(prev => ({ ...prev, currentPercent: 55 }))
          const result = await api<{ src: string; srcMobile?: string; width?: number; height?: number }>('/api/editor/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `batch-${batchId}-${i + 1}-${file.name}`, data: dataUrl }),
          })
          setBatchProgress(prev => ({ ...prev, currentPercent: 100 }))
          if (!result?.src) { failed.push(file.name); continue }
          const aspectRatio = detectAspectRatio(result.width, result.height) || '16 / 9'
          uploaded.push({
            id: `gallery-batch-${batchId}-${i + 1}`,
            page: '/works',
            parentSelector,
            insertPosition: 'end',
            kind: 'image',
            src: result.src,
            srcMobile: result.srcMobile,
            alt: file.name.replace(/\.[^.]+$/, ''),
            styles: { width: '100%', 'aspect-ratio': aspectRatio, 'object-fit': 'cover', display: 'block', 'border-radius': '12px' },
          })
        } catch (err) {
          failed.push(`${file.name}：${err instanceof Error ? err.message : '上传失败'}`)
        }
        setBatchProgress(prev => ({ ...prev, done: i + 1, currentPercent: 100 }))
      }

      if (!uploaded.length) {
        setBatchProgress({ active: false, done: 0, total: 0, canceled: false, currentName: '', currentPercent: 0 })
        setFeedback(batchCancelRef.current ? '批量导入已取消' : `批量导入失败：${failed.join('；') || '没有图片成功上传'}`, batchCancelRef.current ? 'info' : 'error')
        return
      }

      const next = cloneState(state)
      next.insertions = [...next.insertions, ...uploaded]
      const saved = await saveState(next, `已批量导入 ${uploaded.length} 张图片到该分类`)
      setBatchProgress({ active: false, done: 0, total: 0, canceled: false, currentName: '', currentPercent: 0 })
      if (!saved) {
        setFeedback('图片已上传，但保存失败，请重试', 'error')
        return
      }
      const summary = `成功新增 ${uploaded.length} 张图片${failed.length ? `，另有 ${failed.length} 张失败` : ''}`
      setFeedback(summary, failed.length ? 'error' : 'success')
    } finally {
      addGalleryBusyRef.current = false
    }
  }

  const cancelUpload = () => {
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    setUploadProgress({ active: false, percent: 0, name: '' })
    setFeedback('上传已取消', 'info')
  }

  const cancelBatchImport = () => {
    batchCancelRef.current = true
    setFeedback('正在取消批量导入…', 'info')
  }

  // 把服务器返回的宽高换算成最接近的常用比例；识别不出来则返回原始比例字符串，仍失败返回 null
  const detectAspectRatio = (width?: number, height?: number): string | null => {
    if (!width || !height || width <= 0 || height <= 0) return null
    const ratio = width / height
    const presets: Array<[string, number]> = [
      ['16 / 9', 16 / 9], ['21 / 9', 21 / 9], ['2.35 / 1', 2.35], ['4 / 3', 4 / 3],
      ['1 / 1', 1], ['3 / 4', 3 / 4], ['2 / 3', 2 / 3], ['9 / 16', 9 / 16],
    ]
    let best: string | null = null
    let bestDiff = Infinity
    for (const [label, value] of presets) {
      const diff = Math.abs(ratio - value) / value
      if (diff < bestDiff) { bestDiff = diff; best = label }
    }
    // 误差在 6% 以内认为匹配到常用比例，否则用图片真实宽高作为自定义比例
    if (best && bestDiff <= 0.06) return best
    return `${width} / ${height}`
  }

  const uploadMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !form) return
    setFeedback(`正在导入 ${file.name}…`, 'pending')
    setUploadProgress({ active: true, percent: 10, name: file.name })
    const abortController = new AbortController()
    uploadAbortRef.current = abortController
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress((prev) => ({ ...prev, percent: Math.round((e.loaded / e.total) * 40) }))
    }
    reader.onload = async () => {
      if (abortController.signal.aborted) return
      try {
        setUploadProgress((prev) => ({ ...prev, percent: 50 }))
        setFeedback(`正在上传 ${file.name}…`, 'pending')
        const result = await api<{ src: string; srcMobile?: string; format?: string; originalBytes?: number; optimizedBytes?: number; width?: number; height?: number }>('/api/editor/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data: reader.result }),
          signal: abortController.signal,
        })
        if (abortController.signal.aborted) return
        setUploadProgress((prev) => ({ ...prev, percent: 90 }))
        const patch: Partial<EditorOverride> = { src: result.src, srcMobile: result.srcMobile }
        let ratioNote = ''
        if (form.kind === 'image') {
          const detected = detectAspectRatio(result.width, result.height)
          if (detected) {
            patch.parentStyles = { ...(form.parentStyles ?? {}), 'aspect-ratio': detected }
            ratioNote = `，已自动识别比例 ${detected.replace(' / ', ':')}`
          } else {
            ratioNote = '，未能识别比例，请在下方手动选择'
          }
        }
        updateForm(patch)
        const reduction = result.originalBytes && result.optimizedBytes ? Math.max(0, Math.round((1 - result.optimizedBytes / result.originalBytes) * 100)) : 0
        setUploadProgress({ active: false, percent: 100, name: '' })
        setFeedback(form.kind === 'image' ? `图片已转为 WebP（${result.width}×${result.height}，体积减少约 ${reduction}%）${ratioNote}，请点击”保存当前修改”` : '文件已导入，请点击”保存当前修改”', 'success')
      } catch (error) {
        if (abortController.signal.aborted) return
        setUploadProgress({ active: false, percent: 0, name: '' })
        setFeedback(error instanceof Error ? error.message : '文件导入失败', 'error')
      }
    }
    reader.onerror = () => {
      if (abortController.signal.aborted) return
      setUploadProgress({ active: false, percent: 0, name: '' })
      setFeedback(`文件读取失败：${file.name}`, 'error')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const uploadMediaMobile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !form) return
    setFeedback(`正在导入手机端 ${file.name}…`, 'pending')
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const result = await api<{ src: string; format?: string; originalBytes?: number; optimizedBytes?: number; width?: number; height?: number }>('/api/editor/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data: reader.result }),
        })
        updateForm({ srcMobile: result.src })
        const reduction = result.originalBytes && result.optimizedBytes ? Math.max(0, Math.round((1 - result.optimizedBytes / result.originalBytes) * 100)) : 0
        setFeedback(form.kind === 'image' ? `手机端图片已转为 WebP（${result.width}×${result.height}，体积减少约 ${reduction}%），请保存` : '手机端文件已导入，请点击”保存当前修改”')
      } catch (error) { setFeedback(error instanceof Error ? error.message : '手机端文件导入失败', 'error') }
    }
    reader.onerror = () => setFeedback(`文件读取失败：${file.name}`, 'error')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent, target: 'inspector' | 'preview') => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)

    const file = event.dataTransfer.files?.[0]
    if (!file) return

    // 检测文件类型
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')

    if (target === 'inspector' && form && ['image', 'video', 'audio'].includes(form.kind)) {
      // 属性面板拖拽：上传到当前选中的媒体元素
      const expectedKind = form.kind
      if ((expectedKind === 'image' && !isImage) || (expectedKind === 'video' && !isVideo) || (expectedKind === 'audio' && !isAudio)) {
        setFeedback(`请拖入${expectedKind === 'image' ? '图片' : expectedKind === 'video' ? '视频' : '音频'}文件`, 'error')
        return
      }

      setFeedback(`正在导入 ${file.name}…`, 'pending')
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const result = await api<{ src: string; srcMobile?: string; format?: string; originalBytes?: number; optimizedBytes?: number; width?: number; height?: number }>('/api/editor/upload', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name, data: reader.result }),
          })
          updateForm({ src: result.src, srcMobile: result.srcMobile })
          const reduction = result.originalBytes && result.optimizedBytes ? Math.max(0, Math.round((1 - result.optimizedBytes / result.originalBytes) * 100)) : 0
          setFeedback(form.kind === 'image' ? `图片已转为 WebP（${result.width}×${result.height}，体积减少约 ${reduction}%），请保存` : '文件已导入，请点击”保存当前修改”')
        } catch (error) { setFeedback(error instanceof Error ? error.message : '文件导入失败', 'error') }
      }
      reader.onerror = () => setFeedback(`文件读取失败：${file.name}`, 'error')
      reader.readAsDataURL(file)
    } else if (target === 'preview') {
      // 预览区域拖拽：作为快速上传（背景图/视频/音乐）
      let selector = ''
      let kind: QuickUploadKind | null = null

      if (isImage) {
        selector = '__page_background_image__'
        kind = 'image'
      } else if (isVideo) {
        selector = '__page_background_video__'
        kind = 'video'
      } else if (isAudio) {
        selector = '__page_audio__'
        kind = 'audio'
      } else {
        setFeedback('请拖入图片、视频或音频文件', 'error')
        return
      }

      const label = quickUploadLabels[kind]
      const pageLabel = `${findPageLabel(page, hash) ?? '当前页面'}页`
      const reader = new FileReader()
      setMediaFeedback(`正在读取${pageLabel}${label}：${file.name}`, 'pending')
      reader.onload = async () => {
        try {
          setMediaFeedback(`正在上传${pageLabel}${label}：${file.name}`, 'pending')
          const result = await api<{ src: string; srcMobile?: string }>('/api/editor/upload', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: reader.result }),
          })
          setMediaFeedback(`${pageLabel}${label}已上传，正在保存`, 'pending')
          const next = cloneState(state)
          const resourcePage = page + hash
          delete next.overrides[selector]
          next.overrides[editorOverrideKey(resourcePage, selector)] = { selector, page: resourcePage, kind, src: result.src, srcMobile: result.srcMobile, hidden: false, styles: {} }
          const saved = await saveState(next, `${pageLabel}${label}已上传并保存，正在确认预览`)
          if (!saved) {
            setMediaFeedback(`${pageLabel}${label}保存失败，请重试`, 'error')
            return
          }
          setMediaFeedback(`${pageLabel}${label}已保存，正在确认预览加载`, 'pending')
          const loaded = await waitForQuickUploadPreview(document.querySelector<HTMLIFrameElement>('.editor-preview-frame'), result.src, kind)
          if (!loaded) {
            setMediaFeedback(`${pageLabel}${label}已上传并保存，但预览未确认加载，请刷新预览后检查`, 'error')
            return
          }
          setMediaFeedback(`${pageLabel}${label}已上传、保存并加载`, 'success')
        } catch (error) {
          setMediaFeedback(error instanceof Error ? error.message : `${label}替换失败`, 'error')
        }
      }
      reader.onerror = () => setMediaFeedback(`文件读取失败：${file.name}`, 'error')
      reader.readAsDataURL(file)
    }
  }

  // 拖拽文件到预览区iframe内的具体窗口：iframe会先选中目标元素(editor:select)，
  // 然后发送 editor:drop-file 通知。但文件本身无法跨iframe传递，
  // 所以我们在外层的 drop 事件暂存文件，再由 editor:drop-file 消息触发上传。
  const pendingDropFile = useRef<File | null>(null)

  const handlePreviewDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return

    // 如果已经有一个选中的图片/视频/音频元素，直接上传到它
    if (form && ['image', 'video', 'audio'].includes(form.kind)) {
      triggerUploadForFile(file)
      return
    }

    // 否则暂存文件，等 iframe 发来 editor:drop-file 消息后再处理
    pendingDropFile.current = file
    // 同时做一个 fallback：如果 300ms 内没收到 iframe 的 select，就作为页面背景上传
    window.setTimeout(() => {
      const pending = pendingDropFile.current
      if (pending) {
        pendingDropFile.current = null
        handleDrop({ preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: { files: [pending] }, currentTarget: event.currentTarget, target: event.target } as unknown as React.DragEvent, 'preview')
      }
    }, 350)
  }

  const triggerUploadForFile = (file: File) => {
    if (!form) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')
    if ((form.kind === 'image' && !isImage) || (form.kind === 'video' && !isVideo) || (form.kind === 'audio' && !isAudio)) {
      setFeedback(`当前选中的是${form.kind === 'image' ? '图片' : form.kind === 'video' ? '视频' : '音频'}，请拖入对应格式的文件`, 'error')
      return
    }
    setFeedback(`正在导入 ${file.name}…`, 'pending')
    setUploadProgress({ active: true, percent: 10, name: file.name })
    const abortController = new AbortController()
    uploadAbortRef.current = abortController
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress((prev) => ({ ...prev, percent: Math.round((e.loaded / e.total) * 40) }))
    }
    reader.onload = async () => {
      if (abortController.signal.aborted) return
      try {
        setUploadProgress((prev) => ({ ...prev, percent: 50 }))
        const result = await api<{ src: string; srcMobile?: string; width?: number; height?: number; originalBytes?: number; optimizedBytes?: number }>('/api/editor/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data: reader.result }),
          signal: abortController.signal,
        })
        if (abortController.signal.aborted) return
        setUploadProgress((prev) => ({ ...prev, percent: 90 }))
        const patch: Partial<EditorOverride> = { src: result.src, srcMobile: result.srcMobile }
        if (form.kind === 'image') {
          const detected = detectAspectRatio(result.width, result.height)
          if (detected) patch.parentStyles = { ...(form.parentStyles ?? {}), 'aspect-ratio': detected }
        }
        updateForm(patch)
        setUploadProgress({ active: false, percent: 100, name: '' })
        setFeedback(`已导入 ${file.name}，请点击"保存当前修改"`, 'success')
      } catch (error) {
        if (abortController.signal.aborted) return
        setUploadProgress({ active: false, percent: 0, name: '' })
        setFeedback(error instanceof Error ? error.message : '导入失败', 'error')
      }
    }
    reader.onerror = () => {
      setUploadProgress({ active: false, percent: 0, name: '' })
      setFeedback(`文件读取失败：${file.name}`, 'error')
    }
    reader.readAsDataURL(file)
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    if (event.currentTarget === event.target) {
      setDragOver(false)
    }
  }


  const quickUpload = (event: ChangeEvent<HTMLInputElement>, selector: string, kind: QuickUploadKind) => {
    const file = event.target.files?.[0]
    if (!file) return
    const label = quickUploadLabels[kind]
    const pageLabel = `${findPageLabel(page, hash) ?? '当前页面'}页`
    const reader = new FileReader()
    setMediaFeedback(`正在读取${pageLabel}${label}：${file.name}`, 'pending')
    reader.onload = async () => {
      try {
        setMediaFeedback(`正在上传${pageLabel}${label}：${file.name}`, 'pending')
        const result = await api<{ src: string; srcMobile?: string }>('/api/editor/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: reader.result }),
        })
        setMediaFeedback(`${pageLabel}${label}已上传，正在保存`, 'pending')
        const next = cloneState(state)
        const resourcePage = page + hash
        // Page-scoped media must replace any older legacy override for the same slot.
        delete next.overrides[selector]
        next.overrides[editorOverrideKey(resourcePage, selector)] = { selector, page: resourcePage, kind, src: result.src, srcMobile: result.srcMobile, hidden: false, styles: {} }
        const saved = await saveState(next, `${pageLabel}${label}已上传并保存，正在确认预览`)
        if (!saved) {
          setMediaFeedback(`${pageLabel}${label}保存失败，请重试`, 'error')
          return
        }
        setMediaFeedback(`${pageLabel}${label}已保存，正在确认预览加载`, 'pending')
        const loaded = await waitForQuickUploadPreview(document.querySelector<HTMLIFrameElement>('.editor-preview-frame'), result.src, kind)
        if (!loaded) {
          setMediaFeedback(`${pageLabel}${label}已上传并保存，但预览未确认加载，请刷新预览后检查`, 'error')
          return
        }
        setMediaFeedback(`${pageLabel}${label}已上传、保存并加载`, 'success')
      } catch (error) {
        setMediaFeedback(error instanceof Error ? error.message : `${label}替换失败`, 'error')
      }
    }
    reader.onerror = () => setMediaFeedback(`文件读取失败：${file.name}`, 'error')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const deleteQuickAsset = async (selector: string, kind: QuickUploadKind) => {
    const label = quickUploadLabels[kind]
    const pageLabel = `${findPageLabel(page, hash) ?? '当前页面'}页`
    const resourcePage = page + hash
    const next = cloneState(state)
    delete next.overrides[selector]
    next.overrides[editorOverrideKey(resourcePage, selector)] = { selector, page: resourcePage, kind, src: '', hidden: true, styles: {} }
    setMediaFeedback(`正在删除并关闭${pageLabel}${label}`, 'pending')
    const saved = await saveState(next, `${pageLabel}${label}已删除并保存，正在确认关闭`)
    if (!saved) {
      setMediaFeedback(`${pageLabel}${label}删除失败，请重试`, 'error')
      return
    }
    const cleared = await waitForQuickUploadClear(document.querySelector<HTMLIFrameElement>('.editor-preview-frame'), kind)
    if (!cleared) {
      setMediaFeedback(`${pageLabel}${label}已保存，但预览未确认关闭，请刷新预览后检查`, 'error')
      return
    }
    setMediaFeedback(`${pageLabel}${label}已删除并关闭`, 'success')
  }

  const runAction = async (url: string, success: string, body?: unknown) => {
    setBusy(true); setFeedback('正在处理，请稍候…', 'pending')
    const isPublish = url === '/api/editor/publish'
    if (isPublish) {
      await refreshPublishProgress()
      stopPublishPolling()
      publishPollRef.current = window.setInterval(() => { void refreshPublishProgress() }, 500)
    }
    try {
      const result = await api<PublishResult>(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : '{}',
      })
      if (result.settings) setSettings(result.settings)
      setLog(result.output || result.path || '')
      if (result.progress) setPublishProgress(result.progress)
      if (url === '/api/editor/publish' && result.github) {
        const githubVerified = result.github.status === 'success'
        const vercelVerified = result.vercel?.status === 'success'
        if (githubVerified && vercelVerified) {
          setFeedback('GitHub 上传已确认，Vercel 部署已确认', 'success')
        } else if (githubVerified) {
          setFeedback('GitHub 上传已确认，Vercel 正在部署或暂未确认', 'pending')
        } else {
          setFeedback('发布未完成，请查看下方发布日志', 'error')
        }
      } else {
        setFeedback(success, 'success')
      }
      return result
    } catch (error) {
      const failure = error as ApiFailure
      if (failure.details?.output) setLog(failure.details.output)
      if (failure.details?.progress) setPublishProgress(failure.details.progress)
      setFeedback(failure.message || '操作失败', 'error')
    }
    finally {
      if (isPublish) stopPublishPolling()
      setBusy(false)
    }
  }

  const saveSetup = async () => {
    const result = await runAction('/api/editor/connect-github', 'GitHub 仓库连接完成', settings)
    if (result) await refreshAuth()
  }

  const refreshAuth = async () => {
    try { setAuthStatus(await api<AuthStatus>('/api/editor/auth-status')) } catch { /* Status remains visible. */ }
  }

  const loginGithub = async () => {
    await runAction('/api/editor/login-github', 'GitHub 官方登录窗口已打开')
    window.setTimeout(() => { void refreshAuth() }, 2500)
  }

  const connectVercel = async () => {
    await runAction('/api/editor/open-vercel', 'Vercel 官方导入页面已打开')
  }

  const selectedContactValueSelector = contactValueSelector(selection)
  const selectedContactLabel = isContactCardLabel(selection)
  const selectContactValue = () => {
    if (!selectedContactValueSelector) return
    document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:highlight', selector: selectedContactValueSelector }, window.location.origin)
  }
  const activePageLabel = findPageLabel(page, hash) ?? '当前页面'
  const selectEditorPage = (item: EditorPageItem) => {
    setPage(item.path)
    hashRef.current = item.hash ?? ''
    setHash(item.hash ?? '')
    setSelection(null)
    setForm(null)
  }
  const isEditorPageActive = (item: EditorPageItem) => {
    if (item.path === '/' && !item.hash && page === '/' && (hash === '' || hash === '#works')) return true
    return pageKey(item) === `${page}${hash}`
  }
  const renderEditorPageItem = (item: EditorPageItem, nested = false): JSX.Element => (
    <div className={'editor-page-group' + (nested ? ' is-nested' : '')} key={pageKey(item)}>
      <button type="button" className={isEditorPageActive(item) ? 'is-active' : ''} onClick={() => selectEditorPage(item)}>
        <span>{item.label}</span>
        <small>{item.description ?? pageKey(item)}</small>
      </button>
      {item.children?.length ? <div className="editor-page-children">{item.children.map((child) => renderEditorPageItem(child, true))}</div> : null}
    </div>
  )
  const publishStepLabels = ['检查并构建', '整理本地修改', '上传 GitHub', '核对 GitHub', '等待 Vercel']
  const galleryToolsVisible = page === '/works' || (page === '/' && hash === '#works')
  const pricingToolsVisible = page === '/' && hash === '#pricing'
  const contactToolsVisible = page === '/' && hash === '#contact'
  const selectGallerySection = (id: string) => {
    setBatchTargetId(id)
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '')
    document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:highlight', selector: `[data-editor-gallery-id=\"${safe}\"]` }, window.location.origin)
  }
  const setupDoneCount = [authStatus.github.loggedIn, authStatus.github.connected, authStatus.vercel.connected].filter(Boolean).length
  const setupAllDone = setupDoneCount === 3

  return (
    <div className="visual-editor-shell">
      <header className="visual-editor-topbar">
        <div className="visual-editor-brand"><Settings size={22} /><div><strong>网站可视化管理器</strong><span className={`editor-notice is-${noticeTone}`} role="status" aria-live="polite">{notice}</span></div></div>
        <div className="visual-editor-actions">
          <button type="button" onClick={() => { setShowSetup((value) => !value); void refreshAuth() }}><Github size={16} />发布中心</button>
          <button type="button" disabled={busy} onClick={() => void runAction('/api/editor/backup', '完整备份已创建')}><Archive size={16} />备份网站</button>
          <button type="button" disabled={busy} onClick={() => void runAction('/api/editor/build', '检查通过，可以发布')}><Play size={16} />检查网站</button>
          <button className="is-publish" type="button" disabled={busy} onClick={() => void runAction('/api/editor/publish', '已上传 GitHub，Vercel 将自动部署')}><Send size={16} />发布上线</button>
        </div>
      </header>

      {publishProgress.stage !== 'idle' ? (
        <section className={`editor-publish-progress is-${publishProgress.stage}`} role="status" aria-live="polite">
          <div className="editor-publish-progress-heading">
            <div><strong>{publishProgress.message}</strong><span>{publishProgress.detail || '正在处理，请稍候…'}</span></div>
            <b>{publishProgress.running ? `${publishProgress.currentStep}/${publishProgress.totalSteps}` : publishProgress.stage === 'error' ? '失败' : publishProgress.stage === 'pending' ? '待确认' : '完成'}</b>
          </div>
          <div className="editor-publish-progress-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, publishProgress.currentStep / publishProgress.totalSteps)})` }} /></div>
          <ol className="editor-publish-progress-steps">
            {publishStepLabels.map((label, index) => {
              const step = index + 1
              const complete = publishProgress.stage === 'success' ? true : step < publishProgress.currentStep
              const failed = publishProgress.stage === 'error' && step === publishProgress.errorStep
              const current = (publishProgress.running || publishProgress.stage === 'pending') && step === publishProgress.currentStep
              return <li className={[complete ? 'is-complete' : '', current ? 'is-current' : '', failed ? 'is-failed' : ''].filter(Boolean).join(' ')} key={label}><span>{complete ? '✓' : failed ? '!' : step}</span>{label}</li>
            })}
          </ol>
          {publishProgress.stage === 'error' ? (
            <div className="editor-publish-error-actions">
              <button type="button" disabled={busy} onClick={() => void runAction('/api/editor/publish', '已上传 GitHub，Vercel 将自动部署')}><Send size={16} />重新尝试发布</button>
              <span>你的修改已保存在本地不会丢失。如果反复失败，请检查网络连接或开启/关闭 VPN 后再试。</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {showSetup ? (
        <section className="editor-publish-center">
          <div className="publish-center-heading">
            <div>
              <strong>{setupAllDone ? '一键发布中心（已全部配置完成）' : `首次配置向导（已完成 ${setupDoneCount}/3 步）`}</strong>
              <p>{setupAllDone
                ? '之后修改网站内容，只需点击右上角“发布上线”，网站会自动更新。'
                : '发布网站到互联网需要一次性完成下面 3 步授权。全程使用 GitHub 与 Vercel 的官方登录窗口，密码和令牌由官方系统保管，不会写入本项目。配置一次后永久生效。'}</p>
            </div>
            <button type="button" onClick={() => setShowSetup(false)}>收起</button>
          </div>
          <div className="publish-steps">
            <article className={authStatus.github.loggedIn ? 'is-ready' : ''}>
              <span>{authStatus.github.loggedIn ? '✓' : '1'}</span>
              <div>
                <strong>第 1 步：登录 GitHub{authStatus.github.loggedIn ? '（已完成）' : ''}</strong>
                <p>{authStatus.github.loggedIn ? `已登录 ${authStatus.github.account}` : '还没有账号？请先到 github.com 免费注册，再回来点右侧按钮登录'}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void loginGithub()}>{authStatus.github.loggedIn ? '重新登录' : '登录 GitHub'}</button>
            </article>
            <article className={authStatus.github.connected ? 'is-ready' : ''}>
              <span>{authStatus.github.connected ? '✓' : '2'}</span>
              <div>
                <strong>第 2 步：连接代码仓库{authStatus.github.connected ? '（已完成）' : ''}</strong>
                <p>{authStatus.github.connected ? settings.githubRepo : '在 GitHub 上新建一个空仓库，把仓库地址粘贴到下方输入框，再点“保存连接”'}</p>
              </div>
            </article>
            <article className={authStatus.vercel.connected ? 'is-ready' : ''}>
              <span>{authStatus.vercel.connected ? '✓' : '3'}</span>
              <div>
                <strong>第 3 步：连接 Vercel{authStatus.vercel.connected ? '（已完成）' : ''}</strong>
                <p>{authStatus.vercel.connected ? authStatus.vercel.url : 'Vercel 负责把网站放到互联网上（免费）。点右侧按钮打开官方页面，用 GitHub 账号登录并导入第 2 步的仓库'}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void connectVercel()}>{authStatus.vercel.connected ? '打开 Vercel' : '连接 Vercel'}</button>
            </article>
          </div>
          {!setupAllDone ? (
            <details className="publish-setup-guide">
              <summary>不太明白？点这里看每一步的详细说明</summary>
              <ol>
                <li><strong>GitHub 是什么：</strong>免费的代码存放平台，相当于网站文件的“云端仓库”。点击“登录 GitHub”会弹出官方登录窗口，输入 GitHub 账号密码登录一次即可，之后系统会记住授权。</li>
                <li><strong>如何新建仓库：</strong>登录 github.com 后，点击右上角 “+” → “New repository”，起一个英文名字（例如 my-website），选择 Public（公开），点绿色 “Create repository” 按钮。创建完成后，复制浏览器地址栏的网址（形如 https://github.com/你的账号/my-website），粘贴到下方“GitHub 仓库地址”，然后点“保存连接”。</li>
                <li><strong>Vercel 是什么：</strong>免费的网站托管平台，负责把仓库里的文件变成一个所有人都能访问的网站。点击“连接 Vercel”会打开官方导入页面：先选 “Continue with GitHub” 登录，然后在列表中找到第 2 步的仓库，点 “Import” → “Deploy”。部署完成后 Vercel 会给出一个 xxx.vercel.app 的网址，把它填到下方“Vercel 网站地址”，再点一次“保存连接”。</li>
                <li><strong>之后怎么发布：</strong>三步都完成后，这个向导不会再自动弹出。以后每次修改完网站，只需点击右上角“发布上线”，网站就会在几分钟内自动更新。</li>
              </ol>
            </details>
          ) : null}
          <div className="publish-settings-row">
            <label><span>GitHub 仓库地址（第 2 步：粘贴到这里）</span><input value={settings.githubRepo} onChange={(e) => setSettings({ ...settings, githubRepo: e.target.value })} placeholder="https://github.com/你的账号/仓库.git" /></label>
            <label><span>发布分支（默认 main，不用改）</span><input value={settings.branch} onChange={(e) => setSettings({ ...settings, branch: e.target.value })} /></label>
            <label><span>Vercel 网站地址（第 3 步部署后填写）</span><input value={settings.vercelSiteUrl} onChange={(e) => setSettings({ ...settings, vercelSiteUrl: e.target.value })} placeholder="https://你的网站.vercel.app" /></label>
            <button type="button" disabled={busy} onClick={() => void saveSetup()}><Save size={16} />保存连接</button>
          </div>
        </section>
      ) : null}

      <div className="visual-editor-body">
        <aside className="visual-editor-sidebar">
          <div className="editor-sidebar-title"><strong>页面</strong><small>点击切换</small></div>
          <div className="editor-page-list">{pages.map((item) => renderEditorPageItem(item))}</div>
          <div className="editor-help-box"><strong>使用方法</strong><span>1. 点击预览窗口的内容</span><span>2. 在右侧修改文字/上传图片</span><span>3. 画廊内拖动图片可调整顺序</span><span>4. 联系方式窗口可拖动移动、右下角调整大小</span><span>5. 从电脑拖入画廊可新增图片</span><span>6. 全部改完后点击"发布上线"</span><small style={{ marginTop: '8px', opacity: 0.7 }}>提示：拖入已有图片窗口可编辑，拖入画廊空白区域可新增</small></div>
          <div className="editor-quick-assets">
            <div className={`editor-media-status is-${mediaNoticeTone}`} role="status" aria-live="polite"><strong>当前操作</strong><span>{mediaNotice}</span></div>
            <strong>快速替换</strong>
            <label><Video size={15} />当前页背景视频<input type="file" accept="video/*" onChange={(event) => quickUpload(event, '__page_background_video__', 'video')} /></label>
            <label><ImagePlus size={15} />当前页背景图片<input type="file" accept="image/*" onChange={(event) => quickUpload(event, '__page_background_image__', 'image')} /></label>
            <label><Music size={15} />当前页 BGM<input type="file" accept="audio/*" onChange={(event) => quickUpload(event, '__page_audio__', 'audio')} /></label>
            <div className="editor-quick-delete-grid">
              <button className="editor-quick-delete" type="button" disabled={busy} onClick={() => void deleteQuickAsset('__page_background_video__', 'video')}><Trash2 size={14} />删除背景视频</button>
              <button className="editor-quick-delete" type="button" disabled={busy} onClick={() => void deleteQuickAsset('__page_background_image__', 'image')}><Trash2 size={14} />删除背景图片</button>
              <button className="editor-quick-delete" type="button" disabled={busy} onClick={() => void deleteQuickAsset('__page_audio__', 'audio')}><Trash2 size={14} />删除 BGM</button>
            </div>
            <p className="editor-media-note">浏览器可能阻止未经过用户操作的自动播放；音频仍会真实上传、保存并加载，点击预览页面后即可播放。</p>
          </div>
          {page === '/works' || (page === '/' && hash === '#works') ? (
            <>
            {page === '/works' ? (
              <div className="editor-gallery-manager">
                <div className="editor-gallery-manager-heading"><strong>例图大模块</strong><button type="button" onClick={() => void addGallerySection()} disabled={busy || batchProgress.active}><Plus size={14} />新增模块</button></div>
                <small>模块名称、数量和顺序会同步到例图画廊及批量上传分类。</small>
                <div className="editor-gallery-manager-list">
                  {galleryDefinitions(state).map((section) => (
                    <div className="editor-gallery-manager-row" key={`${section.id}-${section.label}-${section.aspectRatio}-${section.columnWidth ?? 1}`}>
                      <GalleryRatioControl section={section} onChange={(value) => void updateGalleryAspectRatio(section.id, value)} />
                      <GalleryColumnWidthControl section={section} onChange={(value) => void updateGalleryColumnLayout({ [section.id]: value })} />
                      <input defaultValue={section.label} aria-label={`模块名称：${section.label}`} onBlur={(event) => void renameGallerySection(section.id, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
                      <button type="button" className="editor-icon-button editor-danger-button" aria-label={`删除模块：${section.label}`} title="删除模块及其中图片" onClick={() => void deleteGallerySection(section.id)} disabled={busy || batchProgress.active}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="editor-batch-import-box">
              <strong>批量导入图片</strong>
              <small>先选目标大模块，再一次选多张图片，系统会自动压缩、识别比例并按文件名顺序排版。例图画廊与完整例图共用同一批图片。</small>
              <div className="editor-batch-gallery-list">
                {galleryDefinitions(state).map((option) => {
                  const currentLabel = option.label
                  return (
                  <button
                    type="button"
                    className={batchTargetId === option.id ? 'is-active' : ''}
                    disabled={batchProgress.active || busy}
                    onClick={() => {
                      setBatchTargetId(option.id)
                      const safe = option.id.replace(/[^a-zA-Z0-9_-]/g, '')
                      document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:highlight', selector: `[data-editor-gallery-id="${safe}"]` }, window.location.origin)
                      setFeedback(`已选择”${currentLabel}”，现在可以批量导入图片`)
                    }}
                    key={option.id}
                  >
                    {currentLabel}
                  </button>
                  )
                })}
              </div>
              <label className={'editor-batch-upload' + (!batchTargetId || batchProgress.active ? ' is-disabled' : '')}>
                <ImagePlus size={16} />
                {batchTargetId ? '选择多张图片并导入' : '请先选择目标大类'}
                <input type="file" accept="image/*" multiple disabled={!batchTargetId || batchProgress.active || busy} onChange={batchImportImages} />
              </label>
            </div>
            </>
          ) : null}
          {log ? <pre className="editor-log">{log}</pre> : null}
        </aside>

        <main className="visual-editor-workspace">
          {batchProgress.active ? (
            <section className="editor-batch-progress" role="status" aria-live="polite">
              <div className="editor-batch-progress-heading">
                <strong>正在批量导入图片…（已完成 {batchProgress.done} / 共 {batchProgress.total} 张）</strong>
                <button type="button" onClick={cancelBatchImport}>取消导入</button>
              </div>
              <div className="editor-batch-progress-bar"><i style={{ transform: `scaleX(${batchProgress.total ? batchProgress.done / batchProgress.total : 0})` }} /></div>
              <div className="editor-batch-progress-current">
                <span className="editor-batch-current-name">{batchProgress.currentName || '准备中…'}</span>
                <div className="editor-batch-current-bar"><i style={{ transform: `scaleX(${batchProgress.currentPercent / 100})` }} /></div>
                <span className="editor-batch-current-percent">{batchProgress.currentPercent}%</span>
              </div>
              <span className="editor-batch-hint">正在按文件名顺序压缩为 WebP、识别比例并排版，请不要关闭窗口。</span>
            </section>
          ) : null}
          <div className="editor-preview-toolbar">
           <div><strong>{activePageLabel}</strong><span>{mode === 'edit' ? '编辑模式：点击任意文字、图片、视频或模块' : '浏览模式：正常操作网站'}</span></div>
            <div className="editor-preview-controls">
              <div className="editor-mode-switch"><button type="button" onClick={() => { const nextMode = mode === 'edit' ? 'browse' : 'edit'; const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame'); const frameSrc = frame?.getAttribute('src') ?? ''; const srcHash = frameSrc ? new URL(frameSrc, window.location.origin).hash : ''; let currentHash = srcHash; try { currentHash = frame?.contentWindow?.location.hash || srcHash } catch { /* preview may still be navigating */ } hashRef.current = currentHash; setHash(currentHash); setMode(nextMode); setSelection(null); setForm(null); window.setTimeout(syncPreviewMode, 0) }}>{mode === 'edit' ? <><Eye size={15} />切换浏览</> : <><Settings size={15} />切换编辑</>}</button></div>
              <div className="editor-device-switch"><button type="button" aria-label="电脑预览" className={device === 'desktop' ? 'is-active' : ''} onClick={() => setDevice('desktop')}><Monitor size={16} /></button><button type="button" aria-label="手机预览" className={device === 'mobile' ? 'is-active' : ''} onClick={() => setDevice('mobile')}><Smartphone size={16} /></button></div>
            </div>
          </div>
          <div
            className={'editor-preview-stage is-' + device + (dragOver ? ' is-drag-over' : '')}
            onDrop={handlePreviewDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <iframe className="editor-preview-frame" src={frameUrl} title="网站实时预览" onLoad={syncPreviewMode} />
            {dragOver && <div className="editor-drop-hint">拖入图片/视频/音乐上传</div>}
          </div>
        </main>

        <aside className="visual-editor-inspector">
          {pricingToolsVisible ? (
            <section className="editor-inspector-gallery-tools editor-pricing-tools">
              <div className="editor-inspector-gallery-heading">
                <div><strong>价格活动卡片</strong><small>每张卡片独立编辑，可新增、删除、调整大小和位置</small></div>
                <button type="button" className="editor-gallery-tool-add" disabled={busy || !stateReady} onClick={() => void addPricingOffer()}><Plus size={14} />新增</button>
              </div>
              <div className="editor-inspector-gallery-list">
                {pricingOfferDefinitions().map((offer) => (
                  <div className={'editor-inspector-gallery-row' + (selection?.selector.includes('data-editor-card-id="' + offer.id + '"') ? ' is-active' : '')} key={offer.id}>
                    <button type="button" className="editor-gallery-section-select" onClick={() => selectPricingOffer(offer.id)}>{offer.label} · {offer.title}</button>
                    <button type="button" className="editor-icon-button" aria-label={`上移价格活动：${offer.title}`} title="上移" disabled={busy || pricingOfferDefinitions().findIndex((item) => item.id === offer.id) === 0} onClick={() => void movePricingOffer(offer.id, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="editor-icon-button" aria-label={`下移价格活动：${offer.title}`} title="下移" disabled={busy || pricingOfferDefinitions().findIndex((item) => item.id === offer.id) === pricingOfferDefinitions().length - 1} onClick={() => void movePricingOffer(offer.id, 1)}><ArrowDown size={14} /></button>
                    <button type="button" className="editor-icon-button editor-danger-button" aria-label={'删除价格活动：' + offer.title} title="删除价格活动卡片" disabled={busy || !stateReady || pricingOfferDefinitions().length <= 1} onClick={() => void deletePricingOffer(offer.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {galleryToolsVisible ? (
            <section className="editor-inspector-gallery-tools">
              <div className="editor-inspector-gallery-heading">
                <div><strong>例图大模块</strong><small>这里可独立添加或删除整个模块</small></div>
                <button type="button" className="editor-gallery-tool-add" disabled={busy || batchProgress.active} onClick={() => void addGallerySection()}><Plus size={14} />新增</button>
              </div>
              <div className="editor-inspector-gallery-list">
                {galleryDefinitions(state).map((section) => (
                  <div className={'editor-inspector-gallery-row' + (batchTargetId === section.id ? ' is-active' : '')} key={`${section.id}-${section.columnWidth ?? 1}`}>
                    <button type="button" className="editor-gallery-section-select" onClick={() => selectGallerySection(section.id)}>{section.label}</button>
                     <GalleryRatioControl section={section} onChange={(value) => void updateGalleryAspectRatio(section.id, value)} />
                     <GalleryColumnWidthControl section={section} onChange={(value) => void updateGalleryColumnLayout({ [section.id]: value })} />
                    <button type="button" className="editor-icon-button" aria-label={`上移模块：${section.label}`} title="上移" disabled={busy || galleryDefinitions(state).findIndex((item) => item.id === section.id) === 0} onClick={() => void moveGallerySection(section.id, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="editor-icon-button" aria-label={`下移模块：${section.label}`} title="下移" disabled={busy || galleryDefinitions(state).findIndex((item) => item.id === section.id) === galleryDefinitions(state).length - 1} onClick={() => void moveGallerySection(section.id, 1)}><ArrowDown size={14} /></button>
                    <button type="button" className="editor-icon-button editor-danger-button" aria-label={`删除模块：${section.label}`} title="删除模块及其中图片" disabled={busy || batchProgress.active} onClick={() => void deleteGallerySection(section.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {contactToolsVisible ? (
            <>
            <section className="editor-contact-tools">
              <div className="editor-inspector-gallery-heading">
                <div><strong>联系方式卡片</strong><small>可新增、删除和上下调整红框中的联系方式窗口</small></div>
                <button type="button" className="editor-gallery-tool-add" disabled={busy} onClick={() => void addContactCard()}><Plus size={14} />新增</button>
              </div>
              <div className="editor-contact-card-list">
                {contactCardDefinitions(state).map((card, index, cards) => (
                  <div className="editor-contact-card-row" key={card.id}>
                    <button type="button" className="editor-gallery-section-select" onClick={() => selectContactCard(card.id)}>{index + 1}. {card.label || '未命名联系方式'}</button>
                    <button type="button" className="editor-icon-button" aria-label={`上移联系方式：${card.label || '未命名'}`} title="上移" disabled={busy || index === 0} onClick={() => void moveContactCard(card.id, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="editor-icon-button" aria-label={`下移联系方式：${card.label || '未命名'}`} title="下移" disabled={busy || index === cards.length - 1} onClick={() => void moveContactCard(card.id, 1)}><ArrowDown size={14} /></button>
                    <button type="button" className="editor-icon-button editor-danger-button" aria-label={`删除联系方式：${card.label || '未命名'}`} title="删除联系方式卡片" disabled={busy} onClick={() => void deleteContactCard(card.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
                {!contactCardDefinitions(state).length ? <small className="editor-contact-empty">还没有联系方式卡片，点击“新增”恢复。</small> : null}
              </div>
            </section>
            <section className="editor-contact-tools">
              <div className="editor-inspector-gallery-heading">
                <div><strong>自定义平台链接</strong><small>填写抖音、小红书或其他主页链接，保存后用户可直接打开</small></div>
                <button type="button" className="editor-gallery-tool-add" disabled={busy} onClick={() => void addContactLink()}><Plus size={14} />新增</button>
              </div>
              <div className="editor-contact-list">
                {linkButtonDefinitions(state).map((link, index, links) => (
                  <div className={'editor-contact-row' + (invalidContactLinks[link.id] || (Boolean(link.value.trim()) && !isExternalContactUrl(link.value)) ? ' has-invalid-link' : '')} key={link.id}>
                    <input defaultValue={link.label} aria-label={`平台名称：${link.label || '未命名'}`} placeholder="平台名称" onBlur={(event) => void updateContactLink(link.id, { label: event.currentTarget.value.trim() || '新平台' })} />
                    <input defaultValue={link.value} aria-label={`平台链接：${link.label || '未命名'}`} placeholder="https://..." type="url" inputMode="url" onBlur={(event) => void updateContactLink(link.id, { value: event.currentTarget.value.trim() })} />
                    <div className="editor-contact-row-actions">
                      <button type="button" className="editor-icon-button" aria-label={`上移平台链接：${link.label || '未命名'}`} title="上移" disabled={busy || index === 0} onClick={() => void moveContactButton(link.id, -1)}><ArrowUp size={14} /></button>
                      <button type="button" className="editor-icon-button" aria-label={`下移平台链接：${link.label || '未命名'}`} title="下移" disabled={busy || index === links.length - 1} onClick={() => void moveContactButton(link.id, 1)}><ArrowDown size={14} /></button>
                      <button type="button" className="editor-icon-button editor-danger-button" aria-label={`删除平台链接：${link.label || '未命名'}`} title="删除平台链接" disabled={busy} onClick={() => void deleteContactLink(link.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {!linkButtonDefinitions(state).length ? <small className="editor-contact-empty">还没有自定义平台链接，点击“新增”添加。</small> : null}
              </div>
            </section>
            <section className="editor-contact-tools">
              <div className="editor-inspector-gallery-heading">
                <div><strong>QQ 联系按钮</strong><small>填写后会显示在网页联系方式中，点击可联系 QQ</small></div>
                <button type="button" className="editor-gallery-tool-add" disabled={busy} onClick={() => void addContactButton()}><Plus size={14} />新增</button>
              </div>
              <div className="editor-contact-list">
                {contactButtonDefinitions(state).filter((button) => contactButtonKind(button) === 'qq').map((button, index, buttons) => (
                  <div className="editor-contact-row" key={button.id}>
                    <input defaultValue={button.label} aria-label={`QQ 按钮名称：${button.label || '未命名'}`} placeholder="按钮名称" onBlur={(event) => void updateContactButton(button.id, { label: event.currentTarget.value.trim() || 'QQ 联系' })} />
                    <input defaultValue={button.value} aria-label={`QQ 号：${button.label || '未命名'}`} placeholder="QQ 号" inputMode="numeric" pattern="[0-9]*" onBlur={(event) => void updateContactButton(button.id, { value: event.currentTarget.value.replace(/[^0-9]/g, '') })} />
                    <div className="editor-contact-row-actions">
                      <button type="button" className="editor-icon-button" aria-label={`上移 QQ 按钮：${button.label || '未命名'}`} title="上移" disabled={busy || index === 0} onClick={() => void moveContactButton(button.id, -1)}><ArrowUp size={14} /></button>
                      <button type="button" className="editor-icon-button" aria-label={`下移 QQ 按钮：${button.label || '未命名'}`} title="下移" disabled={busy || index === buttons.length - 1} onClick={() => void moveContactButton(button.id, 1)}><ArrowDown size={14} /></button>
                      <button type="button" className="editor-icon-button editor-danger-button" aria-label={`删除 QQ 按钮：${button.label || '未命名'}`} title="删除 QQ 联系按钮" disabled={busy} onClick={() => void deleteContactButton(button.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {!contactButtonDefinitions(state).some((button) => button.kind !== 'link') ? <small className="editor-contact-empty">还没有自定义 QQ 按钮，点击“新增”开始添加。</small> : null}
              </div>
            </section>
            <section className="editor-contact-tools">
              <div className="editor-inspector-gallery-heading">
                <div><strong>微信联系窗口</strong><small>填写微信号后，前台点击可尝试打开微信并复制微信号</small></div>
                <button type="button" className="editor-gallery-tool-add" disabled={busy} onClick={() => void addWechatButton()}><Plus size={14} />新增</button>
              </div>
              <div className="editor-contact-list">
                {wechatButtonDefinitions(state).map((button, index, buttons) => (
                  <div className="editor-contact-row" key={button.id}>
                    <input defaultValue={button.label} aria-label={`微信按钮名称：${button.label || '未命名'}`} placeholder="按钮名称" onBlur={(event) => void updateContactButton(button.id, { label: event.currentTarget.value.trim() || '微信联系' })} />
                    <input defaultValue={button.value} aria-label={`微信号：${button.label || '未命名'}`} placeholder="微信号" onBlur={(event) => void updateContactButton(button.id, { value: event.currentTarget.value.trim() })} />
                    <div className="editor-contact-row-actions">
                      <button type="button" className="editor-icon-button" aria-label={`上移微信按钮：${button.label || '未命名'}`} title="上移" disabled={busy || index === 0} onClick={() => void moveContactButton(button.id, -1)}><ArrowUp size={14} /></button>
                      <button type="button" className="editor-icon-button" aria-label={`下移微信按钮：${button.label || '未命名'}`} title="下移" disabled={busy || index === buttons.length - 1} onClick={() => void moveContactButton(button.id, 1)}><ArrowDown size={14} /></button>
                      <button type="button" className="editor-icon-button editor-danger-button" aria-label={`删除微信按钮：${button.label || '未命名'}`} title="删除微信联系窗口" disabled={busy} onClick={() => void deleteContactButton(button.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {!wechatButtonDefinitions(state).length ? <small className="editor-contact-empty">还没有微信联系窗口，点击“新增”添加。</small> : null}
              </div>
            </section>
            </>
          ) : null}
          {!form || !selection ? <div className="editor-empty-inspector"><Settings size={30} /><h2>点击网页上的内容</h2><p>文字、图片、背景视频、BGM和整个模块都可以选择。</p></div> : (
            <div
              className="editor-inspector-content"
              onDrop={(e) => handleDrop(e, 'inspector')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="editor-inspector-heading"><div><span>当前选择</span><h2>{form.kind === 'text' ? '文字' : form.kind === 'image' ? '图片' : form.kind === 'video' ? '视频' : form.kind === 'audio' ? 'BGM' : '页面模块'}</h2></div></div>
              {form.kind === 'text' ? <>
                <label className="editor-field"><span>{selectedContactValueSelector && !selectedContactLabel ? '卡片下方内容' : '文字内容'}</span><textarea rows={6} value={form.value ?? ''} placeholder={selectedContactValueSelector && !selectedContactLabel ? '在这里添加 QQ、VX、QQ群或其他联系内容' : undefined} onChange={(e) => updateForm({ value: e.target.value })} /></label>
                {selectedContactLabel ? <button className="editor-related-content-button" type="button" onClick={selectContactValue}>编辑卡片下方内容</button> : null}
              </> : null}
              {['image','video','audio'].includes(form.kind) ? <>
                <label className="editor-field"><span>电脑端文件地址</span><input value={form.src ?? ''} onChange={(e) => updateForm({ src: e.target.value })} /></label>
                <label className="editor-upload">{form.kind === 'image' ? <><Monitor size={17} /><ImagePlus size={17} /></> : form.kind === 'video' ? <><Monitor size={17} /><Video size={17} /></> : <Music size={17} />}选择电脑端{form.kind === 'image' ? '图片' : form.kind === 'video' ? '视频' : '音乐'}<input type="file" accept={form.kind === 'image' ? 'image/*' : form.kind === 'video' ? 'video/*' : 'audio/*'} onChange={uploadMedia} /></label>
                {form.kind !== 'audio' ? <>
                  <label className="editor-field"><span>手机端文件地址（可选）</span><input value={form.srcMobile ?? ''} onChange={(e) => updateForm({ srcMobile: e.target.value })} placeholder="不填则使用电脑端文件" /></label>
                  <label className="editor-upload">{form.kind === 'image' ? <><Smartphone size={17} /><ImagePlus size={17} /></> : <><Smartphone size={17} /><Video size={17} /></>}选择手机端{form.kind === 'image' ? '图片' : '视频'}（竖版）<input type="file" accept={form.kind === 'image' ? 'image/*' : 'video/*'} onChange={uploadMediaMobile} /></label>
                </> : null}
                {uploadProgress.active ? (
                  <div className="editor-upload-progress">
                    <div className="editor-upload-progress-bar"><i style={{ transform: `scaleX(${uploadProgress.percent / 100})` }} /></div>
                    <span>{uploadProgress.name}（{uploadProgress.percent}%）</span>
                    <button type="button" onClick={cancelUpload}>取消</button>
                  </div>
                ) : null}
              </> : null}
              {form.kind === 'image' ? <div className="editor-ratio-control"><span>图片窗口比例</span><div>{[['16 / 9','16:9'],['21 / 9','21:9'],['2.35 / 1','2.35:1'],['4 / 3','4:3'],['1 / 1','1:1'],['3 / 4','3:4'],['2 / 3','2:3']].map(([value,label]) => <button type="button" className={form.parentStyles?.['aspect-ratio'] === value ? 'is-active' : ''} onClick={() => updateForm({ parentStyles: { ...(form.parentStyles ?? {}), 'aspect-ratio': value } })} key={value}>{label}</button>)}</div><input value={form.parentStyles?.['aspect-ratio'] ?? ''} onChange={(event) => updateForm({ parentStyles: { ...(form.parentStyles ?? {}), 'aspect-ratio': event.target.value } })} placeholder="自定义，例如 5 / 4" /></div> : null}
              <label className="editor-check"><input type="checkbox" checked={Boolean(form.hidden)} onChange={(e) => updateForm({ hidden: e.target.checked })} />隐藏这个内容或模块 {form.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</label>
              <details className="editor-style-details">
                <summary className="editor-style-heading"><strong>尺寸与外观</strong><small>不常用，点开可调</small></summary>
                <div className="editor-style-grid">{styleFields.map(([name,label]) => <label className="editor-field" key={name}><span>{label}</span><input value={form.styles?.[name] ?? ''} placeholder={name === 'font-size' ? '例如 32px' : ''} onChange={(e) => updateForm({ styles: { ...(form.styles ?? {}), [name]: e.target.value } })} /></label>)}</div>
              </details>
              <button className="editor-save-button" type="button" disabled={busy} onClick={() => void saveSelection()}><Save size={16} />保存当前修改</button>
              {selection.insertionId ? <button className="editor-restore-button is-delete" type="button" disabled={busy} onClick={() => void deleteInsertion()}><Trash2 size={15} />删除这个窗口</button> : null}
              {!selection.insertionId && selection.galleryId && selection.galleryImageId && form.kind === 'image' ? <button className="editor-restore-button is-delete" type="button" disabled={busy} onClick={() => void deleteGalleryImageById(selection.galleryId!, selection.galleryImageId!)}><Trash2 size={15} />删除这个图片窗口</button> : null}
              <button className="editor-restore-button" type="button" disabled={busy} onClick={() => void restoreSelection()}><Upload size={15} />恢复原始内容</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
