import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform, wrap } from 'framer-motion'
import { Check, Copy, ExternalLink, Images, MessageCircle, Route, Search, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  HeroWorksLoop,
  QrPlaceholder,
} from './components'
import { isPlaceholderImage, WorkItem, worksByCategory } from './config'
import { GalleryImage, SimpleImageLightbox } from './components/SimpleImageLightbox'
import { useEditorContentState, useGallerySections } from './galleryData'
import { PageAudioControl } from './components/PageAudioControl'
import { EditorContactButton, EditorState, getEditorOverride, isExternalContactUrl } from './editor/types'
import { resolvePricingOffers } from './pricingData'

type SceneKey = 'gallery' | 'pricing' | 'contact'

const homeBootStorageKey = 'clean-site-home-boot-seen'

const sceneItems: Array<{ id: SceneKey; number: string; label: string }> = [
  { id: 'gallery', number: '01', label: '例图画廊' },
  { id: 'pricing', number: '02', label: '价格与活动' },
  { id: 'contact', number: '03', label: '联系方式' },
]

const homepageCompositeOrder = [1, 2, 3, 4, 8, 7, 9] as const
const homepageWorks = homepageCompositeOrder.map((number) => worksByCategory.composite[number - 1])

const sceneTransition = { type: 'spring' as const, stiffness: 255, damping: 26, mass: 0.7 }

function SceneMedia({ scene: _scene, page, editorState }: { scene: SceneKey; page: string; editorState: EditorState | null }) {
  const backgroundImage = editorState
    ? getEditorOverride(editorState, '__page_background_image__', page)
      ?? (page !== '/' && page !== '/#contact' ? getEditorOverride(editorState, '__page_background_image__', '/') : undefined)
    : undefined
  const backgroundVideo = editorState
    ? getEditorOverride(editorState, '__page_background_video__', page)
      ?? (page !== '/' && page !== '/#contact' ? getEditorOverride(editorState, '__page_background_video__', '/') : undefined)
    : undefined
  const mobileViewport = window.matchMedia('(max-width: 760px)').matches
  const videoSource = backgroundVideo && !backgroundVideo.hidden
    ? (mobileViewport ? backgroundVideo.srcMobile || backgroundVideo.src : backgroundVideo.src)
    : ''
  const imageSource = backgroundImage && !backgroundImage.hidden
    ? (mobileViewport ? backgroundImage.srcMobile || backgroundImage.src : backgroundImage.src)
    : ''
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.setAttribute('fetchpriority', 'low')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const syncPlayback = () => {
      if (document.hidden || reducedMotion.matches) video.pause()
      else void video.play().catch(() => undefined)
    }

    document.addEventListener('visibilitychange', syncPlayback)
    reducedMotion.addEventListener('change', syncPlayback)
    window.addEventListener('pointerdown', syncPlayback, { passive: true })
    window.addEventListener('touchstart', syncPlayback, { passive: true })
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback)
      reducedMotion.removeEventListener('change', syncPlayback)
      window.removeEventListener('pointerdown', syncPlayback)
      window.removeEventListener('touchstart', syncPlayback)
      video.pause()
    }
  }, [videoSource])

  return (
    <div className="clean-scene-media" aria-hidden="true">
      {videoSource ? (
        <video ref={videoRef} data-editor-media-key="home-scene-video" src={videoSource} autoPlay muted loop playsInline preload="metadata" controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback onCanPlay={(event) => { if (!document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) void event.currentTarget.play().catch(() => undefined) }} />
      ) : imageSource ? <img data-editor-media-key="home-scene-image" src={imageSource} alt="" /> : null}
      <i />
    </div>
  )
}

function HomeScene({ suspended, onOpenWork }: { suspended: boolean; onOpenWork: (work: WorkItem) => void }) {
  return (
    <motion.section className="clean-home-scene" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
      <div className="clean-home-loop" aria-label="首页七张作品循环预览">
        <HeroWorksLoop works={homepageWorks} speed={72} suspended={suspended} onOpenWork={onOpenWork} />
      </div>
    </motion.section>
  )
}

const portals = [
  { label: '场景包预设', description: '场景包预设与大图预览', icon: Images, to: '/works', tone: 'mist' },
  { label: '提示词库', description: '可直接查看与复制的提示词', icon: Search, to: '/prompts', tone: 'deep' },
  { label: '工作流分享', description: '大合成、半合成与小香蕉分享', icon: Route, to: '/workflow', tone: 'warm' },
] as const

