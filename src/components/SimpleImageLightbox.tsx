import { AnimatePresence, motion } from 'framer-motion'
import { RotateCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { retryImage } from './imageUtils'

export type GalleryImage = {
  id: string
  galleryId?: string
  insertionId?: string
  src: string
  alt: string
  portrait?: boolean
  aspectRatio?: string
  placeholder?: boolean
}

export function SimpleImageLightbox({ image, onClose }: { image: GalleryImage | null; onClose: () => void }) {
  const [tall, setTall] = useState(false)
  const [landscape, setLandscape] = useState(false)

  useEffect(() => {
    if (!image) return
    setTall(false)
    setLandscape(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.classList.add('modal-open')
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [image, onClose])

  const detectTall = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return
    const imageRatio = img.naturalHeight / img.naturalWidth
    const viewportRatio = window.innerHeight / window.innerWidth
    setTall(imageRatio > viewportRatio * 1.6)
    setLandscape(img.naturalWidth > img.naturalHeight)
  }

  return (
    <AnimatePresence>
      {image ? (
        <motion.div
          className="simple-lightbox-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}
          role="dialog"
          aria-modal="true"
          aria-label="预览大图"
        >
          <motion.div
            className={'simple-lightbox' + (image.portrait ? ' is-portrait' : '') + (tall ? ' is-tall' : '') + (landscape ? ' is-landscape' : '')}
            onClick={onClose}
            initial={{ opacity: 0, scale: 0.965, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ type: 'spring', stiffness: 310, damping: 28, mass: 0.72 }}
          >
            <button type="button" className="simple-lightbox-close" onClick={onClose} aria-label="关闭大图"><X size={20} /></button>
            {image.placeholder ? <div className="gallery-placeholder" aria-label="待上传图片" /> : (
              <>
                {landscape ? <div className="simple-lightbox-rotate-hint" role="note"><RotateCw size={16} aria-hidden="true" /><span>旋转手机 90°，查看大图</span></div> : null}
                <div className={'simple-lightbox-scroller' + (tall ? ' is-tall' : '')} onClick={onClose}>
                  <img
                    src={image.src}
                    alt={image.alt}
                    onError={retryImage}
                    onClick={(event) => { event.stopPropagation(); onClose() }}
                    onLoad={(event) => detectTall(event.currentTarget)}
                    ref={(node) => { if (node?.complete) detectTall(node) }}
                  />
                </div>
              </>
            )}
            {tall ? <span className="simple-lightbox-tall-hint" aria-hidden="true">长图 · 上下滑动查看</span> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
