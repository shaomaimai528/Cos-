import { useState } from 'react'
import { BorderGlow } from '../components/BorderGlow'

type ControlProps = { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }

function RangeControl({ label, value, min, max, step = 1, onChange }: ControlProps) {
  return <label className="border-glow-demo__control"><span>{label}<b>{value}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

export function BorderGlowDemo() {
  const [radius, setRadius] = useState(20)
  const [blur, setBlur] = useState(22)
  const [edge, setEdge] = useState(44)
  const [spread, setSpread] = useState(64)
  const [intensity, setIntensity] = useState(0.95)
  return <main className="border-glow-demo">
    <section className="border-glow-demo__intro"><span>REUSABLE COMPONENT</span><h1>Border Glow</h1><p>将鼠标靠近任意卡片边缘，观察只在边框区域出现的柔光。</p></section>
    <section className="border-glow-demo__workspace">
      <BorderGlow className="border-glow-demo__card" borderRadius={radius} blurRadius={blur} edgeDistance={edge} coneSpread={spread} glowIntensity={intensity} gradientColors={['#dfff3f', '#7ee8fa', '#f3d49a']}>
        <span className="border-glow-demo__eyebrow">INTERACTION / 01</span><h2>鼠标靠近边缘</h2><p>光晕按指针角度计算，并用双层遮罩裁切到边框，内部内容保持干净。</p><button type="button">示例操作</button>
      </BorderGlow>
      <aside className="border-glow-demo__controls">
        <RangeControl label="圆角" value={radius} min={0} max={36} onChange={setRadius} />
        <RangeControl label="柔光模糊" value={blur} min={0} max={48} onChange={setBlur} />
        <RangeControl label="边缘触发距离" value={edge} min={8} max={96} onChange={setEdge} />
        <RangeControl label="锥形扩散角度" value={spread} min={12} max={160} onChange={setSpread} />
        <RangeControl label="光晕强度" value={intensity} min={0} max={1.5} step={0.05} onChange={setIntensity} />
      </aside>
    </section>
    <section className="border-glow-demo__examples">{[
      { title: '低调绿光', colors: ['#dfff3f', '#80ed99', '#caffbf'] }, { title: '冷色扫描', colors: ['#67e8f9', '#818cf8', '#c4b5fd'] }, { title: '暖色余晖', colors: ['#fde68a', '#fb7185', '#f97316'] },
    ].map((example) => <BorderGlow key={example.title} className="border-glow-demo__example" borderRadius={14} blurRadius={18} edgeDistance={38} coneSpread={52} gradientColors={example.colors}><span>{example.title}</span></BorderGlow>)}</section>
  </main>
}
