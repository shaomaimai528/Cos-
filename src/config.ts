export type WorkCategory = 'composite' | 'semiFinished' | 'portrait'

export type WorkItem = {
  id: string
  category: WorkCategory
  title: string
  image: string
  alt: string
  prompt: string
  tags: string[]
  index: number
}

export type PromptItem = {
  id: string
  title: string
  category: string
  summary: string
  prompt: string
  params: string
}

type ImageConfig = {
  placeholders: {
    black: string
    white: string
  }
  heroVideo: string | null
  heroVideoMobile: string | null
  ambientAudio: string | null
  hero: string
  heroMobile: string | null
  /**
   * 首页首屏下方的可替换背景素材。
   * video 优先于 image；image 既支持普通图片，也支持 GIF。
   * 两者都为 null 时保留现有纯色背景。
   */
  homeBackground: {
    video: string | null
    videoMobile: string | null
    image: string | null
    imageMobile: string | null
    opacity: number
  }
  qqGroupQr: string | null
  works: Record<WorkCategory, string[]>
  promptCards: string[]
  workflowSteps: string[]
  workflowArticles: string[]
}

const BLACK_PLACEHOLDER = '/placeholders/black.svg'
const WHITE_PLACEHOLDER = '/placeholders/white.svg'

/**
 * 全站图片统一替换入口。
 * 后续把图片放进 public/images/，再将对应槽位改成 `/images/文件名.扩展名` 即可。
 * 未上传的槽位继续使用纯黑、纯白占位图，QQ群二维码在上传前保持 null。
 */
export const imageConfig: ImageConfig = {
  placeholders: {
    black: BLACK_PLACEHOLDER,
    white: WHITE_PLACEHOLDER,
  },
  // 后续把视频放进 public/videos/，再改成 `/videos/文件名.mp4`。
  heroVideo: '/videos/homepage-desktop-clear.mp4',
  heroVideoMobile: '/videos/homepage-mobile.mp4',
  // 背景音乐：把音频放到 public/audio/ 后填入，例如 `/audio/ambient.mp3`。
  ambientAudio: '/audio/elegant-fantasy-piano.mp3',
  // 场景背景图（支持手机端单独设置）
  hero: BLACK_PLACEHOLDER,
  heroMobile: null as string | null,
  // 首页视频下方背景：可填 `/videos/loop.mp4` 或 `/images/loop.gif`。
  homeBackground: {
    video: null,
    videoMobile: null,
    image: null,
    imageMobile: null,
    opacity: 0.46,
  },
  qqGroupQr: '/images/contact/qq-group-qr.png',
  works: {
    composite: Array.from({ length: 10 }, () => BLACK_PLACEHOLDER),
    semiFinished: Array.from({ length: 20 }, () => BLACK_PLACEHOLDER),
    portrait: [
      BLACK_PLACEHOLDER, // 01
      BLACK_PLACEHOLDER, // 02
      BLACK_PLACEHOLDER, // 03
      BLACK_PLACEHOLDER, // 04
      BLACK_PLACEHOLDER, // 05
      WHITE_PLACEHOLDER, // 06
      BLACK_PLACEHOLDER, // 07
      BLACK_PLACEHOLDER, // 08
      BLACK_PLACEHOLDER, // 09
      BLACK_PLACEHOLDER, // 10
      BLACK_PLACEHOLDER, // 11
      BLACK_PLACEHOLDER, // 12
      BLACK_PLACEHOLDER, // 13
      BLACK_PLACEHOLDER, // 14
      BLACK_PLACEHOLDER, // 15
      BLACK_PLACEHOLDER, // 16
      BLACK_PLACEHOLDER, // 17
      BLACK_PLACEHOLDER, // 18
      BLACK_PLACEHOLDER, // 19
      BLACK_PLACEHOLDER, // 20
    ],
  },
  promptCards: [
    BLACK_PLACEHOLDER, // 01
    BLACK_PLACEHOLDER, // 02
    BLACK_PLACEHOLDER, // 03
    BLACK_PLACEHOLDER, // 04
    WHITE_PLACEHOLDER, // 05
    BLACK_PLACEHOLDER, // 06
  ],
  workflowSteps: [
    WHITE_PLACEHOLDER, // 01
    BLACK_PLACEHOLDER, // 02
    BLACK_PLACEHOLDER, // 03
    BLACK_PLACEHOLDER, // 04
  ],
  workflowArticles: [
    BLACK_PLACEHOLDER, // 01
    WHITE_PLACEHOLDER, // 02
    BLACK_PLACEHOLDER, // 03
  ],
}

