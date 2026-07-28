import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform, wrap } from 'framer-motion'
import { Images, MessageCircle, Route, Search, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  HeroWorksLoop,
  QrPlaceholder,
} from './components'
import { imageConfig, isPlaceholderImage, siteConfig, WorkItem, worksByCategory } from './config'
import { GalleryImage, SimpleImageLightbox } from './components/SimpleImageLightbox'
import { useEditorContentState, useGallerySections } from './galleryData'
import { PageAudioControl } from './components/PageAudioControl'
import { EditorContactButton, EditorState, getEditorOverride } from './editor/types'
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

function SceneMedia({ scene, page, editorState }: { scene: SceneKey; page: string; editorState: EditorState | null }) {
  const backgroundImage = editorState
    ? getEditorOverride(editorState, '__page_background_image__', page)
      ?? (page !== '/' && page !== '/#contact' ? getEditorOverride(editorState, '__page_background_image__', '/') : undefined)
    : undefined
  const backgroundVideo = editorState
    ? getEditorOverride(editorState, '__page_background_video__', page)
      ?? (page !== '/' && page !== '/#contact' ? getEditorOverride(editorState, '__page_background_video__', '/') : undefined)
    : undefined
  const customBackgroundActive = Boolean(
    (backgroundImage?.src && !backgroundImage.hidden) || (backgroundVideo?.src && !backgroundVideo.hidden),
  )
  const hasVideo = editorState !== null && !customBackgroundActive && Boolean(imageConfig.heroVideo)
  const extraClass = ''
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoSource, setVideoSource] = useState<string | null>(null)

  useEffect(() => {
    if (!hasVideo) {
      setVideoSource(null)
      return
    }
    const mobile = window.matchMedia('(max-width: 760px)')
    const updateSource = () => setVideoSource(mobile.matches ? imageConfig.heroVideoMobile ?? imageConfig.heroVideo : imageConfig.heroVideo)
    mobile.addEventListener('change', updateSource)
    updateSource()
    return () => mobile.removeEventListener('change', updateSource)
  }, [hasVideo])

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
    <div className={'clean-scene-media' + extraClass} aria-hidden="true">
      {hasVideo && videoSource ? (
        <video ref={videoRef} data-editor-media-key="home-scene-video" src={videoSource} poster={imageConfig.hero} autoPlay muted loop playsInline preload="metadata" controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback onCanPlay={(event) => { if (!document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) void event.currentTarget.play().catch(() => undefined) }} />
      ) : <img data-editor-media-key="home-scene-image" src={imageConfig.hero} alt="" />}
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
  const nativeScrollPausedUntilRef = useRef(0)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startTarget: number; axis: 'horizontal' | 'vertical' | null; lastY: number; lastAt: number; velocity: number } | null>(null)
  const suppressClickUntilRef = useRef(0)
  const reduced = useReducedMotion()

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
    if (!loopHeight || reduced || document.hidden || focusPausedRef.current || performance.now() < nativeScrollPausedUntilRef.current) return
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
      if (!railWindow || !loopHeight || document.hidden || focusPausedRef.current || now < nativeScrollPausedUntilRef.current) return

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
          type="button"
          key={image.id + (duplicate ? '-rail-copy' : '-rail')}
          data-editor-insert-id={duplicate ? undefined : image.insertionId}
          data-editor-insert-kind={duplicate || !image.insertionId ? undefined : 'image'}
          tabIndex={duplicate ? -1 : undefined}
          onClick={(event) => {
            if (performance.now() < suppressClickUntilRef.current) {
              event.preventDefault()
              return
            }
            const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || image.src
            onOpenImage({ ...image, src: currentSrc, placeholder: isPlaceholderImage(currentSrc) })
          }}
          whileHover={{ scale: 1.025, zIndex: 3 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          aria-label={duplicate ? undefined : image.placeholder ? '待上传图片' : '预览大图'}
        >
          <img src={image.src} data-editor-image-key={image.id} data-editor-insert-id={duplicate ? undefined : image.insertionId} data-editor-insert-image={duplicate || !image.insertionId ? undefined : 'true'} alt="" loading="lazy" decoding="async" width={image.portrait ? 600 : 900} height={image.portrait ? 800 : 600} />
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
      <div className="clean-rails">
        {gallerySections.map((section, index) => (
          <RailColumn images={section.images} title={section.label} galleryId={section.id} reverse={index % 2 === 1} onOpenImage={onOpenImage} key={section.id} />
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

function ContactScene({ editorState }: { editorState: EditorState | null }) {
  const reduced = useReducedMotion()
  const contactButtons = (editorState?.contactButtons ?? []).filter((button: EditorContactButton) => Boolean(qqContactHref(button.value)))
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
        <div className="clean-contact-cards">
          <div><span>个人 QQ</span><strong>{siteConfig.contact.qq}</strong></div>
          <div><span>QQ群</span><strong>{siteConfig.contact.group}</strong></div>
          <div><span>抖音</span><strong>搜索：一勺炒酸奶</strong></div>
        </div>
        {contactButtons.length ? (
          <div className="clean-contact-buttons" aria-label="QQ 联系按钮">
            {contactButtons.map((button) => {
              const href = qqContactHref(button.value)
              if (!href) return null
              return (
                <a className="clean-contact-button" href={href} target="_blank" rel="noreferrer" key={button.id} data-editor-contact-button-id={button.id}>
                  <span data-editor-text-key={`contact-button-${button.id}-label`}>{button.label || 'QQ 联系'}</span>
                  <strong data-editor-text-key={`contact-button-${button.id}-value`}>{button.value}</strong>
                  <i>点击联系</i>
                </a>
              )
            })}
          </div>
        ) : null}
      </div>
      <div className="clean-qr-panel">
        <span>扫码加入 QQ 群</span>
        <QrPlaceholder />
        <small>群号 {siteConfig.contact.group}</small>
      </div>
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
  const location = useLocation()
  const navigate = useNavigate()
  const { state: editorState } = useEditorContentState()
  const [sceneIndex, setSceneIndex] = useState(0)
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
  const normalizedEntryRef = useRef(false)
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
    const preview = new URLSearchParams(window.location.search).get('editorPreview') === '1'
    if (!normalizedEntryRef.current && !preview && location.pathname === '/' && location.hash) return
    changeScene(location.hash === '#contact' ? 2 : location.hash === '#pricing' ? 1 : 0)
  }, [changeScene, location.hash])

  useEffect(() => {
    // 手机端：把自定义背景图按场景三等分横向平移（场景1左/场景2中/场景3右），CSS transition 保证无拼接的平滑过渡。
    const positions = ['0%', '50%', '100%']
    const percent = positions[Math.min(sceneIndex, positions.length - 1)]
    document.body.style.setProperty('--home-scene-bg-x', percent)
  }, [sceneIndex])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !imageConfig.ambientAudio) return
    audio.volume = audioVolume
    audio.muted = !audioOn || audio.dataset.editorPageDisabled === 'true'
    if (audioOn && audio.dataset.editorPageDisabled !== 'true') void audio.play().catch(() => undefined)
    else audio.pause()
  }, [audioOn, audioVolume])

  useEffect(() => {
    if (normalizedEntryRef.current) return
    normalizedEntryRef.current = true
    const preview = new URLSearchParams(window.location.search).get('editorPreview') === '1'
    if (!preview && location.pathname === '/' && location.hash) {
      navigate({ pathname: '/', search: window.location.search }, { replace: true })
      return
    }
  }, [location.hash, location.pathname, navigate])

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
      {imageConfig.ambientAudio ? <audio ref={audioRef} data-editor-media-key="home-bgm" src={imageConfig.ambientAudio} autoPlay loop preload="auto" controlsList="nodownload noremoteplayback" /> : null}
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