function PortalScene({ onContact }: { onContact: () => void }) {
  const reduced = useReducedMotion()
  return (
    <motion.section
      className="clean-portal-scene"
      initial={reduced ? false : { opacity: 0, x: 38 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -26 }}
      transition={reduced ? { duration: 0.01 } : sceneTransition}
    >
      <div className="clean-scene-copy">
        <span>PROJECTS</span>
        <h1>创作入口</h1>
        <p>作品、提示词、过程分享与联系方式。</p>
      </div>
      <div className="clean-portal-grid">
        {portals.map(({ label, description, icon: Icon, to, tone }) => (
          <Link className={'clean-portal-card is-' + tone} to={to} key={to}>
            <span className="clean-card-icon"><Icon size={25} strokeWidth={1.35} /></span>
            <strong>{label}</strong>
            <p>{description}</p>
            <i>点击进入</i>
          </Link>
        ))}
        <button className="clean-portal-card is-contact" type="button" onClick={onContact}>
          <span className="clean-card-icon"><MessageCircle size={25} strokeWidth={1.35} /></span>
          <strong>联系方式</strong>
          <p>QQ、QQ群、抖音与二维码。</p>
          <i>点击查看</i>
        </button>
      </div>
    </motion.section>
  )
}

function RailColumn({ images, title, galleryId, reverse = false, onOpenImage }: { images: GalleryImage[]; title: string; galleryId: string; reverse?: boolean; onOpenImage: (image: GalleryImage) => void }) {
  const targetY = useMotionValue(0)
  const loopHeightValue = useMotionValue(1)
  const smoothY = useSpring(targetY, { stiffness: 185, damping: 29, mass: 0.72 })
  const displayY = useTransform(() => wrap(-loopHeightValue.get(), 0, smoothY.get()))
  const groupRef = useRef<HTMLDivElement>(null)
  const railWindowRef = useRef<HTMLDivElement>(null)
  const loopHeightRef = useRef(0)
  const focusPausedRef = useRef(false)
  const hoverPausedRef = useRef(false)
  const nativeScrollPausedUntilRef = useRef(0)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startTarget: number; axis: 'horizontal' | 'vertical' | null; lastY: number; lastAt: number; velocity: number } | null>(null)
  const suppressClickUntilRef = useRef(0)
  const reduced = useReducedMotion()

  const syncNaturalRatio = (image: HTMLImageElement) => {
    if (!image.naturalWidth || !image.naturalHeight) return
    const card = image.closest<HTMLElement>('[data-gallery-image-card]')
    if (!card) return
    const ratio = `${image.naturalWidth} / ${image.naturalHeight}`
    card.style.setProperty('--gallery-image-ratio', ratio)
    card.style.aspectRatio = ratio
    card.classList.toggle('is-portrait', image.naturalWidth < image.naturalHeight)
  }

  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const update = () => {
      const height = group.getBoundingClientRect().height
      if (!height) return
      loopHeightRef.current = height
      loopHeightValue.set(height)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(group)
    return () => observer.disconnect()
  }, [images, loopHeightValue])

  useAnimationFrame((_time, delta) => {
    const loopHeight = loopHeightRef.current
    if (!loopHeight || reduced || document.hidden || focusPausedRef.current || hoverPausedRef.current || performance.now() < nativeScrollPausedUntilRef.current) return
    const autoSpeed = loopHeight / (reverse ? 35 : 30)
    const direction = reverse ? 1 : -1
    const useNativeMobileScroll = window.matchMedia('(pointer: coarse), (max-width: 760px)').matches
    // 手机端由下面独立的原生 scrollTop 定时器驱动，避免部分 Safari/WebView
    // 对 framer-motion 帧回调节流后，自动滚动几乎停住。
    if (useNativeMobileScroll) return
    targetY.set(targetY.get() + direction * autoSpeed * (Math.min(delta, 34) / 1000))
  })

  useEffect(() => {
    if (reduced) return
    const mobileQuery = window.matchMedia('(pointer: coarse), (max-width: 760px)')
    if (!mobileQuery.matches) return

    let lastAt = performance.now()
    const tick = () => {
      const railWindow = railWindowRef.current
      const loopHeight = loopHeightRef.current
      const now = performance.now()
      const elapsed = Math.min(100, Math.max(0, now - lastAt))
      lastAt = now
      if (!railWindow || !loopHeight || document.hidden || focusPausedRef.current || hoverPausedRef.current || now < nativeScrollPausedUntilRef.current) return

      const maxScroll = railWindow.scrollHeight - railWindow.clientHeight
      if (maxScroll <= 0) return
      // 图片组的高度在 ResizeObserver 完成测量后才可靠；在 tick 内读取，
      // 避免定时器初始化过早拿到 0 导致手机端永远不滚动。
      const speed = loopHeight / (reverse ? 35 : 30)
      const distance = speed * (elapsed / 1000)
      const next = railWindow.scrollTop + (reverse ? -distance : distance)
      if (next >= loopHeight) railWindow.scrollTop = 0
      else if (next <= 0) railWindow.scrollTop = Math.min(loopHeight, maxScroll)
      else railWindow.scrollTop = next
    }

    const timer = window.setInterval(tick, 32)
    return () => window.clearInterval(timer)
  }, [reduced, reverse])

  const pauseNativeScroll = () => {
    nativeScrollPausedUntilRef.current = performance.now() + 900
  }

  const renderGroup = (duplicate: boolean) => (
    <div className="clean-rail-group" ref={duplicate ? undefined : groupRef} aria-hidden={duplicate || undefined}>
      {images.map((image) => (
        <motion.button
          className={'clean-rail-card' + (image.portrait ? ' is-portrait' : '') + (image.placeholder ? ' is-placeholder' : '')}
          data-gallery-image-card="true"
          data-editor-gallery-image-id={duplicate ? undefined : image.id}
          type="button"
          style={image.aspectRatio ? { aspectRatio: image.aspectRatio } : undefined}
          key={image.id + (duplicate ? '-rail-copy' : '-rail')}
          data-editor-insert-id={duplicate ? undefined : image.insertionId}
          data-editor-insert-kind={duplicate || !image.insertionId ? undefined : 'image'}
          tabIndex={duplicate ? -1 : undefined}
          onMouseEnter={(event) => {
            hoverPausedRef.current = true
            document.querySelectorAll('.clean-rail-column.is-card-active').forEach((column) => column.classList.remove('is-card-active'))
            event.currentTarget.closest('.clean-rail-column')?.classList.add('is-card-active')
          }}
          onMouseLeave={(event) => {
            hoverPausedRef.current = false
            event.currentTarget.closest('.clean-rail-column')?.classList.remove('is-card-active')
          }}
          onFocus={(event) => {
            hoverPausedRef.current = true
            document.querySelectorAll('.clean-rail-column.is-card-active').forEach((column) => column.classList.remove('is-card-active'))
            event.currentTarget.closest('.clean-rail-column')?.classList.add('is-card-active')
          }}
          onBlur={(event) => {
            hoverPausedRef.current = false
            if (!event.currentTarget.closest('.clean-rail-column')?.contains(event.relatedTarget as Node | null)) {
              event.currentTarget.closest('.clean-rail-column')?.classList.remove('is-card-active')
            }
          }}
          onClick={(event) => {
            if (performance.now() < suppressClickUntilRef.current) {
              event.preventDefault()
              return
            }
            const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || image.src
            onOpenImage({ ...image, src: currentSrc, placeholder: isPlaceholderImage(currentSrc) })
          }}
          whileHover={reduced ? undefined : { scale: 1.2, zIndex: 1000 }}
          whileTap={reduced ? undefined : { scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          aria-label={duplicate ? undefined : image.placeholder ? '待上传图片' : '预览大图'}
        >
          <img src={image.src} data-editor-image-key={image.id} data-editor-insert-id={duplicate ? undefined : image.insertionId} data-editor-insert-image={duplicate || !image.insertionId ? undefined : 'true'} alt="" loading="lazy" decoding="async" width={image.portrait ? 600 : 900} height={image.portrait ? 800 : 600} onLoad={(event) => syncNaturalRatio(event.currentTarget)} />
        </motion.button>
      ))}
    </div>
  )

  return (
    <div className="clean-rail-column">
      <div className="clean-rail-heading"><span data-editor-text-key={`gallery-${galleryId}-heading`}>{title}</span><i /></div>
      <div
        className="clean-rail-window"
        ref={railWindowRef}
        data-editor-gallery-id={galleryId}
        onWheel={(event) => {
          if (event.ctrlKey) return
          pauseNativeScroll()
          const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
          const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1
          const delta = Math.max(-240, Math.min(240, rawDelta * unit))
          if (!delta) return
          event.preventDefault()
          event.stopPropagation()
          targetY.set(targetY.get() - delta * 0.94)
        }}
        onPointerDown={(event) => {
          // Let iOS Safari and other touch browsers use native momentum scrolling.
          // Keep the custom drag path for pen input and desktop-like touchpads.
          if (event.pointerType === 'mouse' || window.matchMedia('(pointer: coarse)').matches) {
            pauseNativeScroll()
            return
          }
          pauseNativeScroll()
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startTarget: targetY.get(),
            axis: null,
            lastY: event.clientY,
            lastAt: performance.now(),
            velocity: 0,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (window.matchMedia('(pointer: coarse)').matches) {
            pauseNativeScroll()
            return
          }
          pauseNativeScroll()
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          const deltaX = event.clientX - drag.startX
          const deltaY = event.clientY - drag.startY
          if (!drag.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
            drag.axis = Math.abs(deltaY) >= Math.abs(deltaX) ? 'vertical' : 'horizontal'
          }
          if (drag.axis === 'vertical') {
            event.preventDefault()
            const now = performance.now()
            const elapsed = now - drag.lastAt
            if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed
            drag.lastY = event.clientY
            drag.lastAt = now
            targetY.set(drag.startTarget + deltaY)
          }
        }}
        onPointerUp={(event) => {
          if (window.matchMedia('(pointer: coarse)').matches) pauseNativeScroll()
          const drag = dragRef.current
          if (drag?.pointerId === event.pointerId) {
            if (drag.axis === 'vertical') {
              suppressClickUntilRef.current = performance.now() + 260
              const fling = Math.max(-1.6, Math.min(1.6, drag.velocity)) * 320
              if (Math.abs(fling) > 40) targetY.set(targetY.get() + fling)
            }
            dragRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onPointerCancel={(event) => {
          if (window.matchMedia('(pointer: coarse)').matches) pauseNativeScroll()
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
        }}
        onTouchStart={pauseNativeScroll}
        onTouchMove={pauseNativeScroll}
        onTouchEnd={pauseNativeScroll}
        onFocusCapture={() => { focusPausedRef.current = true }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focusPausedRef.current = false
        }}
      >
        <motion.div className="clean-rail-track" style={{ y: displayY }}>
          {renderGroup(false)}
          {renderGroup(true)}
        </motion.div>
      </div>
    </div>
  )
}

function GalleryScene({ onOpenImage }: { onOpenImage: (image: GalleryImage) => void }) {
  const reduced = useReducedMotion()
  const gallerySections = useGallerySections()
  // One backend module maps to one visible rail. Splitting portrait images into
  // a second rail made one module look like two unrelated branches.
  const galleryRails = gallerySections.map((section) => ({ ...section, railKey: section.id }))
  return (
    <motion.section
      className="clean-gallery-scene"
      initial={reduced ? false : { opacity: 0, x: 38 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -26 }}
      transition={reduced ? { duration: 0.01 } : sceneTransition}
    >
      <div className="clean-gallery-copy">
        <span>GALLERY / 01</span>
        <div className="clean-gallery-title-row">
          <h1>例图画廊</h1>
          <Link className="clean-gallery-expand" to="/works">展开完整例图</Link>
        </div>
        <p>例图画廊展示，可单独点开预览大图。</p>
      </div>
      <div className="clean-rails" style={{ '--clean-rail-count': Math.min(4, Math.max(1, galleryRails.length)) } as CSSProperties}>
        {galleryRails.map((section, index) => (
          <RailColumn images={section.images} title={section.label} galleryId={section.id} reverse={index % 2 === 1} onOpenImage={onOpenImage} key={section.railKey} />
        ))}
      </div>
    </motion.section>
  )
}

function PricingScene({ editorState }: { editorState: EditorState | null }) {
  const reduced = useReducedMotion()
  const offers = resolvePricingOffers(editorState)
  return (
    <motion.section
      className="clean-pricing-scene"
      initial={reduced ? false : { opacity: 0, x: 38 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -26 }}
      transition={reduced ? { duration: 0.01 } : sceneTransition}
    >
      <div className="clean-pricing-copy">
        <div className="clean-pricing-topline"><span>PRICING / 02</span><b data-editor-text-key="pricing-status">开放预约</b></div>
        <div className="clean-pricing-header">
          <div>
            <h1>价格与活动</h1>
            <p data-editor-text-key="pricing-content">在这里填写价格、优惠活动、合作方式等信息。进入后台管理器，点击这段文字即可编辑。</p>
          </div>
        </div>
        <div className="clean-pricing-offers">
          {offers.map((offer) => (
            <article data-editor-card-id={offer.id} key={offer.id}>
              <span data-editor-text-key={[offer.id, '-label'].join('')}>{offer.label}</span>
              <strong data-editor-text-key={[offer.id, '-title'].join('')}>{offer.title}</strong>
              <small data-editor-text-key={[offer.id, '-copy'].join('')}>{offer.copy}</small>
            </article>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

function qqContactHref(value: string) {
  const qq = value.replace(/[^0-9]/g, '')
  return qq ? `https://wpa.qq.com/msgrd?v=3&uin=${qq}&site=qq&menu=yes` : null
}

function qqAppHref(value: string) {
  const qq = value.replace(/[^0-9]/g, '')
  return qq ? `mqqwpa://im/chat?chat_type=wpa&uin=${qq}` : null
}

function externalContactHref(value: string) {
  if (!isExternalContactUrl(value)) return null
  return new URL(value.trim()).href
}

async function copyTextToClipboard(value: string) {
  const text = value.trim()
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    try {
      textarea.select()
      return document.execCommand('copy')
    } finally {
      textarea.remove()
    }
  } catch {
    return false
  }
}

function contactTextOverride(state: EditorState | null, key: string, fallback: string) {
  if (!state) return fallback
  const override = getEditorOverride(state, `[data-editor-text-key="${key}"]`, '/#contact')
  if (!override) return fallback
  return override.hidden ? '' : (override.value ?? '')
}

function QQContactDialog({ button, onClose }: { button: EditorContactButton | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)
  const [launchStatus, setLaunchStatus] = useState('')
  const qq = button?.value.replace(/[^0-9]/g, '') ?? ''
  const webHref = qqContactHref(qq)
  const appHref = qqAppHref(qq)

  useEffect(() => {
    if (!button) return
    setCopied(false)
    setLaunchStatus('')
    document.body.classList.add('modal-open')
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [button, onClose])

  if (!button || !qq || !webHref || !appHref) return null

  const copyQQ = async () => {
    if (await copyTextToClipboard(qq)) {
      setCopied(true)
      setLaunchStatus('QQ 号已复制，请打开 QQ 搜索并添加好友')
    } else {
      setCopied(false)
      setLaunchStatus('复制失败，请长按或手动记录 QQ 号')
    }
  }

  const openQQ = () => {
    const isMobile = window.matchMedia('(pointer: coarse), (max-width: 760px)').matches
    if (isMobile) {
      setLaunchStatus('正在尝试打开 QQ；如果没有反应，请先复制 QQ 号')
      window.location.href = appHref
      window.setTimeout(() => setLaunchStatus('未能自动打开 QQ，请复制 QQ 号后在 QQ 中搜索添加'), 1000)
      return
    }
    window.open(webHref, '_blank', 'noopener,noreferrer')
    setLaunchStatus('已打开 QQ 联系页面；如无法临时会话，请复制 QQ 号添加好友')
  }

  return (
    <AnimatePresence>
      <motion.div
        className="qq-contact-dialog-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qq-contact-dialog-title"
      >
        <motion.div
          className="qq-contact-dialog"
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{ type: 'spring', stiffness: 310, damping: 28, mass: 0.72 }}
        >
          <button ref={closeButtonRef} type="button" className="qq-contact-dialog-close" onClick={onClose} aria-label="关闭 QQ 联系窗口" title="关闭">
            <X size={20} />
          </button>
          <span className="qq-contact-dialog-eyebrow">QQ CONTACT</span>
          <h2 id="qq-contact-dialog-title">{button.label || 'QQ 联系'}</h2>
          <p className="qq-contact-dialog-copy">QQ 网页临时会话可能无法直接发起，请复制 QQ 号后在 QQ 中搜索并添加好友。</p>
          <div className="qq-contact-number" aria-label={`QQ 号 ${qq}`}>{qq}</div>
          <div className="qq-contact-dialog-actions">
            <button type="button" className="qq-contact-action is-primary" onClick={copyQQ}>
              {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
              {copied ? '已复制 QQ 号' : '复制 QQ 号'}
            </button>
            <button type="button" className="qq-contact-action" onClick={openQQ}>
              <ExternalLink size={17} aria-hidden="true" />
              打开 QQ
            </button>
          </div>
          <p className="qq-contact-dialog-status" role="status" aria-live="polite">{launchStatus || '建议优先复制 QQ 号，添加好友后再发送消息'}</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function legacyContactCards(state: EditorState): Array<{ id: string; label: string; value: string }> {
  if (Array.isArray(state.contactCards)) return state.contactCards
  const indexes = new Set<number>()
  Object.keys(state.overrides).forEach((key) => {
    const match = key.match(/contact-card-(\d+)-(?:label|value)/)
    if (match) indexes.add(Number(match[1]))
  })
  return [...indexes].sort((a, b) => a - b).map((index) => {
    const label = getEditorOverride(state, `[data-editor-text-key="contact-card-${index}-label"]`, '/#contact')
    const value = getEditorOverride(state, `[data-editor-text-key="contact-card-${index}-value"]`, '/#contact')
    return {
      id: `contact-card-${index}`,
      label: label?.hidden ? '' : label?.value ?? '',
      value: value?.hidden ? '' : value?.value ?? '',
    }
  }).filter((card) => card.label || card.value)
}

function ContactScene({ editorState }: { editorState: EditorState }) {
  const reduced = useReducedMotion()
  const contactButtons = (editorState?.contactButtons ?? []).filter((button: EditorContactButton) => button.kind !== 'link' && Boolean(qqContactHref(button.value)))
  const contactLinks = (editorState?.contactButtons ?? []).filter((button: EditorContactButton) => button.kind === 'link' && Boolean(externalContactHref(button.value)))
  const [activeQQ, setActiveQQ] = useState<EditorContactButton | null>(null)
  const [copyNotice, setCopyNotice] = useState<{ id: string; ok: boolean } | null>(null)
  const closeQQ = useCallback(() => setActiveQQ(null), [])
  const contactCards = legacyContactCards(editorState).map((card, index) => ({
    ...card,
    label: contactTextOverride(editorState, `contact-card-${index}-label`, card.label),
    value: contactTextOverride(editorState, `contact-card-${index}-value`, card.value),
  }))
  const groupCard = contactCards.find((card) => card.id === 'contact-card-group' || card.label.includes('群')) ?? contactCards[1]
  const copyContact = async (id: string, value: string) => {
    setCopyNotice({ id, ok: await copyTextToClipboard(value) })
  }
  return (
    <motion.section
      className="clean-contact-scene"
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.995 }}
      transition={reduced ? { duration: 0.01 } : { duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="clean-contact-copy">
        <span>SCENE 04 / CONTACT</span>
        <h1>联系方式<br />联系我们</h1>
        <p>交流原创视觉、图片合成、提示词和创作方法。</p>
        {contactButtons.length || contactLinks.length ? (
          <div className="clean-contact-buttons" aria-label="QQ 联系按钮">
            {contactLinks.map((link) => {
              const href = externalContactHref(link.value)
              if (!href) return null
              return (
                <a className="clean-contact-button is-external" href={href} target="_blank" rel="noopener noreferrer" key={link.id} data-editor-contact-button-id={link.id} aria-label={`${link.label || '平台链接'}，打开链接`}>
                  <span data-editor-text-key={`contact-button-${link.id}-label`}>{link.label || '平台链接'}</span>
                  <strong data-editor-text-key={`contact-button-${link.id}-value`}>{link.value}</strong>
                  <i>点击打开链接</i>
                </a>
              )
            })}
            {contactButtons.map((button) => {
              const href = qqContactHref(button.value)
              if (!href) return null
              return (
                <button className="clean-contact-button" type="button" onClick={() => setActiveQQ(button)} key={button.id} data-editor-contact-button-id={button.id}>
                  <span data-editor-text-key={`contact-button-${button.id}-label`}>{button.label || 'QQ 联系'}</span>
                  <strong data-editor-text-key={`contact-button-${button.id}-value`}>{button.value}</strong>
                  <i>点击联系</i>
                </button>
              )
            })}
          </div>
        ) : null}
        <div className="clean-contact-cards">
          {contactCards.map((card, cardIndex) => {
            const copied = copyNotice?.id === card.id && copyNotice.ok
            return (
              <div className="clean-contact-copy-card" key={card.id}>
                <div className="clean-contact-card-top">
                  <span data-editor-text-key={`contact-card-${cardIndex}-label`}>{card.label}</span>
                  <button
                    className="clean-contact-copy-button"
                    type="button"
                    onClick={() => void copyContact(card.id, card.value)}
                    disabled={!card.value.trim()}
                    aria-label={`复制${card.label}`}
                    title={`复制${card.label}`}
                  >
                    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  </button>
                </div>
                <strong data-editor-text-key={`contact-card-${cardIndex}-value`}>{card.value || '未填写'}</strong>
                <small aria-live="polite">{copied ? '已复制' : copyNotice?.id === card.id ? '复制失败，请长按选择' : '点击图标复制'}</small>
              </div>
            )
          })}
        </div>
      </div>
      <div className="clean-qr-panel">
        <span>扫码加入 QQ 群</span>
        <QrPlaceholder />
        <button
          className="clean-qr-group-copy"
          type="button"
          onClick={() => void copyContact('qq-group-qr', groupCard?.value ?? '')}
          disabled={!(groupCard?.value?.trim())}
          aria-label="复制QQ群号"
          title="复制QQ群号"
        >
          <span>群号 {groupCard?.value || '未填写'}</span>
          {copyNotice?.id === 'qq-group-qr' && copyNotice.ok ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        </button>
      </div>
      <QQContactDialog button={activeQQ} onClose={closeQQ} />
    </motion.section>
  )
}

function SceneControls({ sceneIndex, onChange, audioOn, onToggleAudio, audioVolume, onChangeVolume }: { sceneIndex: number; onChange: (next: number) => void; audioOn: boolean; onToggleAudio: () => void; audioVolume: number; onChangeVolume: (next: number) => void }) {
  const [audioAvailable, setAudioAvailable] = useState(false)
  const [coarsePointer, setCoarsePointer] = useState(false)

  useEffect(() => {
    const check = () => {
      const audio = document.querySelector<HTMLAudioElement>('audio[data-editor-media-key="home-bgm"]')
       const available = audio && !audio.hidden && audio.dataset.editorPageDisabled !== 'true' && (audio.src || audio.currentSrc || audio.querySelectorAll('source[src]').length > 0)
      setAudioAvailable(!!available)
    }
    check()
    const routeRoot = document.querySelector('.route-transition') ?? document.body
    const routeObserver = new MutationObserver(check)
    routeObserver.observe(routeRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'hidden', 'data-editor-page-disabled'] })
    const bodyObserver = new MutationObserver(check)
    bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'hidden', 'data-editor-page-disabled'] })
    return () => {
      routeObserver.disconnect()
      bodyObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse), (max-width: 760px)')
    const update = () => setCoarsePointer(media.matches || navigator.maxTouchPoints > 0)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return (
    <>
      {audioAvailable ? (
      <div className="clean-audio-control" aria-label="背景音乐音量控制">
        <button className={'clean-audio-ui' + (audioOn ? ' is-on' : '')} type="button" onClick={onToggleAudio} aria-label={audioOn ? '关闭背景音乐' : '打开背景音乐'} title={audioOn ? '关闭背景音乐' : '打开背景音乐'}>
          {audioOn ? <Volume2 size={15} /> : <VolumeX size={15} />}<i /><b />
        </button>
        <input className="clean-audio-range" type="range" min="0" max="1" step="0.01" value={audioOn ? audioVolume : 0} onChange={(event) => onChangeVolume(Number(event.target.value))} aria-label="背景音乐音量" />
        <span className="clean-audio-percent">{audioOn ? Math.round(audioVolume * 100) : 0}%</span>
      </div>
      ) : null}
      <div className="clean-progress" aria-hidden="true">
        <span>SCENE {sceneItems[sceneIndex].number} / {sceneItems[sceneIndex].label}</span>
        <i><b style={{ transform: `scaleX(${(sceneIndex + 1) / sceneItems.length})` }} /></i>
      </div>
      <div className={'clean-swipe-hint is-scene-' + sceneIndex} role="status" aria-live="polite">
        {coarsePointer
          ? sceneIndex === 0 ? '向左滑动进入价格与活动' : sceneIndex === 1 ? '向右返回例图画廊 · 向左进入联系方式' : '向右滑动返回价格与活动'
          : sceneIndex === 0 ? '鼠标向下滚动进入价格与活动' : sceneIndex === 1 ? '鼠标向上返回例图画廊 · 向下进入联系方式' : '鼠标向上返回价格与活动'}
      </div>
    </>
  )
}

function BootTransition() {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className="clean-boot-overlay"
      initial={reduced ? false : { opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.01 : 0.72, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden="true"
    ><i /></motion.div>
  )
}

function sceneHashForIndex(index: number) {
  return index === 2 ? '#contact' : index === 1 ? '#pricing' : '#works'
}

export function HomePage() {
  const { state: editorState } = useEditorContentState()
  if (!editorState) return null
  return <LoadedHomePage editorState={editorState} />
}

function LoadedHomePage({ editorState }: { editorState: EditorState }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [sceneIndex, setSceneIndex] = useState(() => {
    if (typeof window === 'undefined') return 0
    return window.location.hash === '#contact' ? 2 : window.location.hash === '#pricing' ? 1 : 0
  })
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const wheelLocked = useRef(false)
  const wheelAmount = useRef(0)
  const wheelLastAt = useRef(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [audioOn, setAudioOn] = useState(true)
  const [audioVolume, setAudioVolume] = useState(0.18)
  const [booting, setBooting] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.sessionStorage.getItem(homeBootStorageKey) !== '1'
  })
  const announcedSceneRef = useRef<number | null>(null)
  const scene = sceneItems[sceneIndex].id

  const changeScene = useCallback((next: number) => {
    const nextIndex = Math.max(0, Math.min(sceneItems.length - 1, next))
    setSceneIndex(nextIndex)
    const sceneHash = sceneHashForIndex(nextIndex)
    if (window.location.hash !== sceneHash) {
      // Keep react-router in sync so nav links and swipes never diverge.
      navigate({ pathname: '/', search: window.location.search, hash: sceneHash }, { replace: true })
    }
    if (new URLSearchParams(window.location.search).get('editorPreview') === '1' && window.parent !== window) {
      if (announcedSceneRef.current !== nextIndex) {
        announcedSceneRef.current = nextIndex
        window.parent.postMessage({ type: 'editor:navigate', path: `/${sceneHash}` }, window.location.origin)
      }
    }
  }, [navigate])

  useEffect(() => {
    document.body.classList.add('clean-scene-lock')
    let unlockTimer = 0
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return
      if (document.body.classList.contains('modal-open')) return
      const scrollContainer = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('.clean-pricing-scene, .clean-contact-scene')
        : null
      const scrollDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        const atTop = scrollContainer.scrollTop <= 0
        const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 1
        if ((scrollDelta > 0 && !atBottom) || (scrollDelta < 0 && !atTop)) return
      }
      event.preventDefault()
      const now = performance.now()
      // 锁定期间（含切换动画+惯性余量）持续吞掉事件：只要还在滚动，就把解锁时间往后推，
      // 直到滚轮/触控板完全停止 220ms 后才解锁，避免一次快速滑动被余量事件二次触发导致跨场景跳。
      if (wheelLocked.current) {
        window.clearTimeout(unlockTimer)
        unlockTimer = window.setTimeout(() => { wheelLocked.current = false; wheelAmount.current = 0 }, 220)
        return
      }
      if (now - wheelLastAt.current > 380) wheelAmount.current = 0
      wheelLastAt.current = now
      const amount = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      wheelAmount.current += amount
      if (Math.abs(wheelAmount.current) < 72) return
      const direction = wheelAmount.current > 0 ? 1 : -1
      wheelAmount.current = 0
      wheelLocked.current = true
      changeScene(sceneIndex + direction)
      window.clearTimeout(unlockTimer)
      unlockTimer = window.setTimeout(() => { wheelLocked.current = false; wheelAmount.current = 0 }, 560)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); changeScene(sceneIndex + 1) }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); changeScene(sceneIndex - 1) }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('clean-scene-lock')
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(unlockTimer)
    }
  }, [changeScene, sceneIndex])

  useEffect(() => {
    // Hashes on the home route select a horizontal scene instead of scrolling to an anchor.
    changeScene(location.hash === '#contact' ? 2 : location.hash === '#pricing' ? 1 : 0)
  }, [changeScene, location.hash])

  useEffect(() => {
    // 手机端：把自定义背景图按场景三等分横向平移（场景1左/场景2中/场景3右），CSS transition 保证无拼接的平滑过渡。
    const positions = ['0%', '50%', '100%']
    const percent = positions[Math.min(sceneIndex, positions.length - 1)]
    document.body.style.setProperty('--home-scene-bg-x', percent)
  }, [sceneIndex])

  useEffect(() => {
    if (!booting) return
    const timer = window.setTimeout(() => setBooting(false), 650)
    window.sessionStorage.setItem(homeBootStorageKey, '1')
    return () => window.clearTimeout(timer)
  }, [booting])

  const openWork = useCallback((work: WorkItem) => {
    setSelectedImage({ id: work.id, src: work.image, alt: '' })
  }, [])

  return (
    <div
      className="clean-scene-home gallery-site"
      onTouchStart={(event) => {
        const touch = event.touches[0]
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current
        touchStart.current = null
        if (!start) return
        if (document.body.classList.contains('modal-open')) return
        const touch = event.changedTouches[0]
        if (!touch) return
        const deltaX = start.x - touch.clientX
        const deltaY = start.y - touch.clientY
        if (Math.abs(deltaX) > 54 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          changeScene(sceneIndex + (deltaX > 0 ? 1 : -1))
        }
      }}
      onPointerDown={(event) => {
        const audio = audioRef.current
        if (audioOn && !audio?.muted && audio?.dataset.editorPageDisabled !== 'true' && audio?.paused) void audio.play().catch(() => undefined)
        const target = (event.target as HTMLElement).closest('button, a') as HTMLElement | null
        if (!target) return
        const rect = target.getBoundingClientRect()
        const ripple = document.createElement('i')
        ripple.className = 'clean-click-ripple'
        ripple.style.left = event.clientX - rect.left + 'px'
        ripple.style.top = event.clientY - rect.top + 'px'
        target.classList.add('clean-ripple-host')
        target.appendChild(ripple)
        window.setTimeout(() => ripple.remove(), 640)
      }}
    >
      <PageAudioControl placement="left" />
      <SceneMedia scene={scene} page={location.pathname + location.hash} editorState={editorState} />
      <div className="clean-noise" aria-hidden="true" />
      <AnimatePresence initial={false}>
        {scene === 'gallery' ? <GalleryScene key="gallery" onOpenImage={setSelectedImage} /> : null}
        {scene === 'pricing' ? <PricingScene key="pricing" editorState={editorState} /> : null}
        {scene === 'contact' ? <ContactScene key="contact" editorState={editorState} /> : null}
      </AnimatePresence>
      <SceneControls sceneIndex={sceneIndex} onChange={changeScene} audioOn={audioOn} onToggleAudio={() => setAudioOn((current) => !current)} audioVolume={audioVolume} onChangeVolume={(next) => { setAudioVolume(next); setAudioOn(next > 0) }} />
      <AnimatePresence>{booting ? <BootTransition /> : null}</AnimatePresence>
      <SimpleImageLightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
    </div>
  )
}
