import { siQq, siTiktok, siWechat, siXiaohongshu, type SimpleIcon } from 'simple-icons'

export type PlatformIconKind = 'qq' | 'wechat' | 'douyin' | 'xiaohongshu' | 'link'

type PlatformIconProps = {
  kind?: string
  label?: string
  value?: string
  size?: number
}

function normalizePlatformText(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\-_./:?&#=]+/g, '')
}

export function getPlatformIconKind({ kind, label = '', value = '' }: PlatformIconProps): PlatformIconKind {
  if (kind === 'qq') return 'qq'
  if (kind === 'wechat') return 'wechat'

  const text = normalizePlatformText(`${label}${value}`)
  if (/qq|企鹅/.test(text)) return 'qq'
  if (/微信|wechat|weixin/.test(text)) return 'wechat'
  if (/抖音|douyin|iesdouyin|tiktok/.test(text)) return 'douyin'
  if (/小红书|xiaohongshu|xhs|xhslink/.test(text)) return 'xiaohongshu'
  return 'link'
}

const officialIcons: Partial<Record<PlatformIconKind, SimpleIcon>> = {
  qq: siQq,
  wechat: siWechat,
  // Simple Icons currently provides the official TikTok mark for the Douyin family.
  douyin: siTiktok,
  xiaohongshu: siXiaohongshu,
}

function IconArtwork({ kind }: { kind: PlatformIconKind }) {
  const icon = officialIcons[kind]
  if (icon) return <path d={icon.path} fill="currentColor" />

  return <path d="M9.2 14.8 7.4 16.6a3.1 3.1 0 0 1-4.4-4.4l3.2-3.1a3.1 3.1 0 0 1 4.4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
}

export function PlatformIcon({ kind, label, value, size = 42 }: PlatformIconProps) {
  const resolvedKind = getPlatformIconKind({ kind, label, value })
  return (
    <span className={`platform-icon platform-icon-${resolvedKind}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <IconArtwork kind={resolvedKind} />
      </svg>
    </span>
  )
}
