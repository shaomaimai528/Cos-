import { useEffect } from 'react'

export function SiteParallax() {
  useEffect(() => {
    const root = document.documentElement
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!finePointer || reduced) return
    let pointerFrame = 0
    let scrollFrame = 0
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0

    const renderPointer = () => {
      pointerFrame = 0
      currentX += (targetX - currentX) * 0.14
      currentY += (targetY - currentY) * 0.14
      root.style.setProperty('--site-parallax-x', `${currentX * 14}px`)
      root.style.setProperty('--site-parallax-y', `${currentY * 10}px`)
      root.style.setProperty('--site-parallax-x-soft', `${currentX * 5}px`)
      root.style.setProperty('--site-parallax-y-soft', `${currentY * 4}px`)
      root.style.setProperty('--site-parallax-x-soft-inverse', `${currentX * -5}px`)
      if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) pointerFrame = window.requestAnimationFrame(renderPointer)
    }

    const onPointerMove = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5
      targetY = event.clientY / window.innerHeight - 0.5
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointer)
    }

    const renderScroll = () => {
      scrollFrame = 0
      const shift = Math.min(42, window.scrollY * 0.035)
      root.style.setProperty('--site-scroll-shift', `${-shift}px`)
      root.style.setProperty('--site-scroll-shift-soft', `${-shift * 0.32}px`)
    }

    const onScroll = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(renderScroll)
    }

    renderScroll()
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('scroll', onScroll)
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame)
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
      root.style.removeProperty('--site-parallax-x')
      root.style.removeProperty('--site-parallax-y')
      root.style.removeProperty('--site-parallax-x-soft')
      root.style.removeProperty('--site-parallax-y-soft')
      root.style.removeProperty('--site-parallax-x-soft-inverse')
      root.style.removeProperty('--site-scroll-shift')
      root.style.removeProperty('--site-scroll-shift-soft')
    }
  }, [])

  return null
}
