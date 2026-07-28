import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { editorOverrideAppliesToPage, editorOverrideKey, EditorOverride, EditorSelection, EditorState, getEditorOverride } from './types'
import { cacheEditorState, getCachedEditorState, loadEditorState } from './contentState'

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
  if (element instanceof HTMLElement && element.dataset.editorContactButtonId) {
    return `[data-editor-contact-button-id="${escapeSelector(element.dataset.editorContactButtonId)}"]`
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
  const contactButton = element.closest('[data-editor-contact-button-id]')
  const kind = contactButton ? 'element' : element.tagName === 'IMG' ? 'image' : element.tagName === 'VIDEO' ? 'video' : element.tagName === 'AUDIO' ? 'audio' : element.matches(editableTags) || isTextLeaf(element) ? 'text' : 'element'
  const insertionId = element instanceof HTMLElement ? element.dataset.editorInsertId : undefined
  const parent = element.parentElement ?? document.body
  const gallery = element.closest('[data-editor-gallery-id]')
  const galleryCard = element.closest<HTMLElement>('[data-editor-gallery-image-id]')
  return {
    selector: selectorFor(element),
    parentSelector: selectorFor(parent),
    containerSelector: gallery ? selectorFor(gallery) : undefined,
    galleryId: gallery instanceof HTMLElement ? gallery.dataset.editorGalleryId : undefined,
    galleryImageId: galleryCard?.dataset.editorGalleryImageId,
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
      'input,textarea,select,[contenteditable="true"],[role="tab"],.prompt-accordion-trigger,.prompt-list-open,.copy-button,.prompt-details-button,.modal-close,.editor-gallery-add,.editor-gallery-section-actions,.editor-insert-delete,.editor-contact-resize-handle,.page-audio-control,.clean-audio-control',
    ),
  )
}

