import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { defaultEditorState, editorOverrideAppliesToPage, editorOverrideKey, EditorOverride, EditorSelection, EditorState } from './types'

const editableTags = 'h1,h2,h3,h4,h5,h6,p,span,strong,small,a,button,label,li'

function isTextLeaf(element: Element) {
  return element.childElementCount === 0 && Boolean(element.textContent?.trim())
}

function escapeSelector(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)
}

function selectorFor(element: Element) {
  if (element instanceof HTMLImageElement && element.dataset.editorInsertId) {
    return `[data-editor-insert-id="${escapeSelector(element.dataset.editorInsertId)}"][data-editor-insert-image="true"]`
  }
  if (element instanceof HTMLElement && element.dataset.editorInsertId) {
    return `[data-editor-insert-id="${escapeSelector(element.dataset.editorInsertId)}"]`
  }
  if (element instanceof HTMLElement && element.dataset.editorTextKey) {
    return `[data-editor-text-key="${escapeSelector(element.dataset.editorTextKey)}"]`
  }
  if (element instanceof HTMLElement && element.dataset.editorImageKey) {
    return `[data-editor-image-key="${escapeSelector(element.dataset.editorImageKey)}"]`
  }
  if (element instanceof HTMLElement && element.dataset.editorMediaKey) {
    return `[data-editor-media-key="${escapeSelector(element.dataset.editorMediaKey)}"]`
  }
  if (element instanceof HTMLElement && element.dataset.editorGalleryId) {
    return `[data-editor-gallery-id="${escapeSelector(element.dataset.editorGalleryId)}"]`
  }
  if (element instanceof HTMLElement && element.dataset.editorCardId) {
    return `[data-editor-card-id="${escapeSelector(element.dataset.editorCardId)}"]`
  }
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && parts.length < 8) {
    if (current.id) {
      parts.unshift(`#${escapeSelector(current.id)}`)
      break
    }
    const classes = Array.from(current.classList)
      .filter((className) => Boolean(className) && !className.startsWith('editor-preview-'))
      .slice(0, 2)
      .map(escapeSelector)
    const classPart = classes.length ? `.${classes.join('.')}` : ''
    parts.unshift(`${current.tagName.toLowerCase()}${classPart}`)
    current = current.parentElement
  }
  return parts.join(' > ')
}

function findTarget(node: EventTarget | null): Element | null {
  if (!(node instanceof Element)) return null
  if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'AUDIO') return node
  const inserted = node.closest('[data-editor-insert-id]')
  if (inserted) return inserted.querySelector('img') ?? inserted
  const mediaCard = node.closest('button, a')
  const cardImage = mediaCard?.querySelector('img')
  if (cardImage && !mediaCard?.closest('.nav-brand, .floating-nav')) return cardImage
  const editable = node.closest(editableTags)
  if (editable && editable.textContent?.trim()) return editable
  if (isTextLeaf(node)) return node
  const contactCard = node.closest('.clean-contact-cards > div')
  const contactValue = contactCard?.querySelector('[data-editor-text-key$="-value"]')
  if (contactValue) return contactValue
  return node
}

function selectionFromElement(element: Element, page: string): EditorSelection {
  const kind = element.tagName === 'IMG' ? 'image' : element.tagName === 'VIDEO' ? 'video' : element.tagName === 'AUDIO' ? 'audio' : element.matches(editableTags) || isTextLeaf(element) ? 'text' : 'element'
  const insertionId = element instanceof HTMLElement ? element.dataset.editorInsertId : undefined
  const parent = element.parentElement ?? document.body
  const gallery = element.closest('.pure-gallery-grid')
  return {
    selector: selectorFor(element),
    parentSelector: selectorFor(parent),
    containerSelector: gallery ? selectorFor(gallery) : undefined,
    galleryId: gallery instanceof HTMLElement ? gallery.dataset.editorGalleryId : undefined,
    page,
    kind,
    text: element.textContent?.trim() ?? '',
    src: element.matches('img,video,audio') ? element.getAttribute('src') ?? '' : '',
    alt: element.tagName === 'IMG' ? element.getAttribute('alt') ?? '' : '',
    tag: element.tagName.toLowerCase(),
    insertionId,
  }
}

