import {
  Check,
  Copy,
  Maximize2,
  Menu,
  MessageSquareText,
  Pause,
  Play,
  QrCode,
  X,
} from 'lucide-react'
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useInView,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  wrap,
} from 'framer-motion'
import {
  FocusEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import { imageConfig, isPlaceholderImage, siteConfig, WorkItem } from './config'
import { useClipboard } from './hooks'

export type PromptDialogData = {
  id: string
  title: string
  category: string
  prompt: string
  meta?: string
  summary?: string
  image?: string
  imageAlt?: string
  hideCopyButton?: boolean
}

const elasticSpring = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 25,
  mass: 0.68,
}

const wrapLoopPosition = (value: number, width: number) => {
  if (!width) return value
  let wrapped = value % width
  if (wrapped > 0) wrapped -= width
  return wrapped
}

const glowStates = new WeakMap<HTMLElement, { frame: number; x: number; y: number }>()

function useCoarsePointerAvailable() {
  const query = '(any-pointer: coarse)'
  const [coarsePointer, setCoarsePointer] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  ))

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setCoarsePointer(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return coarsePointer
}

export function trackPointerGlow(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return
  const element = event.currentTarget
  const current = glowStates.get(element) || { frame: 0, x: 0, y: 0 }
  current.x = event.clientX
  current.y = event.clientY

  if (!current.frame) {
    current.frame = window.requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect()
      element.style.setProperty('--glow-x', current.x - rect.left + 'px')
      element.style.setProperty('--glow-y', current.y - rect.top + 'px')
      current.frame = 0
    })
  }

  glowStates.set(element, current)
}

