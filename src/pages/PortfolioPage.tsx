import { ArrowLeft } from 'lucide-react'
import { useCallback, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { GalleryImage, SimpleImageLightbox } from '../components/SimpleImageLightbox'
import { PageAudioControl } from '../components/PageAudioControl'
import { isPlaceholderImage } from '../config'
import { useGallerySections } from '../galleryData'

export function PortfolioPage() {
  const gallerySections = useGallerySections()
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const closePreview = useCallback(() => setSelectedImage(null), [])

  return (
    <div className="inner-page portfolio-page gallery-only-page">
      <main className="inner-page-shell">
        <header className="inner-page-header">
          <Link className="page-back-link" to="/" aria-label="返回首页"><ArrowLeft size={18} /></Link>
          <h1>例图画廊</h1>
        </header>

        {gallerySections.map((section) => (
          <section className={'archive-section pure-gallery-section' + (section.portrait ? ' is-portrait' : '')} data-editor-gallery-section-id={section.id} style={{ '--gallery-section-ratio': section.aspectRatio } as CSSProperties} key={section.id}>
            <div className="archive-section-heading"><div><h2 data-editor-text-key={`gallery-${section.id}-heading`}>{section.label}</h2></div></div>
            <div className="pure-gallery-grid" data-editor-gallery-id={section.id}>
              {section.images.map((image, imageIndex) => (
                <div
                  className={'pure-gallery-card' + (image.portrait ? ' is-portrait' : '') + (image.placeholder ? ' is-placeholder' : '')}
                  data-gallery-image-card="true"
                  data-editor-card-id={image.id}
                  data-editor-gallery-image-id={image.id}
                  data-editor-insert-id={image.insertionId}
                  data-editor-insert-kind={image.insertionId ? 'image' : undefined}
                  role="button"
                  tabIndex={0}
                  key={image.id}
                  onClick={(event) => {
                    const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || image.src
                    setSelectedImage({ ...image, src: currentSrc, placeholder: isPlaceholderImage(currentSrc) })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || image.src
                      setSelectedImage({ ...image, src: currentSrc, placeholder: isPlaceholderImage(currentSrc) })
                    }
                  }}
                  aria-label={image.placeholder ? '待上传图片' : '预览大图'}
                  style={{ aspectRatio: section.aspectRatio || image.aspectRatio || '16 / 9' }}
                >
                  <img src={image.src} alt="" data-editor-image-key={image.id} data-editor-insert-id={image.insertionId} data-editor-insert-image={image.insertionId ? 'true' : undefined} loading={imageIndex < 2 ? 'eager' : 'lazy'} fetchPriority={imageIndex === 0 ? 'high' : 'auto'} decoding="async" width={image.portrait ? 600 : 900} height={image.portrait ? 800 : 600} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
      <PageAudioControl placement="left" />
      <SimpleImageLightbox image={selectedImage} onClose={closePreview} />
    </div>
  )
}