export const isPlaceholderImage = (src: string | null | undefined) =>
  !src || src === imageConfig.placeholders.black || src === imageConfig.placeholders.white

const intro =
  '我在这里分享所有原创视觉作品，拆解图片合成、光影调色、氛围塑造的完整创作思路与细节逻辑。同时公开实战可用的 AI 提示词、参数搭配、工具操作技巧与完整使用方法。摒弃碎片化教程，专注落地、实用、可复刻的创作经验。从灵感构思、画面合成到最终出片，完整记录个人创作体系，既作为自我作品沉淀的专属阵地，也为喜欢视觉创作、AI 修图、影像合成的同好，提供可直接参考、学习、复用的创作参考。'

export const siteConfig = {
  brand: {
    title: '开源创意作品集',
    kicker: '开源视觉作品集 · 创意工作流',
    intro,
  },
  nav: [
    { label: '首页', href: '/' },
    { label: '例图展示', href: '/works' },
    { label: '联系方式', href: '/#contact' },
  ],
  contact: {
    qq: '',
    group: '',
  },
  copy: {
    heroNote: '原创视觉 / 图片合成 / 光影叙事',
    works: {
      eyebrow: '01 / 场景包预设',
      title: '场景包预设',
      description: '',
    },
    prompts: {
      eyebrow: '02 / 提示词库',
      title: '提示词库',
      description: '',
    },
    workflow: {
      eyebrow: '03 / 工作流分享',
      title: '工作流分享',
      description: '',
    },
    contact: {
      eyebrow: '04 / 联系',
      title: '交流作品，也交流方法。',
    },
  },
  workCategories: {
    composite: {
      label: '大合成',
      heading: '大合成',
      count: 10,
      speed: 26,
      tags: ['场景合成', '光影统一', '氛围塑造'],
    },
    semiFinished: {
      label: '半合成X立绘还原',
      heading: '半合成X立绘还原',
      count: 11,
      speed: 22,
      tags: ['原始素材', '合成阶段', '细节调整'],
    },
    portrait: {
      label: '场照半合成预制菜',
      heading: '场照半合成预制菜',
      count: 20,
      speed: 24,
      tags: ['肤质修整', '轮廓塑造', '色彩氛围'],
    },
  },
} as const

const titlePools: Record<WorkCategory, string[]> = {
  composite: ['第五人格白夫人', '鸣潮-月', '玛奇玛', '明日方舟黍', '鸣潮-日', '旧城星轨', 'saber白枪', '卡芙卡'],
  semiFinished: ['原始素材一', '光影合成二', '轮廓校正三', '氛围试片四', '材质叠加五', '色彩实验六'],
  portrait: ['明日方舟', '雨后肖像', '琥珀眼神', '白昼之外', '黑羽与雾', '柔焦夜行'],
}