export function FloatingNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.hash, location.pathname])

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/' && !['#works', '#pricing', '#contact'].includes(location.hash)
    if (href === '/works') return (location.pathname === '/' && location.hash === '#works') || location.pathname === '/works'
    if (href === '/pricing') return (location.pathname === '/' && location.hash === '#pricing') || location.pathname === '/pricing'
    if (href === '/#contact') return location.pathname === '/' && location.hash === '#contact'
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  const navTarget = (href: string) => {
    if (href === '/works') return '/#works'
    if (href === '/pricing') return '/#pricing'
    return href
  }

  return (
    <header className="floating-nav-wrap">
      <nav className="floating-nav" aria-label="主导航">
        <Link className="nav-brand" to="/" aria-label="返回首页" onClick={() => setOpen(false)}>
          <span className="nav-brand-mark">
            <img className="nav-brand-avatar" data-editor-image-key="nav-logo" src="/placeholders/black.svg" alt="站点图标" />
          </span>
          <span data-editor-text-key="nav-brand-title">{siteConfig.brand.title}</span>
        </Link>

        <div className={'nav-links' + (open ? ' is-open' : '')}>
          {siteConfig.nav.map((item) => {
            return (
              <Link
                className={'nav-link' + (isActive(item.href) ? ' is-active' : '')}
                to={navTarget(item.href)}
                key={item.label}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <motion.button
          className="nav-menu-button"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? '关闭导航' : '打开导航'}
          aria-expanded={open}
          whileTap={{ scale: 0.88 }}
          transition={elasticSpring}
        >
          {open ? <X size={17} /> : <Menu size={17} />}
        </motion.button>
      </nav>
    </header>
  )
}

export function CopyPromptButton({
  id,
  prompt,
  label = '复制完整提示词',
  compact = false,
  tabIndex,
}: {
  id: string
  prompt: string
  label?: string
  compact?: boolean
  tabIndex?: number
}) {
  const { copy, copiedId, failedId } = useClipboard()
  const copied = copiedId === id
  const failed = failedId === id

  return (
    <motion.button
      className={'copy-button' + (compact ? ' is-compact' : '') + (copied ? ' is-copied' : '')}
      type="button"
      tabIndex={tabIndex}
      onClick={(event) => {
        event.stopPropagation()
        void copy(id, prompt)
      }}
      aria-live="polite"
      whileTap={{ scale: 0.93 }}
      transition={elasticSpring}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{failed ? '复制失败' : copied ? '已复制' : label}</span>
    </motion.button>
  )
}

export function PromptDetailsButton({
  onOpen,
  compact = false,
  tabIndex,
  label = '查看提示词',
}: {
  onOpen: () => void
  compact?: boolean
  tabIndex?: number
  label?: string
}) {
  return (
    <motion.button
      className={'prompt-details-button' + (compact ? ' is-compact' : '')}
      type="button"
      tabIndex={tabIndex}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      whileTap={{ scale: 0.91 }}
      transition={elasticSpring}
    >
      <MessageSquareText size={14} />
      <span>{label}</span>
    </motion.button>
  )
}

export function WorkCard({
  work,
  ratio = 'cinema',
  duplicate = false,
  onOpenWork,
  onOpenPrompt,
}: {
  work: WorkItem
  ratio?: 'cinema' | 'ultrawide' | 'square'
  duplicate?: boolean
  onOpenWork: (work: WorkItem) => void
  onOpenPrompt: (work: WorkItem) => void
}) {
  const light = work.image.includes('white')

  return (
    <motion.article
      className={
        'work-card glow-surface' +
        (ratio === 'ultrawide' ? ' is-ultrawide' : '') +
        (ratio === 'square' || work.category === 'portrait' ? ' is-square' : '') +
        (isPlaceholderImage(work.image) ? ' is-placeholder' : '') +
        (light ? ' is-light' : '')
      }
      onPointerMove={trackPointerGlow}
      whileHover={{ y: -7, scale: 1.012 }}
      whileTap={{ scale: 0.992 }}
      transition={elasticSpring}
    >
      <button
        className="card-open-surface"
        type="button"
        tabIndex={duplicate ? -1 : undefined}
        aria-label={'查看大图：' + work.title}
        onClick={() => onOpenWork(work)}
      />
      <img src={work.image} data-editor-image-key={'work-card-' + work.id} alt={duplicate ? '' : work.alt} loading="lazy" decoding="async" width={1400} height={600} />
      <div className="work-card-ambient" aria-hidden="true" />
      <div className="work-card-topline">
        <span>{String(work.index).padStart(2, '0')}</span>
        <span>点击查看大图</span>
      </div>
      <div className="work-card-content">
        <div>
          <div className="work-tags">
            {work.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <h3>{work.title}</h3>
        </div>
        <PromptDetailsButton
          onOpen={() => onOpenPrompt(work)}
          compact
          tabIndex={duplicate ? -1 : undefined}
        />
      </div>
    </motion.article>
  )
}

export function InfiniteWorksCarousel({
  works,
  speed,
  ratio = 'cinema',
  suspended = false,
  onOpenWork,
  onOpenPrompt,
}: {
  works: WorkItem[]
  speed: number
  ratio?: 'cinema' | 'ultrawide' | 'square'
  suspended?: boolean
  onOpenWork: (work: WorkItem) => void
  onOpenPrompt: (work: WorkItem) => void
}) {
  const targetX = useMotionValue(0)
  const groupWidthValue = useMotionValue(1)
  const springX = useSpring(targetX, { stiffness: 245, damping: 28, mass: 0.66 })
  const displayX = useTransform(() => wrap(-groupWidthValue.get(), 0, springX.get()))
  const viewportRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const hoveredRef = useRef(false)
  const wheelTimer = useRef<number | null>(null)
  const [groupWidth, setGroupWidth] = useState(0)
  const [manualPaused, setManualPaused] = useState(false)
  const [hoverPaused, setHoverPaused] = useState(false)
  const [focusPaused, setFocusPaused] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)
  const reduced = useReducedMotion()
  const coarsePointer = useCoarsePointerAvailable()
  const nativeScroll = Boolean(reduced || coarsePointer)
  const inView = useInView(viewportRef, { amount: 0.01, margin: '220px 0px' })
  const autoPaused = manualPaused || hoverPaused || focusPaused

  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const update = () => {
      const width = group.getBoundingClientRect().width
      setGroupWidth(width)
      if (width) groupWidthValue.set(width)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(group)
    return () => observer.disconnect()
  }, [groupWidthValue, works])

  useEffect(() => {
    const updateVisibility = () => setPageHidden(document.hidden)
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || nativeScroll) return
    const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches

    const handleWheel = (event: WheelEvent) => {
      if (!finePointer || !hoveredRef.current || suspended || !inView || !groupWidth || event.ctrlKey) return

      const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1
      const delta = Math.max(-220, Math.min(220, rawDelta * unit))
      if (!delta || !event.cancelable) return
      event.preventDefault()
      targetX.set(targetX.get() - delta * 1.08)
      viewport.classList.add('is-wheel-active')

      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(() => viewport.classList.remove('is-wheel-active'), 420)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', handleWheel)
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
      viewport.classList.remove('is-wheel-active')
    }
  }, [groupWidth, inView, nativeScroll, suspended, targetX])

  useAnimationFrame((_time, delta) => {
    if (pageHidden || suspended || !inView || !groupWidth || autoPaused || nativeScroll) return
    targetX.set(targetX.get() - speed * (Math.min(delta, 48) / 1000))
  })

  const pauseOnFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('.carousel-toggle')) setFocusPaused(true)
  }

  return (
    <div
      ref={viewportRef}
      className={
        'carousel-viewport' +
        (ratio === 'ultrawide' ? ' is-ultrawide' : '') +
        (nativeScroll ? ' is-native-scroll' : '')
      }
      role="region"
      aria-roledescription={nativeScroll ? '横向作品列表' : '循环作品展示'}
      aria-label={nativeScroll ? '横向作品列表，左右滑动浏览' : '作品循环展示，鼠标移入后滚轮可横向浏览'}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          hoveredRef.current = true
          setHoverPaused(true)
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') {
          hoveredRef.current = false
          setHoverPaused(false)
        }
      }}
      onFocusCapture={pauseOnFocus}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false)
      }}
    >
      {!nativeScroll ? <span className="carousel-wheel-hint">滚轮横向浏览</span> : null}

      {!nativeScroll ? (
        <motion.button
          className="carousel-toggle"
          type="button"
          onClick={() => setManualPaused((value) => !value)}
          aria-label={manualPaused ? '继续播放作品' : '暂停作品播放'}
          aria-pressed={manualPaused}
          whileTap={{ scale: 0.88 }}
          transition={elasticSpring}
        >
          {manualPaused ? <Play size={13} /> : <Pause size={13} />}
        </motion.button>
      ) : null}

      <motion.div className="carousel-track" style={{ x: nativeScroll ? 0 : displayX }}>
        <div className="carousel-group" ref={groupRef}>
          {works.map((work) => (
            <WorkCard
              work={work}
              ratio={ratio}
              key={work.id}
              onOpenWork={onOpenWork}
              onOpenPrompt={onOpenPrompt}
            />
          ))}
        </div>
        {!nativeScroll ? (
          <div className="carousel-group" aria-hidden="true">
            {works.map((work) => (
              <WorkCard
                work={work}
                ratio={ratio}
                duplicate
                key={work.id + '-copy'}
                onOpenWork={onOpenWork}
                onOpenPrompt={onOpenPrompt}
              />
            ))}
          </div>
        ) : null}
      </motion.div>
    </div>
  )
}

