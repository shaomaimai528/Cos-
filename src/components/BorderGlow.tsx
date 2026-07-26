import { CSSProperties, PointerEvent, ReactNode, useCallback, useEffect, useRef } from 'react'

export type BorderGlowProps = {
  children: ReactNode
  className?: string
  borderRadius?: number
  blurRadius?: number
  edgeDistance?: number
  coneSpread?: number
  gradientColors?: string[]
  glowIntensity?: number
  borderWidth?: number
}

type GlowStyle = CSSProperties & Record<`--${string}`, string>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function BorderGlow({ children, className = '', borderRadius = 18, blurRadius = 18, edgeDistance = 42, coneSpread = 56, gradientColors = ['#dfff3f', '#9bf6ff', '#f3d49a'], glowIntensity = 0.95, borderWidth = 1 }: BorderGlowProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const nextRef = useRef({ x: 0, y: 0, opacity: 0, angle: 0 })

  const applyGlow = useCallback(() => {
    frameRef.current = null
    const host = hostRef.current
    if (!host) return
    const next = nextRef.current
    host.style.setProperty('--border-glow-x', `${next.x}px`)
    host.style.setProperty('--border-glow-y', `${next.y}px`)
    host.style.setProperty('--border-glow-angle', `${next.angle}deg`)
    host.style.setProperty('--border-glow-opacity', String(next.opacity))
  }, [])

  const queueGlow = useCallback((x: number, y: number, opacity: number, angle: number) => {
    nextRef.current = { x, y, opacity, angle }
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(applyGlow)
  }, [applyGlow])

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const edgeGap = Math.min(x, y, rect.width - x, rect.height - y)
    const proximity = clamp(1 - edgeGap / Math.max(1, edgeDistance), 0, 1)
    const angle = Math.atan2(y - rect.height / 2, x - rect.width / 2) * (180 / Math.PI)
    queueGlow(x, y, proximity * glowIntensity, angle)
  }, [edgeDistance, glowIntensity, queueGlow])

  const onPointerLeave = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    queueGlow(rect.width / 2, rect.height / 2, 0, nextRef.current.angle)
  }, [queueGlow])

  useEffect(() => () => { if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current) }, [])

  const style: GlowStyle = {
    '--border-glow-radius': `${borderRadius}px`, '--border-glow-blur': `${blurRadius}px`, '--border-glow-edge': `${edgeDistance}px`, '--border-glow-spread': `${coneSpread}deg`, '--border-glow-colors': gradientColors.join(', '), '--border-glow-opacity': '0', '--border-glow-x': '50%', '--border-glow-y': '50%', '--border-glow-angle': '0deg', '--border-glow-width': `${borderWidth}px`,
  }

  return <div ref={hostRef} className={'border-glow relative isolate overflow-hidden ' + className} style={style} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
    <span className="border-glow__halo" aria-hidden="true" />
    <span className="border-glow__ring" aria-hidden="true" />
    <div className="relative z-10 h-full">{children}</div>
  </div>
}
