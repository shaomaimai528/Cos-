export function retryImage(event: React.SyntheticEvent<HTMLImageElement>, fallback = '/placeholders/black.svg') {
  const image = event.currentTarget
  const original = image.dataset.imageOriginalSrc || image.currentSrc || image.src

  if (!original || original === fallback || image.dataset.imageRetry === '1') {
    image.dataset.imageFallback = '1'
    if (image.src !== fallback) image.src = fallback
    return
  }

  image.dataset.imageOriginalSrc = original
  image.dataset.imageRetry = '1'
  window.setTimeout(() => {
    if (!image.isConnected || image.dataset.imageFallback === '1') return
    image.src = original + (original.includes('?') ? '&' : '?') + 'retry=1'
  }, 350)
}

export function markImageLoaded(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget
  delete image.dataset.imageRetry
  delete image.dataset.imageOriginalSrc
  delete image.dataset.imageFallback
}