export function HeroWorksLoop({
  works,
  onOpenWork,
  speed = 58,
  suspended = false,
}: {
  works: WorkItem[]
  onOpenWork: (work: WorkItem) => void
  speed?: number
  suspended?: boolean
}) {
  const targetX = useMotionValue(0)
  const groupWidthValue = useMotionValue(1)
  const springX = useSpring(targetX, { stiffness: 255, damping: 26, mass: 0.68 })
  const displayX = useTransform(() => wrap(-groupWidthValue.get(), 0, springX.get()))
  const viewportRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const hoveredRef = useRef(false)
  const wheelTimer = useRef<number | null>(null)
  const [groupWidth, setGroupWidth] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focusPaused, setFocusPaused] = useState(false)
  const [manualPaused, setManualPaused] = useState(false)
  const reduced = useReducedMotion()
  // 移除触摸屏停止循环的逻辑，让首页作品在所有设备上都自动滚动
  const nativeScroll = false
  const inView = useInView(viewportRef, { amount: 0.05 })

  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const update = () => {
      const width = group.getBoundingClientRect().width
      setGroupWidth(width)
      if (width) {
        groupWidthValue.set(width)
        targetX.set(wrapLoopPosition(targetX.get(), width))
      }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(group)
    return () => observer.disconnect()
  }, [groupWidthValue, targetX, works])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || nativeScroll) return

    const handleWheel = (event: WheelEvent) => {
      if (!hoveredRef.current || suspended || !inView || !groupWidth || event.ctrlKey) return
      const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1
      const delta = Math.max(-200, Math.min(200, rawDelta * unit))
      if (!delta || !event.cancelable) return

      event.preventDefault()
      targetX.set(targetX.get() - delta * 0.92)
      viewport.classList.add('is-wheel-active')
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(() => viewport.classList.remove('is-wheel-active'), 360)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', handleWheel)
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
      viewport.classList.remove('is-wheel-active')
    }
  }, [groupWidth, inView, nativeScroll, suspended, targetX])

  useAnimationFrame((_time, delta) => {
    if (!inView || nativeScroll || hovered || focusPaused || manualPaused || suspended || !groupWidth) return
    targetX.set(targetX.get() - speed * (Math.min(delta, 48) / 1000))
  })

  const renderGroup = (duplicate: boolean) => (
    <div className="hero-loop-group" ref={duplicate ? undefined : groupRef} aria-hidden={duplicate || undefined}>
      {works.map((work, index) => (
        <motion.button
          className={'hero-loop-card glow-surface' + (isPlaceholderImage(work.image) ? ' is-placeholder' : '') + (work.image.includes('white') ? ' is-light' : '')}
          type="button"
          key={work.id + (duplicate ? '-hero-copy' : '-hero')}
          tabIndex={duplicate ? -1 : undefined}
          onClick={(event) => {
            const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || work.image
            onOpenWork({ ...work, image: currentSrc })
          }}
          onPointerMove={trackPointerGlow}
          whileHover={{ y: index % 2 ? -12 : -8, rotate: index % 2 ? -0.8 : 0.8, scale: 1.035 }}
          whileTap={{ scale: 0.965 }}
          transition={elasticSpring}
          aria-label={'查看大图：' + work.title}
        >
          <img src={work.image} data-editor-image-key={duplicate ? undefined : work.id} alt={duplicate ? '' : work.alt} width={620} height={260} />
          <span>{String(index + 1).padStart(2, '0')}</span>
          <small>{work.title}</small>
        </motion.button>
      ))}
    </div>
  )

  return (
    <div
      className={'hero-loop-viewport glow-surface' + (nativeScroll ? ' is-native-scroll' : '')}
      ref={viewportRef}
      role="region"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true)
        if (event.pointerType === 'mouse') hoveredRef.current = true
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setHovered(false)
        if (event.pointerType === 'mouse') hoveredRef.current = false
      }}
      onFocusCapture={(event) => {
        if (!(event.target as HTMLElement).closest('.hero-loop-toggle')) setFocusPaused(true)
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false)
      }}
      aria-label={nativeScroll ? '首页七张作品横向预览，左右滑动浏览' : '首页七张作品循环预览'}
    >
      {!nativeScroll ? (
        <motion.button
          className="hero-loop-toggle"
          type="button"
          onClick={() => setManualPaused((value) => !value)}
          aria-label={manualPaused ? '继续播放首页作品' : '暂停首页作品'}
          aria-pressed={manualPaused}
          whileTap={{ scale: 0.88 }}
          transition={elasticSpring}
        >
          {manualPaused ? <Play size={13} /> : <Pause size={13} />}
        </motion.button>
      ) : null}
      <motion.div className="hero-loop-track" style={{ x: nativeScroll ? 0 : displayX }}>
        {renderGroup(false)}
        {!nativeScroll ? renderGroup(true) : null}
        {!nativeScroll ? renderGroup(true) : null}
      </motion.div>
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  count,
}: {
  eyebrow: string
  title: string
  description?: string
  count?: string
}) {
  return (
    <div className="section-heading-row">
      <div>
        <span className="section-kicker">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <div className="section-heading-note">
        {description ? <p>{description}</p> : null}
        {count ? <span>{count}</span> : null}
      </div>
    </div>
  )
}