const promptPools: Record<WorkCategory, string[]> = {
  composite: [
    'Create a 21:9 cinematic full-scene resynthesis optimized for Nano Banana Pro.\n\nUse the uploaded image only for the character, face, hair, makeup, outfit, accessories, body silhouette, pose, scale, framing, crop, camera perspective, and any weapon or prop physically held, worn, carried, attached to, or strongly interacting with the character. 只保留参考图中的人物主体、脸、发型、妆容、服装、饰品、身体姿态、比例、裁切、透视、手持 / 佩戴 / 背负 / 强绑定道具武器。Completely discard the original background, white background, gray background, solid-color background, transparent checkerboard, empty canvas artifacts, studio setup, indoor set, outdoor location, floor, wall, furniture, scenery, and all unrelated objects. 绝对不要把原背景、白底、灰底、纯色底、透明棋盘格或无关物件画进最终图。\n\nThe reference is a cutout / solid-background character image, so the original horizon cannot be verified. However, create a subtle matching Dutch angle in the new environment based on the character\'s slight head tilt: apply a gentle 4-degree camera roll to the left, so furniture edges, cabinet lines, window frames, floor perspective, and foreground framing follow the character\'s tilt direction. The world remains physically stable in 3D; the tilt comes from camera roll, not from a physically sloped ground.\n\n角色与主题：第五人格手游角色红夫人应许之日皮肤 cos\n画面风格方向：电影写实 / UE5 写实 / Blender 写实\n必须出现的场景元素：在一个巴洛克和托斯卡纳风格的白色婚礼教堂中。\n场景情绪：华丽 自信 唯美\n\nNow build a completely new cinematic environment inside a Baroque style sacristy of a Tuscan white wedding church, early morning soft light. 画面必须是完整影视级重合成，不是原图换背景贴图。Keep the character identity, pose, expression, outfit, body proportion, visible crop, and physically attached props consistent with the reference. Do not complete missing body parts. Do not repair original defects.\n\nDesign clear foreground, midground, and background. Foreground should be light to medium intensity, creating intimate depth and layering without covering the face. 前景可以轻微遮挡衣摆、腿部边缘、道具边缘和画面角落，但绝不遮挡人物面部、眼睛、表情和关键握持关系。Midground within 1-3 meters around the character must contain coherent scene objects, ground contact, contact shadows, ambient occlusion, and material details. Background must establish intimate room depth, architectural details, and lower contrast atmospheric perspective.\n\nLighting must follow the reference character\'s top-left soft light direction and face readability, adapted to early morning window light. Add coherent soft window light, warm furniture bounce light, gentle ambient occlusion, contact shadows, realistic PBR material response, and cinematic color grading. 人物脸部必须清晰完整、无遮挡、最高可读。Use a strong black-white-gray hierarchy: darker foreground objects at bottom left, bright and readable character face and dress upper part, rich midground furniture details, and soft low-contrast background room depth.\n\nPhotorealistic cinematic composite, UE5 realistic global illumination, Blender realistic PBR materials, physically based rendering, high dynamic range, filmic tone mapping, soft diffused atmosphere, realistic contact shadows, layered foreground midground background, detailed but not cluttered environment, ultra long detailed prompt to maximize model performance.\n\nSpecific scene details: The character sits on a vintage velvet armchair in an ornate Baroque sacristy. Surrounding her are white carved storage cabinets and Tuscan style vintage furniture. Foreground features a blurred silver candelabra, a corner of a table with white flowers, and an open vintage hymnal, partially framing the bottom left of the frame. Midground includes the dark velvet armchair, ornate white carved cabinets on both sides, a vintage wool rug on the floor, scattered lace veil fragments, pearls and rose petals around the chair, and soft contact shadows. Background features a tall carved floor mirror, a religious oil painting on the wall, a small high arched window with soft morning light, and a half-open wooden door leading to deeper space, all softened by gentle haze. Soft diffused morning light pours from the high window on the left, creating extremely gentle shadows. Warm wood and furniture tones provide subtle bounce light. The overall palette is low-saturation milky white, warm beige, and soft brown, with accents of pearl white and warm gold, creating an intimate, quiet, elegant, and gorgeously serene atmosphere.\n\nNegative constraints: no original background, no checkerboard, no white/gray/solid background, no studio look, no empty plain background, no extra people unless explicitly requested, no extra limbs, no wrong fingers, no changed face, no changed hairstyle, no changed outfit structure, no changed pose, no changed prop type, no floating prop, no broken hand contact, no face obstruction, no random objects, no brightness blending between character and background, no conflicting light direction, no physically sloped ground.',
    '暗黑幻想舞台，冷月穿过高大拱窗，人物服装与环境材质保持真实比例，细腻体积光，克制的胶片颗粒。',
  ],
  semiFinished: [
    '保留原始素材边缘与遮罩关系，先统一环境光色，再用柔和反射补足主体与背景的接触感。',
    '展示合成过程中的结构层，强调透视、边缘、阴影和色温之间的逻辑，不追求过度锐化。',
  ],
  portrait: [
    '保留真实皮肤纹理的人像精修，眼神清晰，轮廓柔和，冷暖交界自然，避免塑料感和过度磨皮。',
    '低饱和戏剧光人像，面部高光有层次，发丝与背景分离，肤色稳定，氛围安静但有张力。',
  ],
}

const imageFor = (category: WorkCategory, index: number) => (
  imageConfig.works[category][index] ?? imageConfig.placeholders.black
)

const buildWorks = (category: WorkCategory): WorkItem[] => {
  const categoryConfig = siteConfig.workCategories[category]
  const titles = titlePools[category]
  const categoryPrompts = promptPools[category]

  return Array.from({ length: categoryConfig.count }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    const image = imageFor(category, index)
    return {
      id: category + '-' + number,
      category,
      title: titles[index % titles.length] + ' ' + number,
      image,
      alt: categoryConfig.label + (isPlaceholderImage(image) ? '占位作品 ' : '作品 ') + number,
      prompt: categoryPrompts[index % categoryPrompts.length],
      tags: categoryConfig.tags.slice(0, 2 + (index % 2)),
      index: index + 1,
    }
  })
}

export const worksByCategory: Record<WorkCategory, WorkItem[]> = {
  composite: buildWorks('composite'),
  semiFinished: buildWorks('semiFinished'),
  portrait: buildWorks('portrait'),
}