function shouldPassThroughInEdit(element: Element) {
  return Boolean(
    element.closest(
      'input,textarea,select,[contenteditable="true"],[role="tab"],.prompt-accordion-trigger,.prompt-list-open,.copy-button,.prompt-details-button,.modal-close,.editor-gallery-add,.page-audio-control,.clean-audio-control',
    ),
  )
}

function addPreviewStyles() {
  if (document.getElementById('editor-preview-style')) return
  const style = document.createElement('style')
  style.id = 'editor-preview-style'
  style.textContent = `
    .editor-preview-selected { outline: 2px solid #dfff3f !important; outline-offset: 4px !important; cursor: crosshair !important; }
    .editor-drag-highlight { outline: 3px dashed #ffd700 !important; outline-offset: 3px !important; opacity: .85 !important; }
    [data-editor-insert-id] { cursor: crosshair !important; }
    body.editor-preview-mode img, body.editor-preview-mode video { pointer-events: auto !important; }
    body.editor-preview-edit .card-open-surface,
    body.editor-preview-edit .prompt-card-open,
    body.editor-preview-edit .workflow-detail-card-open { display: none !important; pointer-events: none !important; }
    body.editor-preview-edit .work-card-ambient { pointer-events: none !important; }
    body.editor-preview-edit .work-card-topline,
    body.editor-preview-edit .work-card-topline *,
    body.editor-preview-edit .work-card-content,
    body.editor-preview-edit .work-card-content *,
    body.editor-preview-edit .workflow-detail-card-copy,
    body.editor-preview-edit .workflow-detail-card-copy * { pointer-events: auto !important; }
    body.editor-preview-edit .clean-contact-cards strong:empty::after { content: '点击添加内容'; display: inline-block; min-width: 7em; padding: 4px 8px; color: rgba(223,255,63,.9); border: 1px dashed rgba(223,255,63,.55); border-radius: 5px; font-family: inherit; font-size: 12px; font-weight: 400; letter-spacing: 0; }
    body.editor-preview-edit .clean-contact-cards > div { cursor: crosshair !important; }
  `
  document.head.appendChild(style)
}

function applyStyles(element: HTMLElement, styles: Record<string, string> | undefined) {
  if (!styles) return
  Object.entries(styles).forEach(([property, value]) => {
    const cssProperty = property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
    if (element.style.getPropertyValue(cssProperty) !== value) element.style.setProperty(cssProperty, value)
  })
}

function getPageOverride(state: EditorState, selector: string, page: string) {
  const exact = state.overrides[editorOverrideKey(page, selector)]
  if (exact) return exact
  const aliasPage = page === '/works' ? '/#works' : page === '/pricing' ? '/#pricing' : page === '/#works' ? '/works' : page === '/#pricing' ? '/pricing' : null
  if (aliasPage) {
    const alias = state.overrides[editorOverrideKey(aliasPage, selector)]
    if (alias) return alias
  }
  const legacy = state.overrides[selector]
  return legacy && editorOverrideAppliesToPage(legacy, page) ? legacy : undefined
}

function getBackgroundOverride(state: EditorState, selector: string, page: string) {
  const pageOverride = getPageOverride(state, selector, page)
  if (pageOverride) return pageOverride
  // Inner pages use the current home background until they receive their own setting.
  if (page !== '/' && page !== '/#contact') return getPageOverride(state, selector, '/')
  return undefined
}

function isPlaceholderSrc(src: string | null | undefined) {
  return !src || src === '/placeholders/black.svg' || src === '/placeholders/white.svg'
}