export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28, scale: 0.992 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ type: 'spring', stiffness: 125, damping: 21, mass: 0.92, delay }}
    >
      {children}
    </motion.div>
  )
}

type ModalPageSnapshot = {
  bodyOverflow: string
  bodyPaddingRight: string
  bodyPosition: string
  bodyTop: string
  bodyRight: string
  bodyLeft: string
  bodyWidth: string
  rootScrollBehavior: string
  scrollY: number
  fixedBody: boolean
  pageMain: Element | null
  pageNav: Element | null
  mainHadInert: boolean
  navHadInert: boolean
}

let modalStack: symbol[] = []
let modalPageSnapshot: ModalPageSnapshot | null = null
let modalRestoreTarget: HTMLElement | null = null

function lockModalPage() {
  if (modalPageSnapshot) return

  const body = document.body
  const root = document.documentElement
  const pageMain = document.querySelector('main')
  const pageNav = document.querySelector('.floating-nav-wrap')
  const scrollY = window.scrollY
  const fixedBody = window.matchMedia('(any-pointer: coarse)').matches
  const scrollbarGap = window.innerWidth - root.clientWidth

  modalPageSnapshot = {
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyRight: body.style.right,
    bodyLeft: body.style.left,
    bodyWidth: body.style.width,
    rootScrollBehavior: root.style.scrollBehavior,
    scrollY,
    fixedBody,
    pageMain,
    pageNav,
    mainHadInert: pageMain?.hasAttribute('inert') ?? false,
    navHadInert: pageNav?.hasAttribute('inert') ?? false,
  }

  modalRestoreTarget = document.activeElement as HTMLElement | null
  body.style.overflow = 'hidden'
  if (scrollbarGap > 0) body.style.paddingRight = scrollbarGap + 'px'

  if (fixedBody) {
    body.style.position = 'fixed'
    body.style.top = -scrollY + 'px'
    body.style.right = '0'
    body.style.left = '0'
    body.style.width = '100%'
  }

  pageMain?.setAttribute('inert', '')
  pageNav?.setAttribute('inert', '')
}

