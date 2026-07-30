import { useEffect, useRef, useState } from 'react'
import { shouldPreferStaticMedia, subscribeToMediaQuery } from '../browserSupport'

export function BackgroundVideo({
  className,
  desktopSrc,
  mobileSrc,
  poster,
}: {
  className: string
  desktopSrc: string
  mobileSrc: string
  poster?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [source, setSource] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches ? mobileSrc : desktopSrc
  ))

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)')
    const updateSource = () => setSource(mobile.matches ? mobileSrc : desktopSrc)
    updateSource()
    return subscribeToMediaQuery(mobile, updateSource)
  }, [desktopSrc, mobileSrc])

  useEffect(() => {
    setUnavailable(Boolean(shouldPreferStaticMedia() && poster))
  }, [poster, source])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let inViewport = true

    const syncPlayback = () => {
      if (document.hidden || reducedMotion.matches || !inViewport) {
        video.pause()
        return
      }
      void video.play().catch(() => undefined)
    }

    const visibilityObserver = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
        inViewport = entries[0]?.isIntersecting ?? true
        syncPlayback()
      }, { rootMargin: '120px 0px' })
    visibilityObserver?.observe(video)
    syncPlayback()
    document.addEventListener('visibilitychange', syncPlayback)
    reducedMotion.addEventListener('change', syncPlayback)
    window.addEventListener('pointerdown', syncPlayback, { passive: true })
    window.addEventListener('touchstart', syncPlayback, { passive: true })
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback)
      reducedMotion.removeEventListener('change', syncPlayback)
      window.removeEventListener('pointerdown', syncPlayback)
      window.removeEventListener('touchstart', syncPlayback)
      visibilityObserver?.disconnect()
      video.pause()
    }
  }, [source, unavailable])

  return (
    <div className={className} aria-hidden="true">
      {unavailable && poster ? (
        <img src={poster} alt="" aria-hidden="true" />
      ) : (
        <video
          ref={videoRef}
          src={source}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          onCanPlay={(event) => { setUnavailable(false); if (!document.hidden) void event.currentTarget.play().catch(() => undefined) }}
          onError={() => setUnavailable(true)}
        />
      )}
    </div>
  )
}