function isLegacyGalleryHeadingOverride(override: EditorOverride) {
  return override.kind === 'text'
    && override.selector.includes('.pure-gallery-section')
    && /(?:^|>)\s*h2$/.test(override.selector.trim())
}

function insertionAppliesToPage(itemPage: string, page: string) {
  return itemPage === page
    || (itemPage === '/works' && page === '/#works')
    || (itemPage === '/#works' && page === '/works')
}

function syncPlaceholderCards() {
  document.querySelectorAll<HTMLElement>('.pure-gallery-card, .clean-rail-card, .hero-loop-card, .work-card, [data-editor-insert-kind="image"]').forEach((card) => {
    const image = card.matches('img') ? card : card.querySelector('img')
    card.classList.toggle('is-placeholder', isPlaceholderSrc(image?.getAttribute('src')))
  })
}

function resolveInsertionParent(selector: string) {
  const legacyIndex = selector.match(/^\[data-editor-gallery-id="(\d+)"\]$/)
  if (legacyIndex) {
    return document.querySelectorAll<HTMLElement>('[data-editor-gallery-id]')[Number(legacyIndex[1])] ?? null
  }
  try {
    return document.querySelector<HTMLElement>(selector)
  } catch {
    return null
  }
}

const mobileMedia = typeof window !== 'undefined' ? window.matchMedia('(max-width: 760px)') : null

const editorStateCache = new Map<string, EditorState>()
const editorStateRequests = new Map<string, Promise<EditorState>>()

function editorStateCacheKey(preview: boolean) {
  return preview ? 'preview' : 'published'
}

async function requestEditorState(url: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal })
  } finally {
    window.clearTimeout(timeout)
  }
}

function loadEditorState(preview: boolean) {
  const cacheKey = editorStateCacheKey(preview)
  const cached = editorStateCache.get(cacheKey)
  if (cached) return Promise.resolve(cached)

  const pending = editorStateRequests.get(cacheKey)
  if (pending) return pending

  const request = (async () => {
    try {
      const response = await requestEditorState(preview ? `/api/editor/state?ts=${Date.now()}` : `/editor-content.json?ts=${Date.now()}`)
      if (!response.ok) throw new Error(`editor state request failed: ${response.status}`)
      return await response.json() as EditorState
    } catch {
      if (preview) {
        try {
          const fallback = await requestEditorState(`/editor-content.json?ts=${Date.now()}`)
          if (fallback.ok) return await fallback.json() as EditorState
        } catch {
          // The default content remains available when the local editor is offline.
        }
      }
      return defaultEditorState
    }
  })().then((state) => {
    editorStateCache.set(cacheKey, state)
    editorStateRequests.delete(cacheKey)
    return state
  }, (error) => {
    editorStateRequests.delete(cacheKey)
    throw error
  })

  editorStateRequests.set(cacheKey, request)
  return request
}

function pickDeviceSrc(override: { src?: string; srcMobile?: string } | undefined) {
  if (!override) return ''
  if (mobileMedia?.matches && override.srcMobile) return override.srcMobile
  return override.src ?? ''
}

let backgroundPanCleanup: (() => void) | null = null

function setupBackgroundPan(backgroundImage: HTMLElement, active: boolean) {
  backgroundPanCleanup?.()
  backgroundPanCleanup = null
  backgroundImage.style.backgroundPosition = ''
  backgroundImage.style.backgroundSize = ''
  if (!active) return
  const probe = new Image()
  const url = backgroundImage.style.backgroundImage.match(/url\("(.+)"\)/)?.[1]
  if (!url) return
  probe.onload = () => {
    if (!probe.naturalWidth || !probe.naturalHeight) return
    const imageRatio = probe.naturalHeight / probe.naturalWidth
    const viewportRatio = window.innerHeight / window.innerWidth
    // 检测竖长图：高度至少是宽度的1.3倍，且明显高于视口比例
    const isTallImage = imageRatio > 1.3 && imageRatio > viewportRatio * 1.35
    if (!isTallImage) return

    backgroundImage.style.backgroundSize = '100% auto'
    let queued = false
    const applyPan = () => {
      queued = false
      const doc = document.documentElement
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight)
      const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll))
      backgroundImage.style.backgroundPosition = `center ${progress * 100}%`
    }
    const onScroll = () => {
      if (queued) return
      queued = true
      window.requestAnimationFrame(applyPan)
    }
    applyPan()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    backgroundPanCleanup = () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      backgroundImage.style.backgroundSize = ''
      backgroundImage.style.backgroundPosition = ''
    }
  }
  probe.src = url
}

