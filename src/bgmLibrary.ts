export type BgmTrack = {
  id: string
  title: string
  artist: string
  album: string
  src: string
}

// The starter site intentionally has no built-in music. Add a track here only
// when the site should ship with a curated default BGM library.
export const bgmLibrary: BgmTrack[] = []
