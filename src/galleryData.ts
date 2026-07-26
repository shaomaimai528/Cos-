import { imageConfig } from './config'
import type { GalleryImage } from './components/SimpleImageLightbox'

const toImages = (prefix: string, sources: string[], portrait = false): GalleryImage[] => sources.map((src, index) => ({
  id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
  src,
  alt: '',
  portrait,
}))

export const gallerySections: Array<{ id: string; label: string; portrait?: boolean; images: GalleryImage[] }> = [
  {
    id: 'composite',
    label: '大合成',
    images: toImages('composite', imageConfig.works.composite),
  },
  {
    id: 'semi',
    label: '半合成',
    images: toImages('semi', imageConfig.works.semiFinished.slice(0, 10)),
  },
  {
    id: 'retouch',
    label: '人像精修',
    portrait: true,
    images: Array.from({ length: 10 }, (_, index) => ({
      id: `retouch-${String(index + 1).padStart(2, '0')}`,
      src: '/placeholders/black.svg',
      alt: '',
      portrait: true,
      placeholder: true,
    })),
  },
  {
    id: 'restoration',
    label: '立绘还原',
    images: toImages('restoration', imageConfig.works.semiFinished.slice(10, 20)),
  },
]