function unlockModalPage() {
  const snapshot = modalPageSnapshot
  if (!snapshot) return

  const body = document.body
  const root = document.documentElement
  body.style.overflow = snapshot.bodyOverflow
  body.style.paddingRight = snapshot.bodyPaddingRight
  body.style.position = snapshot.bodyPosition
  body.style.top = snapshot.bodyTop
  body.style.right = snapshot.bodyRight
  body.style.left = snapshot.bodyLeft
  body.style.width = snapshot.bodyWidth

  if (!snapshot.mainHadInert) snapshot.pageMain?.removeAttribute('inert')
  if (!snapshot.navHadInert) snapshot.pageNav?.removeAttribute('inert')

  if (snapshot.fixedBody) {
    root.style.scrollBehavior = 'auto'
    window.scrollTo(0, snapshot.scrollY)
    root.style.scrollBehavior = snapshot.rootScrollBehavior
  }

  const restoreTarget = modalRestoreTarget
  modalPageSnapshot = null
  modalRestoreTarget = null

  window.requestAnimationFrame(() => {
    if (
      restoreTarget?.isConnected &&
      !restoreTarget.closest('[aria-hidden="true"]') &&
      !restoreTarget.hasAttribute('inert')
    ) {
      restoreTarget.focus()
    }
  })
}

function useModalLifecycle(
  onClose: () => void,
  focusRef: React.RefObject<HTMLButtonElement | null>,
  panelRef: React.RefObject<HTMLElement | null>,
) {
  const tokenRef = useRef(Symbol('portfolio-modal'))

  useEffect(() => {
    const token = tokenRef.current
    modalStack.push(token)
    lockModalPage()

    const handleKeys = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== token) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('inert'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeys)
    const focusFrame = window.requestAnimationFrame(() => {
      if (modalStack.at(-1) === token) focusRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeys)
      modalStack = modalStack.filter((entry) => entry !== token)
      if (!modalStack.length) unlockModalPage()
    }
  }, [focusRef, onClose, panelRef])
}

