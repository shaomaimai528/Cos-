import { Archive, Eye, EyeOff, Github, ImagePlus, Monitor, Music, Play, Plus, Save, Send, Settings, Smartphone, Trash2, Upload, Video } from 'lucide-react'
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { defaultEditorState, editorOverrideAppliesToPage, editorOverrideKey, EditorOverride, EditorSelection, EditorState } from './types'
import './editor.css'

const pages = [
  { path: '/', label: '首页与滚动画廊' },
  { path: '/works', label: '例图展示页' },
]

const styleFields = [
  ['color', '文字颜色'], ['background-color', '背景颜色'], ['font-size', '字号'], ['font-weight', '字重'],
  ['line-height', '行高'], ['letter-spacing', '字间距'], ['width', '宽度'], ['height', '高度'],
  ['padding', '内边距'], ['margin', '外边距'], ['border-radius', '圆角'], ['opacity', '透明度'],
] as const

type SettingsState = { githubRepo: string; branch: string; vercelSiteUrl: string }
type AuthStatus = { github: { loggedIn: boolean; account: string; connected: boolean }; vercel: { connected: boolean; url: string } }
const emptySettings: SettingsState = { githubRepo: '', branch: 'main', vercelSiteUrl: '' }
const emptyAuth: AuthStatus = { github: { loggedIn: false, account: '', connected: false }, vercel: { connected: false, url: '' } }

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const data = await response.json() as T & { message?: string; output?: string }
  if (!response.ok) throw new Error(data.message || data.output || '操作失败')
  return data
}

