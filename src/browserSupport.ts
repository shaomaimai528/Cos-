export function subscribeToMediaQuery(media: MediaQueryList, listener: () => void) {
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }

  // Safari 13 and older WebViews only expose the deprecated listener API.
  media.addListener(listener)
  return () => media.removeListener(listener)
}

export function observeElementResize(element: HTMLElement, listener: () => void) {
  listener()

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(listener)
    observer.observe(element)
    return () => observer.disconnect()
  }

  // Keep the carousel usable in older browsers instead of crashing when the
  // modern ResizeObserver API is missing.
  window.addEventListener('resize', listener)
  const fallbackTimer = window.setInterval(listener, 1000)
  return () => {
    window.removeEventListener('resize', listener)
    window.clearInterval(fallbackTimer)
  }
}

export function shouldPreferStaticMedia() {
  if (typeof navigator === 'undefined') return false
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  return Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || ''))
}