function WorkLightboxPanel({
  work,
  onClose,
  onOpenPrompt,
}: {
  work: WorkItem
  onClose: () => void
  onOpenPrompt: (work: WorkItem) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const placeholder = isPlaceholderImage(work.image)
  const isPresent = useIsPresent()
  useModalLifecycle(onClose, closeRef, panelRef)

  return (
    <motion.div
      className="modal-backdrop work-lightbox-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.01 : 0.22 }}
      aria-hidden={!isPresent || undefined}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.section
        ref={panelRef}
        className="work-lightbox"
        role="dialog"
        aria-modal={isPresent ? 'true' : undefined}
        aria-label={'查看作品大图：' + work.title}
        initial={reduced ? false : { opacity: 0, y: 34, scale: 0.91 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={
          reduced
            ? { opacity: 0 }
            : {
                opacity: 0,
                y: 24,
                scale: 0.94,
                transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
              }
        }
        transition={
          reduced
            ? { duration: 0.01 }
            : { type: 'spring', stiffness: 330, damping: 27, mass: 0.78 }
        }
      >
        <motion.button
          ref={closeRef}
          className="modal-close"
          type="button"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }}
          onClick={onClose}
          aria-label="关闭大图"
          whileHover={{ rotate: 8, scale: 1.08 }}
          whileTap={{ scale: 0.88 }}
          transition={elasticSpring}
        >
          <X size={18} />
        </motion.button>

        <div
          className={
            'lightbox-media' +
            (work.image === imageConfig.placeholders.white ? ' is-light' : '') +
            (work.category === 'portrait' ? ' is-portrait' : '') +
            (placeholder ? ' is-placeholder' : '')
          }
        >
          <img src={work.image} alt={work.alt} width={1800} height={760} />
          <span><Maximize2 size={13} /> {placeholder ? '大图预览 / 图片待上传' : '大图预览'}</span>
        </div>

        <div className="lightbox-footer">
          <div>
            <span>{work.tags.join(' / ')}</span>
            <h2>{work.title}</h2>
          </div>
          <PromptDetailsButton
            onOpen={() => onOpenPrompt(work)}
            label="查看完整提示词"
          />
        </div>
      </motion.section>
    </motion.div>
  )
}

export function WorkLightbox({
  work,
  onClose,
  onOpenPrompt,
}: {
  work: WorkItem | null
  onClose: () => void
  onOpenPrompt: (work: WorkItem) => void
}) {
  return (
    <AnimatePresence>
      {work ? (
        <WorkLightboxPanel
          key={work.id}
          work={work}
          onClose={onClose}
          onOpenPrompt={onOpenPrompt}
        />
      ) : null}
    </AnimatePresence>
  )
}

function PromptDialogPanel({
  data,
  onClose,
}: {
  data: PromptDialogData
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  useModalLifecycle(onClose, closeRef, panelRef)

  return (
    <motion.div
      className="modal-backdrop prompt-dialog-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.01 : 0.2 }}
      aria-hidden={!isPresent || undefined}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.section
        ref={panelRef}
        className={'prompt-dialog' + (data.image ? ' has-preview' : '')}
        role="dialog"
        aria-modal={isPresent ? 'true' : undefined}
        aria-label={'完整提示词：' + data.title}
        initial={reduced ? false : { opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={
          reduced
            ? { opacity: 0 }
            : {
                opacity: 0,
                y: 20,
                scale: 0.94,
                transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
              }
        }
        transition={
          reduced
            ? { duration: 0.01 }
            : { type: 'spring', stiffness: 350, damping: 28, mass: 0.72 }
        }
      >
        <motion.button
          ref={closeRef}
          className="modal-close"
          type="button"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }}
          onClick={onClose}
          aria-label="关闭提示词"
          whileHover={{ rotate: 8, scale: 1.08 }}
          whileTap={{ scale: 0.88 }}
          transition={elasticSpring}
        >
          <X size={18} />
        </motion.button>

        {data.image ? (
          <div className={'prompt-dialog-media' + (data.image === imageConfig.placeholders.white ? ' is-light' : '')}>
            <img src={data.image} alt={data.imageAlt || data.title + '效果图'} width={960} height={720} />
          </div>
        ) : null}

        <div className="prompt-dialog-copy">
          <span className="prompt-dialog-category">{data.category}</span>
          <h2>{data.title}</h2>
          {data.summary ? <p className="prompt-dialog-summary">{data.summary}</p> : null}
          <div className="prompt-dialog-text">{data.prompt}</div>
          <div className="prompt-dialog-footer">
            <span>{data.meta || '完整提示词 / 可直接复制'}</span>
            {!data.hideCopyButton ? <CopyPromptButton id={'dialog-' + data.id} prompt={data.prompt} /> : null}
          </div>
        </div>
      </motion.section>
    </motion.div>
  )
}

export function PromptDialog({
  data,
  onClose,
}: {
  data: PromptDialogData | null
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {data ? <PromptDialogPanel key={data.id} data={data} onClose={onClose} /> : null}
    </AnimatePresence>
  )
}

export function QrPlaceholder() {
  if (imageConfig.qqGroupQr) {
    return <img className="qr-image" data-editor-image-key="contact-qr-image" src={imageConfig.qqGroupQr} alt="QQ群二维码" />
  }

  return (
    <div className="qr-placeholder glow-surface" onPointerMove={trackPointerGlow}>
      <QrCode size={38} strokeWidth={1.2} />
      <div>
        <strong>QQ群二维码</strong>
        <span>后续上传</span>
      </div>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <span>{siteConfig.brand.title}</span>
        <small>个人视觉作品档案</small>
      </div>
      <div className="footer-links">
        {siteConfig.nav.map((item) => <Link to={item.href} key={item.label}>{item.label}</Link>)}
      </div>
      <div className="footer-contact">
        <span>QQ {siteConfig.contact.qq}</span>
        <span>QQ群 {siteConfig.contact.group}</span>
      </div>
    </footer>
  )
}
