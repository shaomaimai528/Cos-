import type { EditorPricingOffer, EditorState } from './editor/types'

export const defaultPricingOffers: EditorPricingOffer[] = [
  { id: 'pricing-offer-1', label: '01 / 定制', title: '大合成服务', copy: '按需求完成画面合成与细节调整' },
  { id: 'pricing-offer-2', label: '02 / 批量', title: '批量处理', copy: '适合系列图片与统一风格输出' },
  { id: 'pricing-offer-3', label: '03 / 合作', title: '长期合作', copy: '根据项目周期提供稳定支持' },
]

export function resolvePricingOffers(state: EditorState | null) {
  return Array.isArray(state?.pricingOffers)
    ? state.pricingOffers
    : []
}
