import { useLayoutEffect, useRef } from 'react'

const TRAIL_COUNT = 5

export function CursorTrail() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<HTMLSpanElement>(null)
  const clickRef = useRef<HTMLSpanElement>(null)
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([])

  useLayoutEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!media.matches) return

    const cursor = cursorRef.current
    const coreElement = coreRef.current
    if (!cursor || !coreElement) return
    const dots = dotRefs.current.filter((dot): dot is HTMLSpanElement => Boolean(dot))
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const trail = Array.from({ length: TRAIL_COUNT }, () => ({ ...target }))
    let frame = 0
    let visible = false
    let clickTimer: number | undefined
    let idleUntil = 0
    let actionTarget: EventTarget | null = null
    let actionState = false

    const render = () => {
      frame = 0
      coreElement.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`
      dots.forEach((dot, index) => {
        const previous = index === 0 ? target : trail[index - 1]
        const current = trail[index]
        current.x += (previous.x - current.x) * (0.18 - index * 0.015)
        current.y += (previous.y - current.y) * (0.18 - index * 0.015)
        dot.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) scale(${1 - index * 0.12})`
      })
      const tail = trail[trail.length - 1]
      const unsettled = Math.abs(target.x - tail.x) > 0.25 || Math.abs(target.y - tail.y) > 0.25
      if (unsettled || performance.now() < idleUntil) frame = window.requestAnimationFrame(render)
    }

    const scheduleRender = () => {
      if (!frame) frame = window.requestAnimationFrame(render)
    }

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX
      target.y = event.clientY
      idleUntil = performance.now() + 170
      scheduleRender()
      if (!visible) {
        visible = true
        cursor.classList.add('is-visible')
        document.documentElement.classList.add('has-cursor-trail')
      }
      if (event.target !== actionTarget) {
        actionTarget = event.target
        const element = event.target instanceof Element ? event.target : null
        const nextActionState = Boolean(element?.closest('a, button, input, textarea, select, label'))
        if (nextActionState !== actionState) {
          actionState = nextActionState
          cursor.classList.toggle('is-action', actionState)
        }
      }
    }

    const onDown = (event: PointerEvent) => {
      const click = clickRef.current
      if (!click) return
      click.style.setProperty('--cursor-click-x', `${event.clientX}px`)
      click.style.setProperty('--cursor-click-y', `${event.clientY}px`)
      click.classList.remove('is-active')
      void click.offsetWidth
      click.classList.add('is-active')
      if (clickTimer) window.clearTimeout(clickTimer)
      clickTimer = window.setTimeout(() => click.classList.remove('is-active'), 520)
    }

    const onLeave = () => {
      cursor.classList.remove('is-visible')
      document.documentElement.classList.remove('has-cursor-trail')
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.documentElement.classList.remove('has-cursor-trail')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('mouseleave', onLeave)
      window.cancelAnimationFrame(frame)
      if (clickTimer) window.clearTimeout(clickTimer)
    }
  }, [])

  return (
    <div className="cursor-trail" ref={cursorRef} aria-hidden="true">
      <span className="cursor-trail__core" ref={coreRef}><i /></span>
      {Array.from({ length: TRAIL_COUNT }, (_, index) => <span className={'cursor-trail__dot is-' + index} ref={(element) => { dotRefs.current[index] = element }} key={index} />)}
      <span className="cursor-trail__click" ref={clickRef} />
    </div>
  )
}