function applyState(state: EditorState, page: string) {
  // 全站通用导航：无论当前在哪个页面，都要应用 Logo 和品牌文字的 override
  const navLogo = document.querySelector<HTMLImageElement>('[data-editor-image-key="nav-logo"]')
  const navTitle = document.querySelector<HTMLElement>('[data-editor-text-key="nav-brand-title"]')
  Object.values(state.overrides).forEach((override) => {
    if (override.selector === '[data-editor-image-key="nav-logo"]' && navLogo) {
      const src = pickDeviceSrc(override)
      if (src && navLogo.getAttribute('src') !== src) navLogo.src = src
    }
    if (override.selector === '[data-editor-text-key="nav-brand-title"]' && navTitle && override.value !== undefined) {
      if (navTitle.textContent !== override.value) navTitle.textContent = override.value
      if (document.title !== override.value) document.title = override.value
    }
  })

  document.querySelectorAll<HTMLElement>('.pure-gallery-section .archive-section-heading').forEach((heading) => {
    if (!document.body.classList.contains('editor-preview-mode')) return
    const grid = heading.parentElement?.querySelector<HTMLElement>('.pure-gallery-grid')
    const galleryId = grid?.dataset.editorGalleryId
    if (!grid || !galleryId) return
    if (!heading.querySelector('.editor-gallery-add')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'editor-gallery-add'
      button.innerHTML = '<span>新增小窗口</span><span aria-hidden="true">+</span>'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        window.parent.postMessage({ type: 'editor:add-gallery', galleryId }, '*')
      })
      heading.appendChild(button)
    }
  })
  document.querySelectorAll<HTMLElement>('.clean-contact-cards > div').forEach((card, index) => {
    card.querySelector('span')?.setAttribute('data-editor-text-key', `contact-card-${index}-label`)
    card.querySelector('strong')?.setAttribute('data-editor-text-key', `contact-card-${index}-value`)
  })
  document.querySelector('.clean-qr-panel > span')?.setAttribute('data-editor-text-key', 'contact-qr-label')
  document.querySelector('.clean-qr-panel > small')?.setAttribute('data-editor-text-key', 'contact-qr-number')
  const pageImage = getBackgroundOverride(state, '__page_background_image__', page)
  const pageVideo = getBackgroundOverride(state, '__page_background_video__', page)
  const backgroundRoot = document.querySelector<HTMLElement>('[data-editor-page-background]') ?? (() => {
    const root = document.createElement('div')
    root.dataset.editorPageBackground = 'true'
    root.setAttribute('aria-hidden', 'true')
    root.innerHTML = '<div data-editor-page-background-image></div><video data-editor-page-background-video autoplay muted loop playsinline></video>'
    document.body.prepend(root)
    return root
  })()
  const backgroundImage = backgroundRoot.querySelector<HTMLElement>('[data-editor-page-background-image]')
  const backgroundVideo = backgroundRoot.querySelector<HTMLVideoElement>('[data-editor-page-background-video]')
  const imageDisabled = Boolean(pageImage?.hidden && !pageImage.src)
  const videoDisabled = Boolean(pageVideo?.hidden && !pageVideo.src)
  const imageSrc = pickDeviceSrc(pageImage)
  const videoSrc = pickDeviceSrc(pageVideo)
  const imageActive = Boolean(imageSrc && !imageDisabled)
  const videoActive = Boolean(videoSrc && !videoDisabled)
  const customBackgroundActive = imageActive || videoActive
  if (backgroundImage) {
    const nextBackgroundImage = imageActive ? `url("${imageSrc}")` : ''
    if (backgroundImage.style.backgroundImage !== nextBackgroundImage) backgroundImage.style.backgroundImage = nextBackgroundImage
    if (backgroundImage.hidden !== !imageActive) backgroundImage.hidden = !imageActive
  }
  if (backgroundVideo) {
    if (backgroundVideo.hidden !== !videoActive) backgroundVideo.hidden = !videoActive
    if (videoActive && backgroundVideo.getAttribute('src') !== videoSrc) {
      backgroundVideo.src = videoSrc
      backgroundVideo.load()
      void backgroundVideo.play().catch(() => undefined)
    }
    if (!videoActive && (backgroundVideo.getAttribute('src') || backgroundVideo.currentSrc)) {
      backgroundVideo.removeAttribute('src')
      backgroundVideo.load()
    }
  }
  if (backgroundRoot.hidden !== (!imageActive && !videoActive)) backgroundRoot.hidden = !imageActive && !videoActive
  document.body.classList.toggle('editor-page-background-active', imageActive || videoActive)

  const defaultSceneImage = document.querySelector<HTMLImageElement>('[data-editor-media-key="home-scene-image"]')
  const defaultSceneVideo = document.querySelector<HTMLVideoElement>('[data-editor-media-key="home-scene-video"]')
  if (defaultSceneImage && defaultSceneImage.hidden !== (imageDisabled || customBackgroundActive)) defaultSceneImage.hidden = imageDisabled || customBackgroundActive
  if (defaultSceneVideo && defaultSceneVideo.hidden !== (videoDisabled || customBackgroundActive)) defaultSceneVideo.hidden = videoDisabled || customBackgroundActive

  const audioOverride = getPageOverride(state, '__page_audio__', page)
  const audioActive = Boolean(audioOverride?.page === page && audioOverride.src)
  const audioDisabled = Boolean(audioOverride?.page === page && audioOverride.hidden && !audioOverride.src)
  const existingAudio = document.querySelector<HTMLAudioElement>('audio[data-editor-page-audio]')
  if (!audioActive && existingAudio) {
    existingAudio.pause()
    existingAudio.removeAttribute('src')
    existingAudio.load()
    existingAudio.remove()
  }
  document.querySelectorAll<HTMLAudioElement>('audio[data-editor-media-key]').forEach((audio) => {
    if (audioDisabled) {
      audio.dataset.editorPageDisabled = 'true'
      audio.hidden = true
      audio.muted = true
      audio.pause()
    } else {
      delete audio.dataset.editorPageDisabled
      audio.hidden = false
    }
  })

  Object.values(state.overrides).forEach((override) => {
    if (!editorOverrideAppliesToPage(override, page)) return
    if (isLegacyGalleryHeadingOverride(override)) return
    if (override.selector === '__page_background_image__' || override.selector === '__page_background_video__') return
    if (override.selector === '__page_audio__' && override.src) {
       let audio = document.querySelector<HTMLAudioElement>('audio[data-editor-page-audio]')
       if (!audio) {
         audio = document.querySelector<HTMLAudioElement>('audio')
         if (audio) audio.dataset.editorPageAudio = 'true'
       }
       if (!audio) { audio = document.createElement('audio'); audio.dataset.editorPageAudio = 'true'; audio.loop = true; audio.autoplay = true; audio.hidden = true; document.body.appendChild(audio) }
      if (audio.src !== new URL(override.src, window.location.href).href) { audio.src = override.src; audio.load(); void audio.play().catch(() => undefined) }
      return
    }
    let elements: Element[] = []
    try { elements = Array.from(document.querySelectorAll(override.selector)) } catch { elements = [] }
    elements.forEach((element) => {
      if (!(element instanceof HTMLElement)) return
      const targetElement = override.kind === 'image' && !(element instanceof HTMLImageElement)
        ? element.querySelector<HTMLImageElement>('img[data-editor-insert-id]') ?? element
        : element
      if ((override.kind === 'text' || (override.kind === 'element' && isTextLeaf(targetElement))) && override.value !== undefined && targetElement.textContent !== override.value) {
        targetElement.textContent = override.value
      }
      if (targetElement instanceof HTMLImageElement) {
        const chosenSrc = pickDeviceSrc(override)
        if (chosenSrc && targetElement.getAttribute('src') !== chosenSrc) targetElement.src = chosenSrc
        if (override.alt !== undefined && targetElement.alt !== override.alt) targetElement.alt = override.alt
      }
      if (targetElement instanceof HTMLVideoElement || targetElement instanceof HTMLAudioElement) {
        if (override.src && targetElement.getAttribute('src') !== override.src) {
          targetElement.src = override.src
          targetElement.load()
          if (targetElement instanceof HTMLVideoElement) void targetElement.play().catch(() => undefined)
        }
      }
      if (targetElement.hidden !== Boolean(override.hidden)) targetElement.hidden = Boolean(override.hidden)
      applyStyles(targetElement, override.styles)
      if (override.parentStyles && targetElement.parentElement) applyStyles(targetElement.parentElement, override.parentStyles)
    })
  })

  const editorPreview = document.body.classList.contains('editor-preview-mode')
  const visibleInsertions = state.insertions.filter((item) => (
    insertionAppliesToPage(item.page, page) && (editorPreview || !isPlaceholderSrc(item.src))
  ))
  const activeInsertionIds = new Set(visibleInsertions.map((item) => item.id))
  document.querySelectorAll<HTMLElement>('[data-editor-insert-kind]').forEach((element) => {
    if (!activeInsertionIds.has(element.dataset.editorInsertId ?? '')) element.remove()
  })

  visibleInsertions.forEach((item) => {
    const reactRendered = document.querySelector<HTMLElement>(`[data-editor-card-id="${escapeSelector(item.id)}"]`)
    if (reactRendered) {
      document.querySelectorAll<HTMLElement>(`[data-editor-insert-kind][data-editor-insert-id="${escapeSelector(item.id)}"]`).forEach((element) => {
        if (element !== reactRendered) element.remove()
      })
    }
    const existing = reactRendered ?? document.querySelector<HTMLElement>(`[data-editor-insert-kind][data-editor-insert-id="${escapeSelector(item.id)}"]`)
    if (existing) {
      const image = existing.querySelector<HTMLImageElement>('img')
      const placeholder = isPlaceholderSrc(image?.getAttribute('src'))
      existing.classList.toggle('is-placeholder', placeholder)
      let hint = existing.querySelector('.editor-insert-placeholder-hint')
      if (placeholder && !hint) {
        hint = document.createElement('span')
        hint.className = 'editor-insert-placeholder-hint'
        existing.appendChild(hint)
      } else if (!placeholder) { hint?.remove(); hint = null }
      if (placeholder && hint) {
        const nextText = editorPreview ? '点击上传图片' : '图片待上传'
        if (hint.textContent !== nextText) hint.textContent = nextText
      }
      existing.setAttribute('aria-label', placeholder ? (editorPreview ? '新增小窗口，点击上传图片' : '图片待上传') : '预览大图')
      return
    }
    const parent = resolveInsertionParent(item.parentSelector)
    if (!parent) return
    const element = document.createElement(item.kind === 'image' ? 'button' : 'div') as HTMLElement
    element.setAttribute('data-editor-insert-id', item.id)
    element.setAttribute('data-editor-insert-kind', item.kind)
    if (item.kind === 'image') {
      ;(element as HTMLButtonElement).type = 'button'
      const placeholder = isPlaceholderSrc(item.src)
      element.className = 'pure-gallery-card' + (placeholder ? ' is-placeholder' : '')
      const image = document.createElement('img')
      element.setAttribute('aria-label', placeholder ? (editorPreview ? '新增小窗口，点击上传图片' : '图片待上传') : '预览大图')
      image.setAttribute('data-editor-insert-id', item.id)
      image.setAttribute('data-editor-insert-image', 'true')
      image.setAttribute('src', item.src || '/placeholders/black.svg')
      image.setAttribute('alt', item.alt || '')
      applyStyles(image, item.styles)
      applyStyles(element, { 'aspect-ratio': '16 / 9', ...(item.styles?.['aspect-ratio'] ? { 'aspect-ratio': item.styles['aspect-ratio'] } : {}) })
      element.appendChild(image)
      if (placeholder) {
        const hint = document.createElement('span')
        hint.className = 'editor-insert-placeholder-hint'
        hint.textContent = editorPreview ? '点击上传图片' : '图片待上传'
        element.appendChild(hint)
      }
    } else {
      element.textContent = item.value || '新文字'
    }
    if (item.kind !== 'image') applyStyles(element as HTMLElement, item.styles)
    if (item.insertPosition === 'start') parent.prepend(element)
    else parent.appendChild(element)
  })

  syncPlaceholderCards()
}