function cloneState(state: EditorState): EditorState {
  return JSON.parse(JSON.stringify(state)) as EditorState
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
    return Boolean(background && !background.hidden && background.style.backgroundImage.includes(src))
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
  const deadline = Date.now() + 1800
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>(emptyAuth)
  const [showSetup, setShowSetup] = useState(false)
  const [notice, setNotice] = useState('正在启动本地管理器…')
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('info')
  const [mediaNotice, setMediaNotice] = useState('请选择背景图片、背景视频或 BGM')
  const [mediaNoticeTone, setMediaNoticeTone] = useState<NoticeTone>('info')
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)
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
    void Promise.all([
      api<EditorState>('/api/editor/state'),
      api<SettingsState>('/api/editor/settings'),
      api<AuthStatus>('/api/editor/auth-status'),
    ]).then(([content, savedSettings, auth]) => {
      setState({ ...defaultEditorState, ...content })
      setSettings(savedSettings)
      setAuthStatus(auth)
      setShowSetup(!savedSettings.githubRepo)
      setFeedback('管理器已连接，可以点击中间网页上的内容进行修改')
    }).catch((error) => setFeedback(error instanceof Error ? error.message : '无法连接本地服务', 'error'))
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'editor:navigate' && typeof event.data.path === 'string') {
        const nextUrl = new URL(event.data.path, window.location.origin)
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
    document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:mode', mode }, '*')
  }
  const updateForm = (patch: Partial<EditorOverride>) => setForm((current) => {
    if (!current) return current
    const nextForm = { ...current, ...patch }
    if (selection) {
      const draft = cloneState(state)
      draft.overrides[editorOverrideKey(selection.page, selection.selector)] = nextForm
      document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:state', state: draft }, '*')
    }
    return nextForm
  })

  const saveState = async (next: EditorState, message: string): Promise<boolean> => {
    setBusy(true)
    try {
      await api('/api/editor/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      setState(next)
      document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:state', state: next }, '*')
      setFeedback(message, 'success')
      return true
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '保存失败', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveSelection = () => {
    if (!selection || !form) return
    const next = cloneState(state)
    next.overrides[editorOverrideKey(selection.page, selection.selector)] = { ...form, styles: Object.fromEntries(Object.entries(form.styles ?? {}).filter(([, value]) => value.trim())) }
    if (selection.insertionId && form.kind === 'image') {
      const insertion = next.insertions.find((item) => item.id === selection.insertionId)
      if (insertion) {
        insertion.src = form.src || '/placeholders/black.svg'
        insertion.alt = form.alt || insertion.alt
        insertion.styles = { ...(insertion.styles ?? {}), ...(form.parentStyles ?? {}) }
      }
    }
    void saveState(next, '修改已保存到网站')
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

  const deleteInsertion = async () => {
    if (!selection?.insertionId) return
    const next = cloneState(state)
    next.insertions = next.insertions.filter((item) => item.id !== selection.insertionId)
    Object.keys(next.overrides).forEach((selector) => {
      if (selector.includes(`data-editor-insert-id=\"${selection.insertionId}\"`)) delete next.overrides[selector]
    })
    setSelection(null)
    setForm(null)
    await saveState(next, '新增窗口已删除')
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
        setNotice('新增失败：没有找到目标分类，请重新打开例图展示页')
        return
      }
      const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame')
      if (frame?.contentDocument && !frame.contentDocument.querySelector(parentSelector)) {
        setNotice('新增失败：目标分类尚未加载，请稍后重试')
        return
      }
      const id = `gallery-window-${Date.now()}`
      const next = cloneState(state)
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
      await saveState(next, '已新增一个图片窗口，请点击它上传图片')
      setPage('/works')
      hashRef.current = ''
      setHash('')
      setSelection(null)
      setForm(null)
    } finally {
      addGalleryBusyRef.current = false
    }
  }

  const uploadMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !form) return
    setFeedback(`正在导入 ${file.name}…`, 'pending')
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const result = await api<{ src: string; format?: string; originalBytes?: number; optimizedBytes?: number; width?: number; height?: number }>('/api/editor/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data: reader.result }),
        })
        updateForm({ src: result.src })
        const reduction = result.originalBytes && result.optimizedBytes ? Math.max(0, Math.round((1 - result.optimizedBytes / result.originalBytes) * 100)) : 0
        setFeedback(form.kind === 'image' ? `图片已转为 WebP（${result.width}×${result.height}，体积减少约 ${reduction}%），请保存` : '文件已导入，请点击“保存当前修改”')
      } catch (error) { setFeedback(error instanceof Error ? error.message : '文件导入失败', 'error') }
    }
    reader.onerror = () => setFeedback(`文件读取失败：${file.name}`, 'error')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const quickUpload = (event: ChangeEvent<HTMLInputElement>, selector: string, kind: QuickUploadKind) => {
    const file = event.target.files?.[0]
    if (!file) return
    const label = quickUploadLabels[kind]
    const pageLabel = page === '/' && hash === '#contact' ? '联系方式页' : pages.find((item) => item.path === page)?.label ?? '当前页面'
    const reader = new FileReader()
    setMediaFeedback(`正在读取${pageLabel}${label}：${file.name}`, 'pending')
    reader.onload = async () => {
      try {
        setMediaFeedback(`正在上传${pageLabel}${label}：${file.name}`, 'pending')
        const result = await api<{ src: string }>('/api/editor/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: reader.result }),
        })
        setMediaFeedback(`${pageLabel}${label}已上传，正在保存`, 'pending')
        const next = cloneState(state)
        const resourcePage = page + hash
        next.overrides[editorOverrideKey(resourcePage, selector)] = { selector, page: resourcePage, kind, src: result.src, hidden: false, styles: {} }
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
    const pageLabel = page === '/' && hash === '#contact' ? '联系方式页' : pages.find((item) => item.path === page)?.label ?? '当前页面'
    const resourcePage = page + hash
    const next = cloneState(state)
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
    setBusy(true); setNotice('正在处理，请稍候…')
    try {
      const result = await api<{ output?: string; path?: string; settings?: SettingsState; github?: { commit?: string }; vercel?: { url?: string } }>(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : '{}',
      })
      if (result.settings) setSettings(result.settings)
      setLog(result.output || result.path || '')
      setNotice(success)
      return result
    } catch (error) { setNotice(error instanceof Error ? error.message : '操作失败') }
    finally { setBusy(false) }
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
    document.querySelector<HTMLIFrameElement>('.editor-preview-frame')?.contentWindow?.postMessage({ type: 'editor:highlight', selector: selectedContactValueSelector }, '*')
  }
  const activePageLabel = page === '/' && hash === '#contact' ? '联系方式' : pages.find((item) => item.path === page)?.label

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

      {showSetup ? (
        <section className="editor-publish-center">
          <div className="publish-center-heading"><div><strong>一键发布中心</strong><p>首次授权一次，之后只需点击右上角“发布上线”。密码和令牌由官方登录系统保管，不写入项目。</p></div><button type="button" onClick={() => setShowSetup(false)}>收起</button></div>
          <div className="publish-steps">
            <article className={authStatus.github.loggedIn ? 'is-ready' : ''}><span>1</span><div><strong>登录 GitHub</strong><p>{authStatus.github.loggedIn ? `已登录 ${authStatus.github.account}` : '首次使用需要在官方窗口登录一次'}</p></div><button type="button" disabled={busy} onClick={() => void loginGithub()}>{authStatus.github.loggedIn ? '重新登录' : '登录 GitHub'}</button></article>
            <article className={authStatus.github.connected ? 'is-ready' : ''}><span>2</span><div><strong>连接代码仓库</strong><p>{authStatus.github.connected ? settings.githubRepo : '填写新网站自己的仓库地址'}</p></div></article>
            <article className={authStatus.vercel.connected ? 'is-ready' : ''}><span>3</span><div><strong>连接 Vercel</strong><p>{authStatus.vercel.connected ? authStatus.vercel.url : '在 Vercel 官方页面导入这个 GitHub 仓库一次'}</p></div><button type="button" disabled={busy} onClick={() => void connectVercel()}>{authStatus.vercel.connected ? '打开 Vercel' : '连接 Vercel'}</button></article>
          </div>
          <div className="publish-settings-row">
            <label><span>GitHub 仓库地址</span><input value={settings.githubRepo} onChange={(e) => setSettings({ ...settings, githubRepo: e.target.value })} placeholder="https://github.com/你的账号/仓库.git" /></label>
            <label><span>发布分支</span><input value={settings.branch} onChange={(e) => setSettings({ ...settings, branch: e.target.value })} /></label>
            <label><span>Vercel 网站地址</span><input value={settings.vercelSiteUrl} onChange={(e) => setSettings({ ...settings, vercelSiteUrl: e.target.value })} placeholder="https://你的网站.vercel.app" /></label>
            <button type="button" disabled={busy} onClick={() => void saveSetup()}><Save size={16} />保存连接</button>
          </div>
        </section>
      ) : null}

      <div className="visual-editor-body">
        <aside className="visual-editor-sidebar">
          <div className="editor-sidebar-title"><strong>页面</strong><small>点击切换</small></div>
          <div className="editor-page-list">{pages.map((item) => <button type="button" className={page === item.path ? 'is-active' : ''} onClick={() => { setPage(item.path); hashRef.current = ''; setHash(''); setSelection(null); setForm(null) }} key={item.path}>{item.label}<small>{item.path}</small></button>)}<button type="button" className={page === '/' && hash === '#contact' ? 'is-active' : ''} onClick={() => { setPage('/'); hashRef.current = '#contact'; setHash('#contact'); setSelection(null); setForm(null) }}>联系方式<small>/#contact</small></button></div>
          <div className="editor-help-box"><strong>使用方法</strong><span>1. 点击中间网页内容</span><span>2. 在右侧修改</span><span>3. 保存当前修改</span><span>4. 检查网站并发布</span></div>
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
          {log ? <pre className="editor-log">{log}</pre> : null}
        </aside>

        <main className="visual-editor-workspace">
          <div className="editor-preview-toolbar">
           <div><strong>{activePageLabel}</strong><span>{mode === 'edit' ? '编辑模式：点击任意文字、图片、视频或模块' : '浏览模式：正常操作网站'}</span></div>
            <div className="editor-preview-controls">
              <div className="editor-mode-switch"><button type="button" onClick={() => { const nextMode = mode === 'edit' ? 'browse' : 'edit'; const frame = document.querySelector<HTMLIFrameElement>('.editor-preview-frame'); const frameSrc = frame?.getAttribute('src') ?? ''; const srcHash = frameSrc ? new URL(frameSrc, window.location.origin).hash : ''; let currentHash = srcHash; try { currentHash = frame?.contentWindow?.location.hash || srcHash } catch { /* preview may still be navigating */ } hashRef.current = currentHash; setHash(currentHash); setMode(nextMode); setSelection(null); setForm(null); window.setTimeout(syncPreviewMode, 0) }}>{mode === 'edit' ? <><Eye size={15} />切换浏览</> : <><Settings size={15} />切换编辑</>}</button></div>
              <div className="editor-device-switch"><button type="button" aria-label="电脑预览" className={device === 'desktop' ? 'is-active' : ''} onClick={() => setDevice('desktop')}><Monitor size={16} /></button><button type="button" aria-label="手机预览" className={device === 'mobile' ? 'is-active' : ''} onClick={() => setDevice('mobile')}><Smartphone size={16} /></button></div>
            </div>
          </div>
          <div className={'editor-preview-stage is-' + device}><iframe className="editor-preview-frame" src={frameUrl} title="网站实时预览" onLoad={syncPreviewMode} /></div>
        </main>

        <aside className="visual-editor-inspector">
          {!form || !selection ? <div className="editor-empty-inspector"><Settings size={30} /><h2>点击网页上的内容</h2><p>文字、图片、背景视频、BGM和整个模块都可以选择。</p></div> : (
            <div className="editor-inspector-content">
              <div className="editor-inspector-heading"><div><span>当前选择</span><h2>{form.kind === 'text' ? '文字' : form.kind === 'image' ? '图片' : form.kind === 'video' ? '视频' : form.kind === 'audio' ? 'BGM' : '页面模块'}</h2></div></div>
              {form.kind === 'text' ? <>
                <label className="editor-field"><span>{selectedContactValueSelector && !selectedContactLabel ? '卡片下方内容' : '文字内容'}</span><textarea rows={6} value={form.value ?? ''} placeholder={selectedContactValueSelector && !selectedContactLabel ? '在这里添加 QQ、VX、QQ群或其他联系内容' : undefined} onChange={(e) => updateForm({ value: e.target.value })} /></label>
                {selectedContactLabel ? <button className="editor-related-content-button" type="button" onClick={selectContactValue}>编辑卡片下方内容</button> : null}
              </> : null}
              {['image','video','audio'].includes(form.kind) ? <>
                <label className="editor-field"><span>当前文件地址</span><input value={form.src ?? ''} onChange={(e) => updateForm({ src: e.target.value })} /></label>
                <label className="editor-upload">{form.kind === 'image' ? <ImagePlus size={17} /> : form.kind === 'video' ? <Video size={17} /> : <Music size={17} />}选择新的{form.kind === 'image' ? '图片' : form.kind === 'video' ? '视频' : '音乐'}<input type="file" accept={form.kind === 'image' ? 'image/*' : form.kind === 'video' ? 'video/*' : 'audio/*'} onChange={uploadMedia} /></label>
              </> : null}
              {form.kind === 'image' ? <div className="editor-ratio-control"><span>图片窗口比例</span><div>{[['16 / 9','16:9'],['21 / 9','21:9'],['2.35 / 1','2.35:1'],['4 / 3','4:3'],['1 / 1','1:1'],['3 / 4','3:4'],['2 / 3','2:3']].map(([value,label]) => <button type="button" className={form.parentStyles?.['aspect-ratio'] === value ? 'is-active' : ''} onClick={() => updateForm({ parentStyles: { ...(form.parentStyles ?? {}), 'aspect-ratio': value } })} key={value}>{label}</button>)}</div><input value={form.parentStyles?.['aspect-ratio'] ?? ''} onChange={(event) => updateForm({ parentStyles: { ...(form.parentStyles ?? {}), 'aspect-ratio': event.target.value } })} placeholder="自定义，例如 5 / 4" /></div> : null}
              <label className="editor-check"><input type="checkbox" checked={Boolean(form.hidden)} onChange={(e) => updateForm({ hidden: e.target.checked })} />隐藏这个内容或模块 {form.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</label>
              <div className="editor-style-heading"><strong>尺寸与外观</strong><small>可留空</small></div>
              <div className="editor-style-grid">{styleFields.map(([name,label]) => <label className="editor-field" key={name}><span>{label}</span><input value={form.styles?.[name] ?? ''} placeholder={name === 'font-size' ? '例如 32px' : ''} onChange={(e) => updateForm({ styles: { ...(form.styles ?? {}), [name]: e.target.value } })} /></label>)}</div>
              <button className="editor-save-button" type="button" disabled={busy} onClick={saveSelection}><Save size={16} />保存当前修改</button>
              {selection.insertionId ? <button className="editor-restore-button" type="button" disabled={busy} onClick={() => void deleteInsertion()}><Upload size={15} />删除这个新增窗口</button> : null}
              <button className="editor-restore-button" type="button" disabled={busy} onClick={() => void restoreSelection()}><Upload size={15} />恢复原始内容</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
