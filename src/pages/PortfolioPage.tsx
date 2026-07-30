import { ArrowLeft } from 'lucide-react'
import { useCallback, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { GalleryImage, SimpleImageLightbox } from '../components/SimpleImageLightbox'
import { PageAudioControl } from '../components/PageAudioControl'
import { isPlaceholderImage } from '../config'
import { useGallerySections } from '../galleryData'
import { retryImage } from '../components/imageUtils'

function syncPortraitCardRatio(image: HTMLImageElement) {
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth >= image.naturalHeight) return
  const card = image.closest<HTMLElement>('.pure-gallery-card')
  if (!card) return
  const ratio = `${image.naturalWidth} / ${image.naturalHeight}`
  card.style.setProperty('--gallery-image-ratio', ratio)
  card.style.aspectRatio = ratio
  card.classList.add('is-portrait')
}

export function PortfolioPage() {
  const gallerySections = useGallerySections()
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const [loadedPortraitIds, setLoadedPortraitIds] = useState<Set<string>>(() => new Set())
  const closePreview = useCallback(() => setSelectedImage(null), [])
  const editorEditPreview = new URLSearchParams(window.location.search).get('editorPreview') === '1'
    && new URLSearchParams(window.location.search).get('editorMode') !== 'browse'

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
            <div className="pure-gallery-grid" data-editor-gallery-id={section.id} style={{ '--gallery-columns': String(section.columns ?? 3), '--gallery-columns-mobile': String(Math.min(section.columns ?? 3, 2)), '--gallery-section-ratio': section.aspectRatio || '16 / 9' } as CSSProperties}>
              {section.images.map((image, imageIndex) => (
                <div
                  className={'pure-gallery-card' + (image.portrait || loadedPortraitIds.has(image.id) ? ' is-portrait' : '') + (image.placeholder ? ' is-placeholder' : '')}
                  data-gallery-image-card="true"
                  data-editor-card-id={image.id}
                  data-editor-gallery-image-id={image.id}
                  data-editor-insert-id={image.insertionId}
                  data-editor-insert-kind={image.insertionId ? 'image' : undefined}
                  role="button"
                  tabIndex={0}
                  key={image.id}
                  onClick={(event) => {
                    if (editorEditPreview) return
                    const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || image.src
                    setSelectedImage({ ...image, src: currentSrc, placeholder: isPlaceholderImage(currentSrc) })
                  }}
                  onKeyDown={(event) => {
                    if (editorEditPreview) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      const currentSrc = event.currentTarget.querySelector('img')?.getAttribute('src') || image.src
                      setSelectedImage({ ...image, src: currentSrc, placeholder: isPlaceholderImage(currentSrc) })
                    }
                  }}
                  aria-label={image.placeholder ? '待上传图片' : '预览大图'}
                  style={{
                    aspectRatio: section.aspectRatio || '16 / 9',
                    '--gallery-image-ratio': section.aspectRatio || '16 / 9',
                  } as CSSProperties}
                >
                  <img key={`${image.id}:${image.src}`} src={image.src} draggable={false} alt="" data-editor-image-key={image.id} data-editor-insert-id={image.insertionId} data-editor-insert-image={image.insertionId ? 'true' : undefined} loading={imageIndex < 2 ? 'eager' : 'lazy'} fetchPriority={imageIndex === 0 ? 'high' : 'auto'} decoding="async" width={image.portrait ? 600 : 900} height={image.portrait ? 800 : 600} onLoad={(event) => {
                    syncPortraitCardRatio(event.currentTarget)
                    if (event.currentTarget.naturalWidth < event.currentTarget.naturalHeight) {
                      setLoadedPortraitIds((current) => current.has(image.id) ? current : new Set(current).add(image.id))
                    }
                  }} onError={retryImage} />
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
