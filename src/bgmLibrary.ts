export type BgmTrack = {
  id: string
  title: string
  artist: string
  album: string
  src: string
}

// Put the source files in public/audio/bgm/ using these names. Missing files
// are skipped at runtime, so a partially uploaded library remains playable.
export const bgmLibrary: BgmTrack[] = [
  { id: 'snowdreams', title: 'Snowdreams', artist: 'Bandari', album: 'One Day In Spring', src: '/audio/bgm/snowdreams.mp3' },
  { id: 'river-flows-in-you', title: 'River Flows In You', artist: 'Yiruma', album: 'Kuschelklassik Piano Dreams', src: '/audio/bgm/river-flows-in-you.mp3' },
  { id: 'summer', title: 'Summer', artist: '久石让', album: 'ENCORE', src: '/audio/bgm/summer.mp3' },
  { id: 'luv-letter', title: 'Luv Letter', artist: 'DJ OKAWARI', album: 'Libyus Music Sound History', src: '/audio/bgm/luv-letter.mp3' },
  { id: 'merry-christmas-mr-lawrence', title: 'Merry Christmas Mr. Lawrence', artist: '坂本龙一', album: 'THREE', src: '/audio/bgm/merry-christmas-mr-lawrence.mp3' },
  { id: 'star-tea-party', title: '星茶会', artist: '灰澈', album: '星茶会', src: '/audio/bgm/star-tea-party.mp3' },
  { id: 'summer-night-crush', title: '夏野与暗恋', artist: '闫东炜', album: '小清新与小情绪', src: '/audio/bgm/summer-night-crush.mp3' },
  { id: 'elegant-fantasy-piano', title: 'Elegant Fantasy Piano', artist: 'Site BGM', album: 'Fallback', src: '/audio/elegant-fantasy-piano.mp3' },
]
