import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'

function findPageAudio() {
  return document.querySelector<HTMLAudioElement>('audio[data-editor-page-audio], audio[data-editor-media-key], audio')
}

export function PageAudioControl() {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [volume, setVolume] = useState(0.18)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    let current: HTMLAudioElement | null = null
    const sync = () => {
      const next = findPageAudio()
      if (next === current) return
      current = next
      setAudio(next)
      if (next) {
        setVolume(next.volume || 0.18)
        setMuted(next.muted || next.volume === 0)
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!audio) return
    audio.volume = volume
    audio.muted = muted || volume === 0
  }, [audio, muted, volume])

  const toggleMute = () => {
    if (!audio) return
    if (muted || volume === 0) {
      setMuted(false)
      if (volume === 0) setVolume(0.18)
      void audio.play().catch(() => undefined)
    } else {
      setMuted(true)
      audio.pause()
    }
  }

  return (
    <div className="page-audio-control" aria-label="本页 BGM 音量控制">
      <button type="button" disabled={!audio} onClick={toggleMute} aria-label={muted || volume === 0 ? '打开本页 BGM' : '静音本页 BGM'} title={muted || volume === 0 ? '打开本页 BGM' : '静音本页 BGM'}>
        {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} disabled={!audio} onChange={(event) => { const next = Number(event.target.value); setVolume(next); setMuted(next === 0) }} aria-label="本页 BGM 音量" />
      <span>{audio ? `${Math.round((muted ? 0 : volume) * 100)}%` : '无 BGM'}</span>
    </div>
  )
}
