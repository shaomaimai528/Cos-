import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageAudioControl } from '../components/PageAudioControl'

export function PricingPage() {
  return (
    <div className="inner-page pricing-page">
      <main className="inner-page-shell">
        <header className="inner-page-header">
          <Link className="page-back-link" to="/" aria-label="返回首页"><ArrowLeft size={18} /></Link>
          <h1>价格与活动</h1>
        </header>

        <section className="works-promo-section" data-editor-gallery-section-id="pricing">
          <p className="works-promo-text" data-editor-text-key="pricing-content">在这里填写价格、优惠活动、合作方式等信息。进入后台管理器，点击这段文字即可编辑。</p>
        </section>
      </main>
      <PageAudioControl placement="left" />
    </div>
  )
}