export const allWorks = Object.values(worksByCategory).flat()

export const prompts: PromptItem[] = [
  {
    id: 'prompt-01',
    title: '旧城天台的潮湿光',
    category: '场景合成',
    summary: '用环境反射和低饱和霓虹建立夜景的真实空间感。',
    prompt: '电影感 COS 场景合成，潮湿旧城天台，低饱和霓虹倒影，人物与环境光方向一致，薄雾，真实镜头，细腻胶片颗粒，克制高光，保留材质纹理。',
    params: '宽画幅 / 冷暖对比 / 低饱和',
  },
  {
    id: 'prompt-02',
    title: '月面剧场的冷色边缘',
    category: '氛围塑造',
    summary: '让月光成为画面的主线，边缘光负责把人物从黑里捞出来。',
    prompt: '暗黑幻想舞台，月光穿过高大拱窗，人物轮廓有细窄冷色边缘光，背景深灰绿，空气中有轻微尘埃，真实摄影质感，避免过度发光。',
    params: '中长焦 / 冷色边缘光 / 深阴影',
  },
  {
    id: 'prompt-03',
    title: '保留遮罩的合成过程',
    category: '后期拆解',
    summary: '先让结构成立，再处理风格；把每一步的判断留下来。',
    prompt: '展示一张 COS 合成作品的阶段性拆解，保留原始素材边缘、遮罩关系、阴影层与色彩校正层，信息清晰，层级克制，适合教程排版。',
    params: '结构优先 / 图层逻辑 / 过程记录',
  },
  {
    id: 'prompt-04',
    title: '不磨掉纹理的人像',
    category: '人像精修',
    summary: '皮肤仍然是皮肤，光线只是让它更有呼吸。',
    prompt: '真实皮肤纹理的人像精修，保留细微毛孔与自然高光，眼神清晰，轮廓柔和，冷暖交界自然，发丝与背景分离，避免塑料感。',
    params: '纹理保留 / 局部修光 / 低锐化',
  },
  {
    id: 'prompt-05',
    title: '雾里出现的旧城',
    category: '环境构建',
    summary: '用远近层次和雾的透明度，让背景退到正确的位置。',
    prompt: '雾中旧城街道，远景建筑低对比，近景有湿润反射，主体被一束柔和暖光照亮，空气透视明确，电影剧照质感，真实比例。',
    params: '空气透视 / 暖光主体 / 深景深',
  },
  {
    id: 'prompt-06',
    title: '柔焦夜行肖像',
    category: '人物氛围',
    summary: '控制柔焦范围，只让情绪柔下来，不让细节消失。',
    prompt: '低饱和戏剧光人像，夜色背景，面部保留真实细节，发丝有微弱轮廓光，柔焦只落在远景，情绪安静但有张力。',
    params: '柔焦控制 / 轮廓光 / 低对比',
  },
]

export const workflowSteps = [
  { id: '01', title: '灵感构思', summary: '先决定画面要让人感受到什么。', icon: 'spark' },
  { id: '02', title: '素材处理', summary: '整理比例、透视、边缘与光线方向。', icon: 'layers' },
  { id: '03', title: '光影合成', summary: '让主体真正进入环境，而不是贴在环境上。', icon: 'sun' },
  { id: '04', title: '调色出片', summary: '用颜色统一叙事，把细节收束到情绪。', icon: 'sliders' },
]

export const workflowArticles = [
  {
    id: 'workflow-01',
    title: '先看光，再看颜色',
    summary: '合成失败通常不是颜色不够漂亮，而是光线没有站在同一边。',
    body: ['先标记主体和背景的主光方向，再决定阴影的软硬程度。', '颜色校正应该服务于空间关系，不能用一层滤镜掩盖透视和接触感。'],
  },
  {
    id: 'workflow-02',
    title: '让 AI 提示词服务于画面',
    summary: '提示词不是越长越好，真正有用的是可控的动词和明确的限制。',
    body: ['先写主体、环境、光线和镜头，再补充材质、情绪与限制项。', '把可以手动修正的细节留给后期，不要试图一次生成全部答案。'],
  },
  {
    id: 'workflow-03',
    title: '一张图的复盘顺序',
    summary: '从远到近、从大到小、从结构到质感，复盘才不会陷入局部。',
    body: ['先看缩小后的构图和明暗，再看人物边缘与环境接触，最后处理皮肤、材质和颗粒。', '每次只改变一个变量，才能知道画面为什么变好或变坏。'],
  },
]
