import type { EditorPricingOffer, EditorState } from './editor/types'

export const defaultPricingOffers: EditorPricingOffer[] = [
  { id: 'pricing-offer-1', label: '01 / 全包大合成 60r/张', title: '全包大合成', copy: '原价98.8/张，活动价最低60/张' },
  { id: 'pricing-offer-2', label: '02 / 厚涂修脸 9.9r/张', title: '厚涂修脸', copy: '人物细节调整与质感修饰' },
  { id: 'pricing-offer-3', label: '03 / 氛围特效 38.8r/张', title: '氛围特效', copy: '氛围增强与画面统一' },
]

export function resolvePricingOffers(state: EditorState | null) {
  return Array.isArray(state?.pricingOffers)
    ? state.pricingOffers
    : []
}
