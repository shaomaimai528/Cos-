import { useEffect, useRef, useState } from 'react'
import { bgmLibrary, type BgmTrack } from '../bgmLibrary'

const DEFAULT_VOLUME = 0.18
const FADE_IN_MS = 1400
const FADE_OUT_MS = 900

function fadeVolume(audio: HTMLAudioElement, target: number, duration: number, isCurrent = () => true) {
  const start = audio.volume
  const startedAt = performance.now()
  return new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (!isCurrent()) { resolve(); return }
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      audio.volume = start + (target - start) * eased
      if (progress < 1) window.requestAnimationFrame(tick)
      else resolve()
    }
    window.requestAnimationFrame(tick)
  })
}

function hasCustomEditorAudio() {
  return Boolean(document.querySelector('audio[data-editor-page-audio]'))
}

export function BgmPlaylist({ disabledTrackIds }: { disabledTrackIds?: string[] }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackIndexRef = useRef(0)
  const attemptedRef = useRef(new Set<number>())
  const targetVolumeRef = useRef(DEFAULT_VOLUME)
  const userPausedRef = useRef(false)
  const fadeTokenRef = useRef(0)
  const [track, setTrack] = useState<BgmTrack | null>(null)

  const disabledTrackKey = (disabledTrackIds ?? []).join('|')

  useEffect(() => {
    const audio = audioRef.current
    const availableTracks = bgmLibrary.filter((item) => !disabledTrackKey.split('|').includes(item.id))
    if (!audio || availableTracks.length === 0) {
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
      return
    }

    let disposed = false
    let retryTimer = 0
    const randomStart = Math.floor(Math.random() * availableTracks.length)

    const cancelFade = () => { fadeTokenRef.current += 1 }

    const setSource = (index: number) => {
      const next = availableTracks[index]
      trackIndexRef.current = index
      attemptedRef.current.add(index)
      setTrack(next)
      cancelFade()
      audio.volume = 0
      audio.src = next.src
      audio.load()
      window.dispatchEvent(new Event('page-audio-ready'))
    }

    const nextTrack = (playAfterLoad: boolean) => {
      const attempted = attemptedRef.current
      if (attempted.size >= availableTracks.length) attempted.clear()
      for (let offset = 1; offset <= availableTracks.length; offset += 1) {
        const candidate = (trackIndexRef.current + offset) % availableTracks.length
        if (attempted.has(candidate)) continue
        setSource(candidate)
        if (playAfterLoad) void startPlayback()
        return
      }
    }

    const startPlayback = async () => {
      if (disposed || userPausedRef.current || document.hidden || hasCustomEditorAudio()) return
      audio.muted = false
      audio.volume = 0
      try {
        await audio.play()
        if (disposed) return
        const token = ++fadeTokenRef.current
        const start = audio.volume
        await fadeVolume(audio, targetVolumeRef.current, FADE_IN_MS, () => token === fadeTokenRef.current)
        if (token !== fadeTokenRef.current) audio.volume = start
      } catch {
        // Browsers require a user gesture before allowing audible playback.
      }
    }

    const handleEnded = async () => {
      if (disposed || userPausedRef.current) return
      const token = ++fadeTokenRef.current
      await fadeVolume(audio, 0, FADE_OUT_MS, () => token === fadeTokenRef.current)
      if (disposed || token !== fadeTokenRef.current) return
      nextTrack(true)
    }

    const handleError = () => {
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => nextTrack(!userPausedRef.current), 0)
    }

    const unlockPlayback = () => {
      if (audio.paused && !userPausedRef.current) void startPlayback()
    }

    const handleVisibility = () => {
      if (document.hidden) {
        cancelFade()
        audio.volume = 0
        audio.pause()
      } else if (!userPausedRef.current) {
        void startPlayback()
      }
    }

    const handleToggle = (event: Event) => {
      const muted = Boolean((event as CustomEvent<{ muted?: boolean }>).detail?.muted)
      userPausedRef.current = muted
      if (muted) {
        const token = ++fadeTokenRef.current
        void fadeVolume(audio, 0, FADE_OUT_MS, () => token === fadeTokenRef.current).then(() => {
          if (token === fadeTokenRef.current) audio.pause()
        })
      } else {
        cancelFade()
        void startPlayback()
      }
    }

    const handleVolume = (event: Event) => {
      const detail = (event as CustomEvent<{ volume?: number; muted?: boolean }>).detail
      const volume = typeof detail?.volume === 'number' ? detail.volume : DEFAULT_VOLUME
      targetVolumeRef.current = Math.max(0, Math.min(1, volume))
      if (!detail?.muted && !audio.paused) {
        cancelFade()
        audio.volume = targetVolumeRef.current
      }
    }

    const syncEditorAudio = () => {
      if (hasCustomEditorAudio()) {
        cancelFade()
        audio.pause()
        audio.volume = 0
      } else if (!userPausedRef.current && document.visibilityState === 'visible') {
        void startPlayback()
      }
    }

    setSource(randomStart)
    audio.dataset.bgmPlaylist = 'true'
    audio.volume = 0
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('bgm-toggle', handleToggle)
    audio.addEventListener('bgm-volume', handleVolume)
    document.addEventListener('pointerdown', unlockPlayback, { passive: true })
    document.addEventListener('touchstart', unlockPlayback, { passive: true })
    document.addEventListener('keydown', unlockPlayback)
    document.addEventListener('visibilitychange', handleVisibility)

    const observer = new MutationObserver(syncEditorAudio)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
    void startPlayback()

    return () => {
      disposed = true
      cancelFade()
      window.clearTimeout(retryTimer)
      observer.disconnect()
      audio.pause()
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('bgm-toggle', handleToggle)
      audio.removeEventListener('bgm-volume', handleVolume)
      document.removeEventListener('pointerdown', unlockPlayback)
      document.removeEventListener('touchstart', unlockPlayback)
      document.removeEventListener('keydown', unlockPlayback)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [disabledTrackKey])

  return (
    <audio
      ref={audioRef}
      className="bgm-playlist-audio"
      data-editor-media-key="home-bgm"
      aria-label={track ? `网页背景音乐：${track.title}` : '网页背景音乐'}
      preload="auto"
      playsInline
      controls
    />
  )
}
