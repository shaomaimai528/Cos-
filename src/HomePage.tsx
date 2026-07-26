import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform, wrap } from 'framer-motion'
import { Images, MessageCircle, Route, Search, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  HeroWorksLoop,
  QrPlaceholder,
} from './components'
import { imageConfig, siteConfig, WorkItem, worksByCategory } from './config'
import { GalleryImage, SimpleImageLightbox } from './components/SimpleImageLightbox'
import { gallerySections } from './galleryData'

type SceneKey = 'home' | 'gallery' | 'contact'

const sceneItems: Array<{ id: SceneKey; number: string; label: string }> = [
  { id: 'home', number: '01', label: '首页' },
  { id: 'gallery', number: '02', label: '作品' },
  { id: 'contact', number: '03', label: '联系' },
]

const homepageCompositeOrder = [1, 2, 3, 4, 8, 7, 9] as const
const homepageWorks = homepageCompositeOrder.map((number) => worksByCategory.composite[number - 1])

const sceneTransition = { type: 'spring' as const, stiffness: 255, damping: 26, mass: 0.7 }

function SceneMedia({ scene }: { scene: SceneKey }) {
  const hasVideo = Boolean(imageConfig.heroVideo)
  const extraClass = scene === 'home' ? ' is-home' : ''
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoSource, setVideoSource] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
      ? imageConfig.heroVideoMobile ?? imageConfig.heroVideo
      : imageConfig.heroVideo
  ))

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)')
    const updateSource = () => setVideoSource(mobile.matches ? imageConfig.heroVideoMobile ?? imageConfig.heroVideo : imageConfig.heroVideo)
    mobile.addEventListener('change', updateSource)
    return () => mobile.removeEventListener('change', updateSource)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncPlayback = () => {
      if (document.hidden) video.pause()
      else void video.play().catch(() => undefined)
    }

    document.addEventListener('visibilitychange', syncPlayback)
    window.addEventListener('pointerdown', syncPlayback, { passive: true })
    window.addEventListener('touchstart', syncPlayback, { passive: true })
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback)
      window.removeEventListener('pointerdown', syncPlayback)
      window.removeEventListener('touchstart', syncPlayback)
    }
  }, [videoSource])

  return (
    <div className={'clean-scene-media' + extraClass} aria-hidden="true">
      {hasVideo ? (
        <video ref={videoRef} data-editor-media-key="home-scene-video" src={videoSource ?? undefined} poster={imageConfig.hero} autoPlay muted loop playsInline preload="auto" controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback onCanPlay={(event) => { if (!document.hidden) void event.currentTarget.play().catch(() => undefined) }} />
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

function RailColumn({ images, title, reverse = false, onOpenImage }: { images: GalleryImage[]; title: string; reverse?: boolean; onOpenImage: (image: GalleryImage) => void }) {
  const targetY = useMotionValue(0)
  const loopHeightValue = useMotionValue(1)
  const smoothY = useSpring(targetY, { stiffness: 185, damping: 29, mass: 0.72 })
  const displayY = useTransform(() => wrap(-loopHeightValue.get(), 0, smoothY.get()))
  const groupRef = useRef<HTMLDivElement>(null)
  const loopHeightRef = useRef(0)
  const hoveredRef = useRef(false)
  const focusPausedRef = useRef(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startTarget: number; axis: 'horizontal' | 'vertical' | null } | null>(null)
  const suppressClickUntilRef = useRef(0)
  const reduced = useReducedMotion()
  const coarsePointerRef = useRef(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
  const lastMobileFrameRef = useRef(0)

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
    if (!loopHeight || reduced || document.hidden || hoveredRef.current || focusPausedRef.current) return
    if (coarsePointerRef.current) {
      lastMobileFrameRef.current += delta
      if (lastMobileFrameRef.current < 32) return
      delta = lastMobileFrameRef.current
      lastMobileFrameRef.current = 0
    }
    const autoSpeed = loopHeight / (reverse ? 35 : 30)
    const direction = reverse ? 1 : -1
    targetY.set(targetY.get() + direction * autoSpeed * (Math.min(delta, 34) / 1000))
  })

  const renderGroup = (duplicate: boolean) => (
    <div className="clean-rail-group" ref={duplicate ? undefined : groupRef} aria-hidden={duplicate || undefined}>
      {images.map((image) => (
        <motion.button
          className={'clean-rail-card' + (image.portrait ? ' is-portrait' : '') + (image.placeholder ? ' is-placeholder' : '')}
          type="button"
          key={image.id + (duplicate ? '-rail-copy' : '-rail')}
          tabIndex={duplicate ? -1 : undefined}
          onClick={(event) => {
            if (performance.now() < suppressClickUntilRef.current) {
              event.preventDefault()
              return
            }
            const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || image.src
            onOpenImage({ ...image, src: currentSrc, placeholder: currentSrc === '/placeholders/black.svg' })
          }}
          whileHover={{ scale: 1.025, zIndex: 3 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          aria-label={duplicate ? undefined : image.placeholder ? '待上传图片' : '预览大图'}
        >
          <img src={image.src} alt="" loading="lazy" decoding="async" width={image.portrait ? 600 : 900} height={image.portrait ? 800 : 600} />
        </motion.button>
      ))}
    </div>
  )

  return (
    <div className="clean-rail-column">
      <div className="clean-rail-heading"><span>{title}</span><i /></div>
      <div
        className="clean-rail-window"
        onWheel={(event) => {
          if (event.ctrlKey) return
          hoveredRef.current = true
          const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
          const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1
          const delta = Math.max(-240, Math.min(240, rawDelta * unit))
          if (!delta) return
          event.preventDefault()
          event.stopPropagation()
          targetY.set(targetY.get() - delta * 0.94)
        }}
        onPointerEnter={() => { hoveredRef.current = true }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return
          hoveredRef.current = true
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startTarget: targetY.get(),
            axis: null,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          hoveredRef.current = true
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          const deltaX = event.clientX - drag.startX
          const deltaY = event.clientY - drag.startY
          if (!drag.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
            drag.axis = Math.abs(deltaY) >= Math.abs(deltaX) ? 'vertical' : 'horizontal'
          }
          if (drag.axis === 'vertical') {
            event.preventDefault()
            targetY.set(drag.startTarget + deltaY)
          }
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (drag?.pointerId === event.pointerId) {
            if (drag.axis === 'vertical') suppressClickUntilRef.current = performance.now() + 260
            dragRef.current = null
            hoveredRef.current = false
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
          hoveredRef.current = false
        }}
        onPointerLeave={() => { hoveredRef.current = false }}
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
  return (
    <motion.section
      className="clean-gallery-scene"
      initial={reduced ? false : { opacity: 0, x: 38 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -26 }}
      transition={reduced ? { duration: 0.01 } : sceneTransition}
    >
      <div className="clean-gallery-copy">
        <span>GALLERY / 02</span>
        <h1>例图画廊</h1>
        <p>例图画廊展示，可单独点开预览大图。</p>
      </div>
      <div className="clean-rails">
        {gallerySections.map((section, index) => (
          <RailColumn images={section.images} title={section.label} reverse={index % 2 === 1} onOpenImage={onOpenImage} key={section.id} />
        ))}
      </div>
    </motion.section>
  )
}

function ContactScene() {
  const reduced = useReducedMotion()
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
  return (
    <>
      <div className="clean-audio-control" aria-label="背景音乐音量控制">
        <button className={'clean-audio-ui' + (audioOn ? ' is-on' : '')} type="button" onClick={onToggleAudio} aria-label={audioOn ? '关闭背景音乐' : '打开背景音乐'} title={audioOn ? '关闭背景音乐' : '打开背景音乐'}>
          {audioOn ? <Volume2 size={15} /> : <VolumeX size={15} />}<i /><b />
        </button>
        <input className="clean-audio-range" type="range" min="0" max="1" step="0.01" value={audioOn ? audioVolume : 0} onChange={(event) => onChangeVolume(Number(event.target.value))} aria-label="背景音乐音量" />
        <span className="clean-audio-percent">{audioOn ? Math.round(audioVolume * 100) : 0}%</span>
      </div>
      <div className="clean-scene-dots" aria-label="场景导航">
        {sceneItems.map((scene, index) => (
          <button key={scene.id} className={sceneIndex === index ? 'is-active' : ''} type="button" onClick={() => onChange(index)} aria-label={'前往' + scene.label}>
            <i /><span>{scene.number}</span>
          </button>
        ))}
      </div>
      <div className="clean-progress" aria-hidden="true">
        <span>SCENE {sceneItems[sceneIndex].number} / {sceneItems[sceneIndex].label}</span>
        <i><b style={{ transform: `scaleX(${(sceneIndex + 1) / sceneItems.length})` }} /></i>
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

export function HomePage() {
  const location = useLocation()
  const [sceneIndex, setSceneIndex] = useState(0)
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const wheelLocked = useRef(false)
  const wheelAmount = useRef(0)
  const touchStart = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [audioOn, setAudioOn] = useState(true)
  const [audioVolume, setAudioVolume] = useState(0.18)
  const [booting, setBooting] = useState(true)
  const scene = sceneItems[sceneIndex].id

  const changeScene = useCallback((next: number) => {
    const nextIndex = Math.max(0, Math.min(sceneItems.length - 1, next))
    setSceneIndex(nextIndex)
    if (new URLSearchParams(window.location.search).get('editorPreview') === '1' && window.parent !== window) {
      const sceneHash = nextIndex === 2 ? '#contact' : nextIndex === 1 ? '#works' : ''
      const currentHash = window.location.hash
      if (sceneHash || currentHash === '#contact' || currentHash === '#works') {
        window.parent.postMessage({ type: 'editor:navigate', path: `/${sceneHash}` }, '*')
      }
    }
  }, [])

  useEffect(() => {
    document.body.classList.add('clean-scene-lock')
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return
      const rail = (event.target as Element | null)?.closest('.clean-rail-window') as HTMLElement | null
      if (rail) {
        const atTop = rail.scrollTop <= 0
        const atBottom = rail.scrollTop + rail.clientHeight >= rail.scrollHeight - 1
        const shouldPassToScene = (event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)
        if (!shouldPassToScene) return
      }
      event.preventDefault()
      if (wheelLocked.current) return
      const amount = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      wheelAmount.current += amount
      if (Math.abs(wheelAmount.current) < 72) return
      const direction = wheelAmount.current > 0 ? 1 : -1
      wheelAmount.current = 0
      wheelLocked.current = true
      changeScene(sceneIndex + direction)
      window.setTimeout(() => { wheelLocked.current = false }, 520)
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
    }
  }, [changeScene, sceneIndex])

  useEffect(() => {
    // Hashes on the home route select a horizontal scene instead of scrolling to an anchor.
    changeScene(location.hash === '#contact' ? 2 : location.hash === '#works' ? 1 : 0)
  }, [changeScene, location.hash])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !imageConfig.ambientAudio) return
    audio.volume = audioVolume
    audio.muted = !audioOn || audio.dataset.editorPageDisabled === 'true'
    if (audioOn && audio.dataset.editorPageDisabled !== 'true') void audio.play().catch(() => undefined)
    else audio.pause()
  }, [audioOn, audioVolume])

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 650)
    return () => window.clearTimeout(timer)
  }, [])

  const openWork = useCallback((work: WorkItem) => {
    setSelectedImage({ id: work.id, src: work.image, alt: '' })
  }, [])

  return (
    <div
      className={'clean-scene-home gallery-site' + (scene === 'home' ? ' is-home-scene' : '')}
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return
        const delta = touchStart.current - (event.changedTouches[0]?.clientX ?? touchStart.current)
        if (Math.abs(delta) > 54) changeScene(sceneIndex + (delta > 0 ? 1 : -1))
        touchStart.current = null
      }}
      onPointerDown={(event) => {
        const audio = audioRef.current
        if (audioOn && audio?.dataset.editorPageDisabled !== 'true' && audio?.paused) void audio.play().catch(() => undefined)
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
      <SceneMedia scene={scene} />
      <div className="clean-noise" aria-hidden="true" />
      <AnimatePresence mode="wait" initial={false}>
        {scene === 'home' ? <HomeScene key="home" suspended={Boolean(selectedImage)} onOpenWork={openWork} /> : null}
        {scene === 'gallery' ? <GalleryScene key="gallery" onOpenImage={setSelectedImage} /> : null}
        {scene === 'contact' ? <ContactScene key="contact" /> : null}
      </AnimatePresence>
      <SceneControls sceneIndex={sceneIndex} onChange={changeScene} audioOn={audioOn} onToggleAudio={() => setAudioOn((current) => !current)} audioVolume={audioVolume} onChangeVolume={(next) => { setAudioVolume(next); setAudioOn(next > 0) }} />
      <AnimatePresence>{booting ? <BootTransition /> : null}</AnimatePresence>
      <SimpleImageLightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
    </div>
  )
}
