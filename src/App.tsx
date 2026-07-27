import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { FloatingNav } from './components'
import { HomePage } from './HomePage'
import { CursorTrail } from './components/CursorTrail'
import { SiteParallax } from './components/SiteParallax'
import { EditorPage } from './editor/EditorPage'
import { EditorRuntime } from './editor/EditorRuntime'

const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then((module) => ({ default: module.PortfolioPage })))
const PricingPage = lazy(() => import('./pages/PricingPage').then((module) => ({ default: module.PricingPage })))
const BorderGlowDemo = lazy(() => import('./pages/BorderGlowDemo').then((module) => ({ default: module.BorderGlowDemo })))

const pageTitles: Record<string, string> = {
  '/': '开源创意作品集 · 视觉作品集',
  '/works': '例图展示 · 开源创意作品集',
  '/pricing': '价格与活动 · 开源创意作品集',
}

function RoutedApp() {
  const location = useLocation()
  const reduced = useReducedMotion()
  const routeLocation = location

  useEffect(() => {
    if (location.pathname !== '/') document.body.classList.remove('clean-scene-lock')
    document.title = pageTitles[location.pathname] ?? '工作流分享 · 开源创意作品集'
    const timer = window.setTimeout(() => {
      // The home page uses horizontal scenes, so its hash is a scene command rather than a DOM anchor.
      if (location.pathname !== '/') window.scrollTo({ top: 0, behavior: 'auto' })
    }, reduced ? 0 : 180)
    return () => window.clearTimeout(timer)
  }, [location.hash, location.pathname, location.search, reduced])

  return (
    <>
      <EditorRuntime />
      {location.pathname !== '/editor' ? <CursorTrail /> : null}
      {location.pathname !== '/editor' ? <SiteParallax /> : null}
      {location.pathname !== '/editor' ? <FloatingNav /> : null}
      <AnimatePresence initial={false}>
        <motion.div
          className="route-transition"
          key={location.pathname}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduced ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={null}>
            <Routes location={routeLocation}>
              <Route path="/" element={<HomePage />} />
              <Route path="/works" element={<PortfolioPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/border-glow-demo" element={<BorderGlowDemo />} />
              <Route path="/editor" element={<EditorPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </>
  )
}

export function App() {
  return <BrowserRouter><RoutedApp /></BrowserRouter>
}