function addPreviewStyles() {
  if (document.getElementById('editor-preview-style')) return
  const style = document.createElement('style')
  style.id = 'editor-preview-style'
  style.textContent = `
    .editor-preview-selected { outline: 2px solid #dfff3f !important; outline-offset: 4px !important; cursor: crosshair !important; }
    body.editor-preview-edit .editor-preview-selected,
    body.editor-preview-edit .editor-preview-selected-card { position: relative !important; z-index: 1000 !important; }
    @media (min-width: 761px) {
      body.editor-preview-edit .clean-rail-window:has(.editor-preview-selected-card) { overflow: visible !important; z-index: 1001 !important; mask-image: none !important; -webkit-mask-image: none !important; }
    }
    .editor-drag-highlight { outline: 3px dashed #ffd700 !important; outline-offset: 3px !important; opacity: .85 !important; }
    body.editor-preview-edit [data-editor-insert-id],
    body.editor-preview-edit [data-editor-gallery-image-id] { touch-action: pan-y; }
    .editor-reorder-dragging { z-index: 20 !important; opacity: .68 !important; transform: scale(.98) !important; transition: none !important; }
    .editor-reorder-target { outline: 2px solid #dfff3f !important; outline-offset: 4px !important; }
    .editor-reorder-target.editor-reorder-before { box-shadow: inset 0 4px 0 #dfff3f !important; }
    .editor-reorder-target.editor-reorder-after { box-shadow: inset 0 -4px 0 #dfff3f !important; }
    [data-editor-insert-id] { cursor: crosshair !important; }
    body.editor-preview-edit [data-editor-contact-button-id] { cursor: move !important; }
    body.editor-preview-edit .editor-contact-resize-handle { position:absolute; right:5px; bottom:5px; z-index:12; width:16px; height:16px; border:1px solid rgba(223,255,63,.85); border-radius:4px; background:rgba(10,24,18,.82); cursor:nwse-resize !important; }
    body.editor-preview-edit .editor-contact-resize-handle::after { content:''; position:absolute; right:3px; bottom:3px; width:6px; height:6px; border-right:2px solid #dfff3f; border-bottom:2px solid #dfff3f; }
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
    body.editor-preview-browse .editor-gallery-add,
    body.editor-preview-browse .editor-gallery-section-actions,
    body.editor-preview-browse .editor-insert-delete,
    body.editor-preview-browse .editor-insert-placeholder-hint { display: none !important; }
    body.editor-preview-browse .editor-preview-selected { outline: none !important; cursor: inherit !important; }
    body.editor-preview-browse [data-editor-insert-id] { cursor: zoom-in !important; }
    .editor-gallery-section-actions { display: inline-flex; align-items: center; gap: 6px; margin-left: 12px; vertical-align: middle; }
    .editor-gallery-section-actions button { padding: 5px 8px; color: #dfff3f; border: 1px solid rgba(223,255,63,.42); border-radius: 5px; background: rgba(10,20,15,.82); cursor: pointer; font: inherit; font-size: 10px; }
    .editor-gallery-section-actions button:hover { background: rgba(223,255,63,.16); }
    .editor-gallery-section-actions .editor-gallery-section-delete { color: #ffc1c1; border-color: rgba(255,140,140,.42); }
    .editor-insert-delete { position: absolute; z-index: 8; top: 8px; right: 8px; display: grid; place-items: center; width: 26px; height: 26px; color: #fff; border: 1px solid rgba(255,255,255,.45); border-radius: 50%; background: rgba(110,20,20,.88); box-shadow: 0 5px 15px rgba(0,0,0,.35); cursor: pointer; font: 20px/1 Arial, sans-serif; }
    .editor-insert-delete:hover, .editor-insert-delete:focus-visible { background: #d33; outline: 2px solid #fff; outline-offset: 2px; }
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

const galleryCardStyleNames = new Set([
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'aspect-ratio', 'margin', 'border-radius', 'position', 'top', 'right',
  'bottom', 'left', 'transform', 'z-index', 'grid-column', 'grid-row',
])

function applyGalleryCardStyles(element: HTMLElement, styles: Record<string, string> | undefined) {
  if (!styles) return
  const card = element.closest<HTMLElement>('[data-gallery-image-card], [data-editor-insert-kind="image"]')
  if (!card) return
  const cardStyles = Object.fromEntries(Object.entries(styles).filter(([property]) => {
    const normalized = property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
    return galleryCardStyleNames.has(normalized)
  }))
  applyStyles(card, cardStyles)
}

function getBackgroundOverride(state: EditorState, selector: string, page: string) {
  const pageOverride = getEditorOverride(state, selector, page)
  if (pageOverride) return pageOverride
  // Inner pages use the current home background until they receive their own setting.
  if (page !== '/' && page !== '/#contact') return getEditorOverride(state, selector, '/')
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

function editorStateCacheKey(preview: boolean) {
  return preview ? 'preview' : 'published'
}

function pickDeviceSrc(override: { src?: string; srcMobile?: string } | undefined) {
  if (!override) return ''
  if (mobileMedia?.matches && override.srcMobile) return override.srcMobile
  return override.src ?? ''
}

function pickInsertionSrc(insertion: { src?: string; srcMobile?: string }) {
  if (mobileMedia?.matches && insertion.srcMobile) return insertion.srcMobile
  return insertion.src ?? ''
}

let backgroundPanCleanup: (() => void) | null = null
let backgroundVideoCleanup: (() => void) | null = null
let backgroundVideoBinding: HTMLVideoElement | null = null

function syncBackgroundVideoPlayback(video: HTMLVideoElement, active: boolean) {
  if (backgroundVideoBinding !== video) {
    backgroundVideoCleanup?.()
    backgroundVideoBinding = video
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      if (!active || document.hidden || reducedMotion.matches) video.pause()
      else void video.play().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', sync)
    reducedMotion.addEventListener('change', sync)
    backgroundVideoCleanup = () => {
      document.removeEventListener('visibilitychange', sync)
      reducedMotion.removeEventListener('change', sync)
      video.pause()
      backgroundVideoBinding = null
      backgroundVideoCleanup = null
    }
  }
  if (!active || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) video.pause()
  else void video.play().catch(() => undefined)
}

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
        window.parent.postMessage({ type: 'editor:add-gallery', galleryId }, window.location.origin)
      })
      heading.appendChild(button)
    }
    if (!heading.querySelector('.editor-gallery-section-actions')) {
      const actions = document.createElement('span')
      actions.className = 'editor-gallery-section-actions'
      const addSection = document.createElement('button')
      addSection.type = 'button'
      addSection.className = 'editor-gallery-section-add'
      addSection.textContent = '新增大模块'
      addSection.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        window.parent.postMessage({ type: 'editor:add-gallery-section' }, window.location.origin)
      })
      const deleteSection = document.createElement('button')
      deleteSection.type = 'button'
      deleteSection.className = 'editor-gallery-section-delete'
      deleteSection.textContent = '删除模块'
      deleteSection.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        window.parent.postMessage({ type: 'editor:delete-gallery-section', galleryId }, window.location.origin)
      })
      actions.append(addSection, deleteSection)
      heading.appendChild(actions)
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
    root.innerHTML = '<div data-editor-page-background-image></div><video data-editor-page-background-video autoplay muted loop playsinline preload="metadata"></video>'
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
    backgroundVideo.preload = 'metadata'
    backgroundVideo.setAttribute('fetchpriority', 'low')
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
    syncBackgroundVideoPlayback(backgroundVideo, videoActive)
  }
  if (backgroundRoot.hidden !== (!imageActive && !videoActive)) backgroundRoot.hidden = !imageActive && !videoActive
  document.body.classList.toggle('editor-page-background-active', imageActive || videoActive)

  const defaultSceneImage = document.querySelector<HTMLImageElement>('[data-editor-media-key="home-scene-image"]')
  const defaultSceneVideo = document.querySelector<HTMLVideoElement>('[data-editor-media-key="home-scene-video"]')
  if (defaultSceneImage && defaultSceneImage.hidden !== (imageDisabled || customBackgroundActive)) defaultSceneImage.hidden = imageDisabled || customBackgroundActive
  if (defaultSceneVideo && defaultSceneVideo.hidden !== (videoDisabled || customBackgroundActive)) defaultSceneVideo.hidden = videoDisabled || customBackgroundActive

  const audioOverride = getEditorOverride(state, '__page_audio__', page)
  const pageAudioOverrides = Object.values(state.overrides).filter((override) => override.selector === '__page_audio__' && editorOverrideAppliesToPage(override, page))
  const audioActive = Boolean(audioOverride?.src && !audioOverride.hidden)
  const audioDisabled = Boolean(pageAudioOverrides.some((override) => override.hidden && !override.src))
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
      if (targetElement instanceof HTMLImageElement) applyGalleryCardStyles(targetElement, override.styles)
      if (override.parentStyles && targetElement.parentElement) applyStyles(targetElement.parentElement, override.parentStyles)
    })
  })

  const editorPreview = document.body.classList.contains('editor-preview-mode')
  const ensureInsertionDeleteControl = (element: HTMLElement, insertionId: string) => {
    const current = element.querySelector<HTMLElement>('.editor-insert-delete')
    if (!editorPreview) {
      current?.remove()
      return
    }
    if (current) return
    const control = document.createElement('span')
    control.className = 'editor-insert-delete'
    control.setAttribute('role', 'button')
    control.setAttribute('tabindex', '0')
    control.setAttribute('aria-label', '删除这张图片')
    control.setAttribute('title', '删除这张图片')
    control.textContent = '×'
    const removeImage = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      window.parent.postMessage({ type: 'editor:delete-insertion', insertionId }, window.location.origin)
    }
    control.addEventListener('click', removeImage)
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') removeImage(event)
    })
    element.appendChild(control)
  }
  const ensureGalleryImageDeleteControl = (element: HTMLElement) => {
    const galleryId = element.closest<HTMLElement>('[data-editor-gallery-id]')?.dataset.editorGalleryId
    const imageId = element.dataset.editorGalleryImageId
    if (!galleryId || !imageId || element.dataset.editorInsertId) return
    const current = element.querySelector<HTMLElement>('.editor-insert-delete')
    if (!editorPreview) {
      current?.remove()
      return
    }
    if (current) return
    const control = document.createElement('span')
    control.className = 'editor-insert-delete'
    control.setAttribute('role', 'button')
    control.setAttribute('tabindex', '0')
    control.setAttribute('aria-label', '删除这张图片')
    control.setAttribute('title', '删除这张图片')
    control.textContent = '×'
    const removeImage = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      window.parent.postMessage({ type: 'editor:delete-gallery-image', galleryId, imageId }, window.location.origin)
    }
    control.addEventListener('click', removeImage)
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') removeImage(event)
    })
    element.appendChild(control)
  }
  const ensureContactButtonResizeControl = (element: HTMLElement) => {
    const current = element.querySelector<HTMLElement>('.editor-contact-resize-handle')
    if (!editorPreview) {
      current?.remove()
      return
    }
    if (current) return
    const handle = document.createElement('span')
    handle.className = 'editor-contact-resize-handle'
    handle.setAttribute('role', 'button')
    handle.setAttribute('tabindex', '0')
    handle.setAttribute('aria-label', '调整 QQ 联系按钮大小')
    handle.setAttribute('title', '拖动调整大小')
    element.appendChild(handle)
  }
  const visibleInsertions = state.insertions.filter((item) => (
    insertionAppliesToPage(item.page, page) && (editorPreview || !isPlaceholderSrc(pickInsertionSrc(item)))
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
      applyStyles(image ?? existing, item.styles)
      applyGalleryCardStyles(image ?? existing, item.styles)
      const placeholder = isPlaceholderSrc(image?.getAttribute('src'))
      existing.classList.toggle('is-placeholder', placeholder)
      let hint = existing.querySelector('.editor-insert-placeholder-hint')
      if (placeholder && !hint) {
        hint = document.createElement('span')
        hint.className = 'editor-insert-placeholder-hint'
        existing.appendChild(hint)
      } else if (!placeholder) { hint?.remove(); hint = null }
      if (item.kind === 'image') ensureInsertionDeleteControl(existing, item.id)
      if (placeholder && hint) {
        const nextText = editorPreview ? '点击上传图片' : '图片待上传'
        if (hint.textContent !== nextText) hint.textContent = nextText
      }
      existing.setAttribute('aria-label', placeholder ? (editorPreview ? '新增小窗口，点击上传图片' : '图片待上传') : '预览大图')
      return
    }
    const parent = resolveInsertionParent(item.parentSelector)
    if (!parent) return
    const element = document.createElement('div') as HTMLElement
    element.setAttribute('data-editor-insert-id', item.id)
    element.setAttribute('data-editor-insert-kind', item.kind)
    const galleryId = parent instanceof HTMLElement ? parent.dataset.editorGalleryId : undefined
    if (galleryId && item.kind === 'image') {
      element.setAttribute('data-editor-gallery-image-id', item.id)
    }
    if (item.kind === 'image') {
      element.setAttribute('role', 'button')
      element.setAttribute('tabindex', '0')
      const insertionSrc = pickInsertionSrc(item)
      const placeholder = isPlaceholderSrc(insertionSrc)
      element.className = 'pure-gallery-card' + (placeholder ? ' is-placeholder' : '')
      const image = document.createElement('img')
      element.setAttribute('aria-label', placeholder ? (editorPreview ? '新增小窗口，点击上传图片' : '图片待上传') : '预览大图')
      image.setAttribute('data-editor-insert-id', item.id)
      image.setAttribute('data-editor-insert-image', 'true')
      image.setAttribute('src', insertionSrc || '/placeholders/black.svg')
      image.setAttribute('alt', item.alt || '')
      applyStyles(image, item.styles)
      applyGalleryCardStyles(image, item.styles)
      applyStyles(element, { 'aspect-ratio': '16 / 9', ...(item.styles?.['aspect-ratio'] ? { 'aspect-ratio': item.styles['aspect-ratio'] } : {}) })
      element.appendChild(image)
      if (placeholder) {
        const hint = document.createElement('span')
        hint.className = 'editor-insert-placeholder-hint'
        hint.textContent = editorPreview ? '点击上传图片' : '图片待上传'
        element.appendChild(hint)
      }
      ensureInsertionDeleteControl(element, item.id)
    } else {
      element.textContent = item.value || '新文字'
    }
    if (item.kind !== 'image') applyStyles(element as HTMLElement, item.styles)
    if (item.insertPosition === 'start') parent.prepend(element)
    else parent.appendChild(element)
  })

  document.querySelectorAll<HTMLElement>('[data-editor-gallery-image-id]').forEach(ensureGalleryImageDeleteControl)
  document.querySelectorAll<HTMLElement>('[data-editor-contact-button-id]').forEach(ensureContactButtonResizeControl)

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
    let currentState = getCachedEditorState(preview)
    let stateReceivedFromParent = false
    let applying = false
    let applyQueued = false
    const applyCurrentState = () => {
      if (!mounted || applying) return
      applying = true
      if (currentState) applyState(currentState, page)
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
      if (!stateReceivedFromParent && loadedState) {
        currentState = loadedState
        try { applyCurrentState() } finally { revealContent() }
      }
    }

    const scheduleObserverApply = () => {
      if (!applying) scheduleApply()
    }
    const contentObserver = new MutationObserver(scheduleObserverApply)
    let observedRoot: Element | null = null
    const attachContentObserver = () => {
      const nextRoot = document.querySelector('.route-transition') ?? document.body
      if (nextRoot === observedRoot) return
      contentObserver.disconnect()
      observedRoot = nextRoot
      contentObserver.observe(nextRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'hidden'],
      })
    }
    attachContentObserver()
    const routeObserver = new MutationObserver(() => {
      attachContentObserver()
      scheduleObserverApply()
    })
    if (document.body) routeObserver.observe(document.body, { childList: true })
    if (currentState) {
      try { applyCurrentState() } finally { revealContent() }
    } else {
      void loadAndApply()
    }
    if (!preview) return () => { mounted = false; contentObserver.disconnect(); routeObserver.disconnect() }

    addPreviewStyles()
    document.body.classList.add('editor-preview-mode')
    let previewMode: 'edit' | 'browse' = new URLSearchParams(window.location.search).get('editorMode') === 'browse' ? 'browse' : 'edit'
    document.body.classList.toggle('editor-preview-browse', previewMode === 'browse')
    document.body.classList.toggle('editor-preview-edit', previewMode === 'edit')
    let active: Element | null = null
    type ReorderDrag = {
      card: HTMLElement
      gallery: HTMLElement
      imageId: string
      galleryId: string
      startX: number
      startY: number
      active: boolean
      target: HTMLElement | null
      placement: 'before' | 'after' | null
    }
    let reorderDrag: ReorderDrag | null = null
    type ContactLayoutDrag = {
      element: HTMLElement
      container: HTMLElement
      buttonId: string
      mode: 'move' | 'resize'
      startX: number
      startY: number
      startLeft: number
      startTop: number
      startWidth: number
      startHeight: number
      containerWidth: number
      containerHeight: number
      active: boolean
    }
    let contactLayoutDrag: ContactLayoutDrag | null = null
    let suppressClickUntil = 0
    const getGalleryCard = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null
      const card = target.closest<HTMLElement>('[data-editor-gallery-image-id], [data-editor-insert-kind="image"][data-editor-insert-id]')
      const gallery = card?.closest<HTMLElement>('[data-editor-gallery-id]')
      if (!card || !gallery) return null
      const imageId = card.dataset.editorGalleryImageId || card.dataset.editorInsertId
      const galleryId = gallery.dataset.editorGalleryId
      if (!imageId || !galleryId) return null
      return { card, gallery, imageId, galleryId }
    }
    const getContactButton = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null
      const element = target.closest<HTMLElement>('[data-editor-contact-button-id]')
      const container = element?.closest<HTMLElement>('.clean-contact-buttons')
      const buttonId = element?.dataset.editorContactButtonId
      if (!element || !container || !buttonId) return null
      return { element, container, buttonId, resize: Boolean(target.closest('.editor-contact-resize-handle')) }
    }
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const contactLayoutStyles = (drag: ContactLayoutDrag, left: number, top: number, width: number, height: number) => ({
      position: 'absolute',
      left: `${Math.round((left / Math.max(1, drag.containerWidth)) * 10000) / 100}%`,
      top: `${Math.round((top / Math.max(1, drag.containerHeight)) * 10000) / 100}%`,
      width: `${Math.round((width / Math.max(1, drag.containerWidth)) * 10000) / 100}%`,
      height: `${Math.round(height)}px`,
      'grid-column': 'auto',
      'z-index': '2',
    })
    const applyContactLayout = (drag: ContactLayoutDrag, left: number, top: number, width: number, height: number) => {
      const styles = contactLayoutStyles(drag, left, top, width, height)
      Object.entries(styles).forEach(([property, value]) => drag.element.style.setProperty(property, value))
      drag.element.dataset.editorContactLayoutActive = 'true'
      return styles
    }
    const finishContactLayout = (commit: boolean) => {
      const drag = contactLayoutDrag
      if (!drag) return
      try { drag.element.releasePointerCapture?.((drag.element as HTMLElement & { __editorPointerId?: number }).__editorPointerId ?? -1) } catch { /* pointer capture may already be released */ }
      drag.element.classList.remove('editor-contact-layout-dragging')
      contactLayoutDrag = null
      if (!commit || !drag.active) return
      suppressClickUntil = performance.now() + 450
      const rect = drag.element.getBoundingClientRect()
      const containerRect = drag.container.getBoundingClientRect()
      const left = clamp(rect.left - containerRect.left, 0, Math.max(0, containerRect.width - 80))
      const top = Math.max(0, rect.top - containerRect.top)
      const styles = contactLayoutStyles(drag, left, top, Math.max(80, rect.width), Math.max(54, rect.height))
      window.parent.postMessage({ type: 'editor:update-contact-button-layout', buttonId: drag.buttonId, styles }, window.location.origin)
    }
    const clearReorderTarget = () => {
      if (!reorderDrag?.target) return
      reorderDrag.target.classList.remove('editor-reorder-target', 'editor-reorder-before', 'editor-reorder-after')
      reorderDrag.target = null
      reorderDrag.placement = null
    }
    const updateReorderTarget = (clientX: number, clientY: number) => {
      if (!reorderDrag) return
      const candidates = Array.from(reorderDrag.gallery.querySelectorAll<HTMLElement>('[data-editor-gallery-image-id], [data-editor-insert-kind="image"][data-editor-insert-id]'))
        .filter((candidate) => candidate !== reorderDrag?.card)
      if (!candidates.length) {
        clearReorderTarget()
        return
      }
      const measured = candidates
        .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
        .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left)
      const hit = measured.find(({ rect }) => clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom)
      const nearest = hit ?? measured.reduce((best, item) => {
        const bestDistance = Math.abs(clientY - (best.rect.top + best.rect.height / 2))
        const itemDistance = Math.abs(clientY - (item.rect.top + item.rect.height / 2))
        return itemDistance < bestDistance ? item : best
      })
      const placement = clientY < nearest.rect.top + nearest.rect.height / 2 ? 'before' : 'after'
      clearReorderTarget()
      reorderDrag.target = nearest.candidate
      reorderDrag.placement = placement
      nearest.candidate.classList.add('editor-reorder-target', 'editor-reorder-' + placement)
    }
    const finishReorder = (commit: boolean) => {
      const drag = reorderDrag
      if (!drag) return
      try { drag.card.releasePointerCapture?.((drag.card as HTMLElement & { __editorPointerId?: number }).__editorPointerId ?? -1) } catch { /* pointer capture may already be released */ }
      const targetId = drag.target?.dataset.editorGalleryImageId || drag.target?.dataset.editorInsertId
      const placement = drag.placement
      const shouldCommit = commit && drag.active && Boolean(targetId && placement)
      drag.card.classList.remove('editor-reorder-dragging')
      clearReorderTarget()
      reorderDrag = null
      if (shouldCommit) {
        suppressClickUntil = performance.now() + 450
        window.parent.postMessage({
          type: 'editor:reorder-gallery-image',
          galleryId: drag.galleryId,
          imageId: drag.imageId,
          targetImageId: targetId,
          placement,
        }, window.location.origin)
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (previewMode !== 'edit' || (event.pointerType === 'mouse' && event.button !== 0)) return
      const contact = getContactButton(event.target)
      if (contact) {
        const containerRect = contact.container.getBoundingClientRect()
        const elementRect = contact.element.getBoundingClientRect()
        contactLayoutDrag = {
          element: contact.element,
          container: contact.container,
          buttonId: contact.buttonId,
          mode: contact.resize ? 'resize' : 'move',
          startX: event.clientX,
          startY: event.clientY,
          startLeft: elementRect.left - containerRect.left,
          startTop: elementRect.top - containerRect.top,
          startWidth: elementRect.width,
          startHeight: elementRect.height,
          containerWidth: containerRect.width,
          containerHeight: containerRect.height,
          active: false,
        }
        ;(contactLayoutDrag.element as HTMLElement & { __editorPointerId?: number }).__editorPointerId = event.pointerId
        try { contact.element.setPointerCapture(event.pointerId) } catch { /* pointer capture is optional */ }
        return
      }
      const selected = getGalleryCard(event.target)
      if (!selected || (event.target instanceof Element && event.target.closest('.editor-insert-delete'))) return
      reorderDrag = {
        card: selected.card,
        gallery: selected.gallery,
        imageId: selected.imageId,
        galleryId: selected.galleryId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        target: null,
        placement: null,
      }
      ;(reorderDrag.card as HTMLElement & { __editorPointerId?: number }).__editorPointerId = event.pointerId
      try { selected.card.setPointerCapture(event.pointerId) } catch { /* pointer capture is optional */ }
    }
    const onPointerMove = (event: PointerEvent) => {
      const contactDrag = contactLayoutDrag
      if (contactDrag) {
        if (!contactDrag.active) {
          const distance = Math.hypot(event.clientX - contactDrag.startX, event.clientY - contactDrag.startY)
          if (distance < 6) return
          contactDrag.active = true
          contactDrag.element.classList.add('editor-contact-layout-dragging')
        }
        event.preventDefault()
        event.stopPropagation()
        const deltaX = event.clientX - contactDrag.startX
        const deltaY = event.clientY - contactDrag.startY
        const left = contactDrag.mode === 'resize'
          ? contactDrag.startLeft
          : clamp(contactDrag.startLeft + deltaX, 0, Math.max(0, contactDrag.containerWidth - contactDrag.startWidth))
        const top = contactDrag.mode === 'resize'
          ? contactDrag.startTop
          : Math.max(0, contactDrag.startTop + deltaY)
        const width = contactDrag.mode === 'resize'
          ? clamp(contactDrag.startWidth + deltaX, 80, Math.max(80, contactDrag.containerWidth - contactDrag.startLeft))
          : contactDrag.startWidth
        const height = contactDrag.mode === 'resize'
          ? clamp(contactDrag.startHeight + deltaY, 54, 360)
          : contactDrag.startHeight
        applyContactLayout(contactDrag, left, top, width, height)
        return
      }
      const drag = reorderDrag
      if (!drag) return
      if (!drag.active) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
        if (distance < 8) return
        drag.active = true
        drag.card.classList.add('editor-reorder-dragging')
      }
      event.preventDefault()
      event.stopPropagation()
      updateReorderTarget(event.clientX, event.clientY)
    }
    const onPointerUp = () => {
      finishContactLayout(true)
      finishReorder(true)
    }
    const onPointerCancel = () => {
      finishContactLayout(false)
      finishReorder(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (previewMode !== 'edit') return
      const eventTarget = event.target instanceof Element ? event.target : null
      if (eventTarget?.closest('input,textarea,select,[contenteditable="true"]')) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!active) return
        event.preventDefault()
        event.stopPropagation()
        window.parent.postMessage({
          type: 'editor:delete-selection',
          selection: selectionFromElement(active, page),
        }, window.location.origin)
        return
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const selected = getGalleryCard(event.target)
      if (!selected) return
      const siblings = Array.from(selected.gallery.querySelectorAll<HTMLElement>('[data-editor-gallery-image-id], [data-editor-insert-kind="image"][data-editor-insert-id]'))
      const index = siblings.indexOf(selected.card)
      if (index < 0 || siblings.length < 2) return
      let targetIndex = index
      let placement: 'before' | 'after' = 'before'
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') targetIndex = index - 1
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { targetIndex = index + 1; placement = 'after' }
      if (event.key === 'Home') { targetIndex = 0; placement = 'before' }
      if (event.key === 'End') { targetIndex = siblings.length - 1; placement = 'after' }
      if (targetIndex < 0 || targetIndex >= siblings.length || targetIndex === index) return
      event.preventDefault()
      window.parent.postMessage({
        type: 'editor:reorder-gallery-image',
        galleryId: selected.galleryId,
        imageId: selected.imageId,
        targetImageId: siblings[targetIndex].dataset.editorGalleryImageId || siblings[targetIndex].dataset.editorInsertId,
        placement,
      }, window.location.origin)
    }
    const select = (element: Element) => {
      active?.classList.remove('editor-preview-selected')
      active?.closest<HTMLElement>('[data-gallery-image-card]')?.classList.remove('editor-preview-selected-card')
      active = element
      active.classList.add('editor-preview-selected')
      element.closest<HTMLElement>('[data-gallery-image-card]')?.classList.add('editor-preview-selected-card')
      const message = { type: 'editor:select', selection: selectionFromElement(element, page) satisfies EditorSelection }
      window.parent.postMessage(message, window.location.origin)
    }
    const onClick = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
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
            window.parent.postMessage({ type: 'editor:navigate', path: nextUrl.pathname + nextUrl.search + nextUrl.hash }, window.location.origin)
          }
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      select(target)
    }
    const onMessage = (event: MessageEvent) => {
      if (window.parent === window || event.origin !== window.location.origin || event.source !== window.parent) return
      if (event.data?.type === 'editor:state' && event.data.state) {
        stateReceivedFromParent = true
        currentState = event.data.state as EditorState
        cacheEditorState(preview, currentState)
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
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerCancel, true)
    document.addEventListener('keydown', onKeyDown, true)
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
        window.parent.postMessage({ type: 'editor:drop-file', fileName: file.name, fileType: file.type, fileSize: file.size }, window.location.origin)
      }
    }
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('dragleave', onDragLeave, true)
    document.addEventListener('drop', onDrop, true)

    return () => {
      mounted = false
      contentObserver.disconnect()
      routeObserver.disconnect()
      backgroundVideoCleanup?.()
      document.body.classList.remove('editor-page-background-active')
      document.body.classList.remove('editor-preview-mode')
      document.body.classList.remove('editor-preview-browse')
      document.body.classList.remove('editor-preview-edit')
      finishContactLayout(false)
      finishReorder(false)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerCancel, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('dragleave', onDragLeave, true)
      document.removeEventListener('drop', onDrop, true)
    }
  }, [location.hash, location.pathname])

  return null
}