export function EditorRuntime() {
  const location = useLocation()

  useLayoutEffect(() => {
    if (location.pathname === '/editor') {
      document.documentElement.classList.remove('editor-content-loading')
      return undefined
    }

    // Route changes mount new default content before the async editor state can be applied.
    // Keep that DOM out of the first paint so defaults never flash between pages.
    document.documentElement.classList.add('editor-content-loading')
    let mounted = true
    const preview = new URLSearchParams(window.location.search).get('editorPreview') === '1'
    const pageHash = ['#works', '#pricing', '#contact'].includes(location.hash) ? location.hash : ''
    const page = location.pathname + pageHash
    const cacheKey = editorStateCacheKey(preview)
    let currentState = editorStateCache.get(cacheKey) ?? defaultEditorState
    let stateReceivedFromParent = false
    let applying = false
    let applyQueued = false
    const applyCurrentState = () => {
      if (!mounted || applying) return
      applying = true
      applyState(currentState, page)
      applying = false
    }
    const scheduleApply = () => {
      if (applyQueued) return
      applyQueued = true
      window.requestAnimationFrame(() => {
        applyQueued = false
        applyCurrentState()
      })
    }
    const revealContent = () => {
      if (mounted) document.documentElement.classList.remove('editor-content-loading')
    }
    const loadAndApply = async () => {
      const loadedState = await loadEditorState(preview)
      if (!mounted) return
      if (!stateReceivedFromParent) {
        currentState = loadedState
        try { applyCurrentState() } finally { revealContent() }
      }
    }

    const observer = new MutationObserver(() => {
      if (!applying) scheduleApply()
    })
    if (document.body) observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'hidden'],
    })
    if (editorStateCache.has(cacheKey)) {
      try { applyCurrentState() } finally { revealContent() }
    } else {
      void loadAndApply()
    }
    if (!preview) return () => { mounted = false; observer.disconnect() }

    addPreviewStyles()
    document.body.classList.add('editor-preview-mode')
    let previewMode: 'edit' | 'browse' = new URLSearchParams(window.location.search).get('editorMode') === 'browse' ? 'browse' : 'edit'
    document.body.classList.toggle('editor-preview-browse', previewMode === 'browse')
    document.body.classList.toggle('editor-preview-edit', previewMode === 'edit')
    let active: Element | null = null
    const select = (element: Element) => {
      active?.classList.remove('editor-preview-selected')
      active = element
      active.classList.add('editor-preview-selected')
      const message = { type: 'editor:select', selection: selectionFromElement(element, page) satisfies EditorSelection }
      window.parent.postMessage(message, '*')
    }
    const onClick = (event: MouseEvent) => {
      const rawTarget = event.target instanceof Element ? event.target : null
      if (previewMode === 'edit' && rawTarget && shouldPassThroughInEdit(rawTarget)) return
      const target = findTarget(event.target)
      if (!target) return
      if (previewMode === 'browse') {
        if (target instanceof HTMLImageElement && target.dataset.editorInsertId && target.src) {
          event.preventDefault()
          const overlay = document.createElement('div')
          overlay.setAttribute('data-editor-insert-lightbox', 'true')
          overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.86);cursor:zoom-out'
          const image = document.createElement('img')
          image.src = target.src
          image.alt = target.alt
          image.style.cssText = 'max-width:94vw;max-height:92vh;object-fit:contain;border-radius:12px'
          overlay.appendChild(image)
          overlay.addEventListener('click', () => overlay.remove(), { once: true })
          document.body.appendChild(overlay)
          return
        }
        const link = target.closest('a')
        if (link instanceof HTMLAnchorElement && link.href) {
          const nextUrl = new URL(link.href, window.location.href)
          if (nextUrl.origin === window.location.origin) {
            event.preventDefault()
            window.parent.postMessage({ type: 'editor:navigate', path: nextUrl.pathname + nextUrl.search + nextUrl.hash }, '*')
          }
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      select(target)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'editor:state' && event.data.state) {
        stateReceivedFromParent = true
        currentState = event.data.state as EditorState
        editorStateCache.set(cacheKey, currentState)
        try { applyCurrentState() } finally { revealContent() }
        return
      }
      if (event.data?.type === 'editor:mode' && (event.data.mode === 'edit' || event.data.mode === 'browse')) {
        previewMode = event.data.mode
        document.body.classList.toggle('editor-preview-browse', previewMode === 'browse')
        document.body.classList.toggle('editor-preview-edit', previewMode === 'edit')
        return
      }
      if (event.data?.type !== 'editor:highlight' || typeof event.data.selector !== 'string') return
      const target = document.querySelector(event.data.selector)
      if (target) select(target)
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('message', onMessage)

    // 拖拽文件到预览窗口内具体图片/窗口时，高亮目标并通知父级编辑器
    let dragHighlight: HTMLElement | null = null
    const onDragOver = (event: DragEvent) => {
      if (previewMode !== 'edit') return
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      const target = findTarget(event.target)
      const imageTarget = target instanceof HTMLImageElement ? target : target?.querySelector('img')
      if (imageTarget && imageTarget !== dragHighlight) {
        dragHighlight?.classList.remove('editor-drag-highlight')
        dragHighlight = imageTarget.closest('button') as HTMLElement ?? imageTarget
        dragHighlight.classList.add('editor-drag-highlight')
      }
    }
    const onDragLeave = (event: DragEvent) => {
      if (!event.relatedTarget || !(event.currentTarget as Node).contains(event.relatedTarget as Node)) {
        dragHighlight?.classList.remove('editor-drag-highlight')
        dragHighlight = null
      }
    }
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dragHighlight?.classList.remove('editor-drag-highlight')
      dragHighlight = null
      if (previewMode !== 'edit') return
      const target = findTarget(event.target)
      if (!target) return
      // 选中被拖拽到的元素
      select(target)
      // 通知父编辑器有文件被拖入
      const file = event.dataTransfer?.files?.[0]
      if (file) {
        window.parent.postMessage({ type: 'editor:drop-file', fileName: file.name, fileType: file.type, fileSize: file.size }, '*')
      }
    }
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('dragleave', onDragLeave, true)
    document.addEventListener('drop', onDrop, true)

    return () => {
      mounted = false
      observer.disconnect()
      document.body.classList.remove('editor-page-background-active')
      document.body.classList.remove('editor-preview-mode')
      document.body.classList.remove('editor-preview-browse')
      document.body.classList.remove('editor-preview-edit')
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('dragleave', onDragLeave, true)
      document.removeEventListener('drop', onDrop, true)
    }
  }, [location.hash, location.pathname])

  return null
}
