import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Camera, Sparkles, Ruler, FileDown, Upload, Image, Shield, ArrowRight, ArrowLeft, Download, Printer, Palette, Sun, CircleDot, RotateCcw, MoveVertical, Info, Shirt, Layers, Package, ZoomIn } from 'lucide-react'
import { removeBackground, preload } from '@imgly/background-removal'
import { jsPDF } from 'jspdf'

// --- Types & Constants ---
type Step = 'upload' | 'edit' | 'download'
type Lang = 'zh' | 'en'
type BgColor = 'white' | 'blue' | 'red' | 'transparent' | 'custom'
type Clothing = 'none' | 'white-shirt' | 'suit'
type ProgressState = { stage: string; progress: number } | null

type Category = 'china' | 'international' | 'social' | 'other'

interface SizePreset {
  labelZh: string
  labelEn: string
  wMm: number
  hMm: number
  wPx: number
  hPx: number
  category: Category
}

const BG_COLORS: Record<Exclude<BgColor, 'custom'>, string> = {
  white: '#FFFFFF',
  blue: '#438EDB',
  red: '#BE0000',
  transparent: '',
}

const SIZE_PRESETS: SizePreset[] = [
  { labelZh: '一寸 25×35mm', labelEn: '1" 25×35mm', wMm: 25, hMm: 35, wPx: 295, hPx: 413, category: 'china' },
  { labelZh: '二寸 35×49mm', labelEn: '2" 35×49mm', wMm: 35, hMm: 49, wPx: 413, hPx: 579, category: 'china' },
  { labelZh: '小二寸 35×45mm', labelEn: 'Small 2" 35×45mm', wMm: 35, hMm: 45, wPx: 413, hPx: 531, category: 'china' },
  { labelZh: '大一寸 33×48mm', labelEn: 'Large 1" 33×48mm', wMm: 33, hMm: 48, wPx: 390, hPx: 567, category: 'china' },
  { labelZh: '护照 33×48mm', labelEn: 'Passport 33×48mm', wMm: 33, hMm: 48, wPx: 390, hPx: 567, category: 'international' },
  { labelZh: '签证 51×51mm', labelEn: 'Visa 51×51mm', wMm: 51, hMm: 51, wPx: 600, hPx: 600, category: 'international' },
  { labelZh: '微信头像 640×640px', labelEn: 'WeChat 640×640px', wMm: 26, hMm: 26, wPx: 640, hPx: 640, category: 'social' },
  { labelZh: 'LinkedIn 400×400px', labelEn: 'LinkedIn 400×400px', wMm: 17, hMm: 17, wPx: 400, hPx: 400, category: 'social' },
  { labelZh: '驾照 22×32mm', labelEn: 'License 22×32mm', wMm: 22, hMm: 32, wPx: 260, hPx: 378, category: 'other' },
  { labelZh: '学生证 25×35mm', labelEn: 'Student ID 25×35mm', wMm: 25, hMm: 35, wPx: 295, hPx: 413, category: 'other' },
]

const CATEGORIES: { key: Category | 'all'; labelZh: string; labelEn: string }[] = [
  { key: 'all', labelZh: '全部', labelEn: 'All' },
  { key: 'china', labelZh: '中国证件', labelEn: 'China' },
  { key: 'international', labelZh: '国际签证', labelEn: 'International' },
  { key: 'social', labelZh: '社交头像', labelEn: 'Social' },
  { key: 'other', labelZh: '其他', labelEn: 'Other' },
]

// --- Translations ---
const t = (lang: Lang) => ({
  title: lang === 'zh' ? '证件照制作工具' : 'ID Photo Maker',
  subtitle: lang === 'zh' ? 'AI 智能抠图，一键生成标准证件照' : 'AI background removal, generate standard ID photos in one click',
  uploadTitle: lang === 'zh' ? '上传照片' : 'Upload Photo',
  uploadHint: lang === 'zh' ? '拖拽照片到此处，或点击选择文件' : 'Drag & drop a photo here, or click to browse',
  uploadFormats: lang === 'zh' ? '支持 JPG、PNG、WebP 格式' : 'Supports JPG, PNG, WebP',
  removing: lang === 'zh' ? '正在去除背景...' : 'Removing background...',
  bgColor: lang === 'zh' ? '背景颜色' : 'Background Color',
  photoSize: lang === 'zh' ? '照片尺寸' : 'Photo Size',
  preview: lang === 'zh' ? '预览' : 'Preview',
  back: lang === 'zh' ? '返回' : 'Back',
  next: lang === 'zh' ? '下一步' : 'Next',
  backToEdit: lang === 'zh' ? '返回编辑' : 'Back to Edit',
  downloadPhoto: lang === 'zh' ? '下载证件照 (PNG)' : 'Download Photo (PNG)',
  downloadPrint: lang === 'zh' ? '下载排版打印 (PDF)' : 'Download Print Layout (PDF)',
  white: lang === 'zh' ? '白色' : 'White',
  blue: lang === 'zh' ? '蓝色' : 'Blue',
  red: lang === 'zh' ? '红色' : 'Red',
  transparent: lang === 'zh' ? '透明' : 'Transparent',
  custom: lang === 'zh' ? '自定义' : 'Custom',
  manualEdit: lang === 'zh' ? '手动修图' : 'Manual Edit',
  manualEditHint: lang === 'zh' ? '用画笔擦除不需要的部分（红色蒙版）' : 'Paint over unwanted areas (red mask)',
  brushSize: lang === 'zh' ? '画笔大小' : 'Brush Size',
  eraserMode: lang === 'zh' ? '橡皮擦（恢复）' : 'Eraser (Restore)',
  paintMode: lang === 'zh' ? '画笔（擦除）' : 'Brush (Erase)',
  undoEdit: lang === 'zh' ? '撤销' : 'Undo',
  applyEdit: lang === 'zh' ? '应用修改' : 'Apply Changes',
  step1: lang === 'zh' ? '第 1 步' : 'Step 1',
  step2: lang === 'zh' ? '第 2 步' : 'Step 2',
  step3: lang === 'zh' ? '第 3 步' : 'Step 3',
  stepUpload: lang === 'zh' ? '上传照片' : 'Upload Photo',
  stepEdit: lang === 'zh' ? '编辑调整' : 'Edit & Adjust',
  stepDownload: lang === 'zh' ? '下载保存' : 'Download',
  originalPhoto: lang === 'zh' ? '原始照片' : 'Original Photo',
  footerText: lang === 'zh' ? '基于 AI 的证件照生成工具 · 本地处理，照片不会上传到任何服务器' : 'AI-powered ID photo generator · All processing happens locally in your browser',
  feature1Title: lang === 'zh' ? 'AI 智能抠图' : 'AI Background Removal',
  feature1Desc: lang === 'zh' ? '本地处理，隐私安全，无需上传到服务器' : 'Local processing, privacy safe, no server upload',
  feature2Title: lang === 'zh' ? '多种尺寸' : 'Multiple Sizes',
  feature2Desc: lang === 'zh' ? '一寸、二寸、护照、签证等标准尺寸' : '1", 2", passport, visa and more standard sizes',
  feature3Title: lang === 'zh' ? '一键排版打印' : 'One-click Print',
  feature3Desc: lang === 'zh' ? '自动排版 A4 纸，PDF 输出直接打印' : 'Auto layout on A4 paper, PDF output for printing',
  downloadDone: lang === 'zh' ? '🎉 证件照已生成！选择下载方式即可保存' : '🎉 ID photo ready! Choose a download option below',
  clothing: lang === 'zh' ? '底衣' : 'Clothing',
  clothingNone: lang === 'zh' ? '无' : 'None',
  clothingWhiteShirt: lang === 'zh' ? '白衬衫' : 'White Shirt',
  clothingSuit: lang === 'zh' ? '西装' : 'Suit',
})

// --- Helper: load image from File or URL ---
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img") as HTMLImageElement
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// --- Helper: detect face and crop ---
async function detectAndCrop(canvas: HTMLCanvasElement, targetRatio: number, cropOffsetY = 0): Promise<HTMLCanvasElement> {
  const imgEl = document.createElement("img") as HTMLImageElement
  imgEl.src = canvas.toDataURL('image/png')

  await new Promise<void>((resolve) => {
    imgEl.onload = () => resolve()
  })

  const hasFaceAPI = 'FaceDetector' in window
  let faceBox: DOMRect | null = null

  if (hasFaceAPI) {
    try {
      const detector = new (window as any).FaceDetector()
      const faces = await detector.detect(imgEl)
      if (faces.length > 0) {
        faceBox = faces[0].boundingBox
      }
    } catch {
      // FaceDetector failed, fallback to center crop
    }
  }

  const srcW = canvas.width
  const srcH = canvas.height

  let cropX: number, cropY: number, cropW: number, cropH: number

  if (faceBox) {
    const faceCX = faceBox.x + faceBox.width / 2
    const faceCY = faceBox.y + faceBox.height / 2
    const faceSize = Math.max(faceBox.width, faceBox.height)

    const padFactor = 1.8
    cropW = faceSize * padFactor
    cropH = cropW / targetRatio

    const desiredFaceY = cropH * 0.33
    cropY = faceCY - desiredFaceY
    cropX = faceCX - cropW / 2

    cropX = Math.max(0, Math.min(srcW - cropW, cropX))
    cropY = Math.max(0, Math.min(srcH - cropH, cropY))
    cropY = Math.max(0, Math.min(srcH - cropH, cropY + cropOffsetY))

    if (cropW > srcW || cropH > srcH) {
      cropW = srcW
      cropH = srcW / targetRatio
      cropX = 0
      cropY = Math.max(0, (srcH - cropH) / 2)
    }
  } else {
    if (srcW / srcH > targetRatio) {
      cropH = srcH
      cropW = srcH * targetRatio
    } else {
      cropW = srcW
      cropH = srcW / targetRatio
    }
    cropX = (srcW - cropW) / 2
    cropY = (srcH - cropH) / 2
    cropY = Math.max(0, Math.min(srcH - cropH, cropY + cropOffsetY))
  }

  const out = document.createElement('canvas')
  out.width = Math.round(cropW)
  out.height = Math.round(cropH)
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height)
  return out
}

// --- Helper: composite cutout onto background color, scaled to target size ---
function compositePhoto(
  cutoutCanvas: HTMLCanvasElement,
  bgColor: BgColor,
  size: SizePreset,
  customBgColor = '#438EDB',
  brightness = 100,
  contrast = 100,
  smoothing = 0,
  clothing: Clothing = 'none'
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = size.wPx
  out.height = size.hPx
  const ctx = out.getContext('2d')!

  if (bgColor === 'custom') {
    ctx.fillStyle = customBgColor
    ctx.fillRect(0, 0, out.width, out.height)
  } else if (bgColor !== 'transparent') {
    ctx.fillStyle = BG_COLORS[bgColor]
    ctx.fillRect(0, 0, out.width, out.height)
  }

  const srcRatio = cutoutCanvas.width / cutoutCanvas.height
  const dstRatio = size.wPx / size.hPx

  let dw: number, dh: number, dx: number, dy: number
  if (srcRatio > dstRatio) {
    dw = out.width
    dh = dw / srcRatio
  } else {
    dh = out.height
    dw = dh * srcRatio
  }
  dx = (out.width - dw) / 2
  dy = (out.height - dh) / 2

  ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100})`
  ctx.drawImage(cutoutCanvas, dx, dy, dw, dh)
  ctx.filter = 'none'

  // Draw clothing overlay
  if (clothing !== 'none') {
    const w = out.width
    const h = out.height
    const centerX = w / 2
    const bottom = h

    if (clothing === 'white-shirt') {
      // White shirt with V-neck
      const shoulderW = w * 0.35
      ctx.fillStyle = 'white'
      ctx.shadowColor = 'rgba(0,0,0,0.15)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = -4
      ctx.beginPath()
      ctx.moveTo(centerX - shoulderW, bottom)
      ctx.quadraticCurveTo(centerX - shoulderW * 0.6, bottom - h * 0.18, centerX - w * 0.02, bottom - h * 0.28)
      ctx.quadraticCurveTo(centerX, bottom - h * 0.30, centerX + w * 0.02, bottom - h * 0.28)
      ctx.quadraticCurveTo(centerX + shoulderW * 0.6, bottom - h * 0.18, centerX + shoulderW, bottom)
      ctx.closePath()
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      // Collar lines
      ctx.strokeStyle = '#e0e0e0'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(centerX - shoulderW * 0.5, bottom - h * 0.02)
      ctx.quadraticCurveTo(centerX - shoulderW * 0.3, bottom - h * 0.20, centerX - w * 0.01, bottom - h * 0.27)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(centerX + shoulderW * 0.5, bottom - h * 0.02)
      ctx.quadraticCurveTo(centerX + shoulderW * 0.3, bottom - h * 0.20, centerX + w * 0.01, bottom - h * 0.27)
      ctx.stroke()
    } else if (clothing === 'suit') {
      // Suit jacket
      const suitTop = bottom * 0.68
      ctx.fillStyle = '#1a1a2e'
      ctx.shadowColor = 'rgba(0,0,0,0.2)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = -4
      ctx.beginPath()
      ctx.moveTo(centerX - w * 0.45, bottom)
      ctx.quadraticCurveTo(centerX - w * 0.45, suitTop + 10, centerX - w * 0.15, suitTop + 5)
      ctx.lineTo(centerX - w * 0.04, bottom - h * 0.32)
      ctx.lineTo(centerX, bottom - h * 0.30)
      ctx.lineTo(centerX + w * 0.04, bottom - h * 0.32)
      ctx.lineTo(centerX + w * 0.15, suitTop + 5)
      ctx.quadraticCurveTo(centerX + w * 0.45, suitTop + 10, centerX + w * 0.45, bottom)
      ctx.closePath()
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      // White shirt inner
      ctx.fillStyle = '#f5f5f5'
      ctx.beginPath()
      ctx.moveTo(centerX - w * 0.04, bottom)
      ctx.lineTo(centerX - w * 0.02, bottom - h * 0.33)
      ctx.lineTo(centerX, bottom - h * 0.30)
      ctx.lineTo(centerX + w * 0.02, bottom - h * 0.33)
      ctx.lineTo(centerX + w * 0.04, bottom)
      ctx.closePath()
      ctx.fill()
      // Tie
      const tieGrad = ctx.createLinearGradient(centerX, bottom - h * 0.28, centerX, bottom)
      tieGrad.addColorStop(0, '#6B0000')
      tieGrad.addColorStop(0.4, '#8B0000')
      tieGrad.addColorStop(1, '#5a0000')
      ctx.fillStyle = tieGrad
      ctx.beginPath()
      ctx.moveTo(centerX - w * 0.018, bottom - h * 0.22)
      ctx.lineTo(centerX, bottom - h * 0.28)
      ctx.lineTo(centerX + w * 0.018, bottom - h * 0.22)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(centerX - w * 0.022, bottom - h * 0.22)
      ctx.lineTo(centerX - w * 0.012, bottom)
      ctx.lineTo(centerX + w * 0.012, bottom)
      ctx.lineTo(centerX + w * 0.022, bottom - h * 0.22)
      ctx.closePath()
      ctx.fill()
      // Lapel lines
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(centerX - w * 0.12, suitTop + 8)
      ctx.lineTo(centerX - w * 0.035, bottom - h * 0.32)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(centerX + w * 0.12, suitTop + 8)
      ctx.lineTo(centerX + w * 0.035, bottom - h * 0.32)
      ctx.stroke()
    }
  }

  if (smoothing > 0) {
    const blurCanvas = document.createElement('canvas')
    blurCanvas.width = out.width
    blurCanvas.height = out.height
    const blurCtx = blurCanvas.getContext('2d')!
    const blurAmount = Math.round(smoothing / 10)
    blurCtx.filter = `blur(${blurAmount}px)`
    blurCtx.drawImage(out, 0, 0)
    ctx.globalAlpha = smoothing / 100 * 0.5
    ctx.drawImage(blurCanvas, 0, 0)
    ctx.globalAlpha = 1
  }

  return out
}

// --- Helper: generate print PDF ---
function generatePrintPDF(photoCanvas: HTMLCanvasElement, size: SizePreset, lang: Lang) {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageW = 210, pageH = 297
  const gap = 2
  const photoW = size.wMm
  const photoH = size.hMm

  const cols = Math.floor((pageW + gap) / (photoW + gap))
  const rows = Math.floor((pageH + gap) / (photoH + gap))
  const totalW = cols * photoW + (cols - 1) * gap
  const totalH = rows * photoH + (rows - 1) * gap
  const startX = (pageW - totalW) / 2
  const startY = (pageH - totalH) / 2

  const imgData = photoCanvas.toDataURL('image/png')

  pdf.addImage(imgData, 'PNG', startX, startY, photoW, photoH)

  const drawCutLines = () => {
    pdf.setDrawColor(200, 200, 200)
    pdf.setLineWidth(0.1)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (photoW + gap)
        const y = startY + r * (photoH + gap)
        pdf.rect(x, y, photoW, photoH)
      }
    }
  }

  for (let i = 1; i < rows * cols; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = startX + c * (photoW + gap)
    const y = startY + r * (photoH + gap)
    pdf.addImage(imgData, 'PNG', x, y, photoW, photoH)
  }
  drawCutLines()

  const title = lang === 'zh' ? '证件照排版' : 'ID Photo Layout'
  pdf.save(`${title}_${size.labelEn.replace(/\s/g, '_')}.pdf`)
}

// --- Checkerboard pattern for transparent bg ---
const checkerStyle = {
  backgroundImage: `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `,
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
}

// --- Step indicator ---
function StepIndicator({ currentStep, strings }: { currentStep: Step; strings: ReturnType<typeof t> }) {
  const steps: { key: Step; label: string; num: string }[] = [
    { key: 'upload', label: strings.stepUpload, num: '1' },
    { key: 'edit', label: strings.stepEdit, num: '2' },
    { key: 'download', label: strings.stepDownload, num: '3' },
  ]
  const currentIndex = steps.findIndex(s => s.key === currentStep)

  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((s, i) => {
        const isActive = s.key === currentStep
        const isPast = i < currentIndex
        const isLast = i === steps.length - 1
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex items-center gap-2.5">
              <div className={`relative flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 ${
                isPast ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' :
                isActive ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 scale-110' :
                'bg-slate-100 text-slate-400'
              }`}>
                {isPast ? '✓' : s.num}
                {isActive && (
                  <span className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 animate-ping opacity-20" />
                )}
              </div>
              <span className={`text-sm font-semibold transition-colors duration-300 ${
                isActive ? 'text-slate-900' : isPast ? 'text-blue-600' : 'text-slate-400'
              }`}>{s.label}</span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-px mx-4 transition-colors duration-300 ${
                i < currentIndex ? 'bg-blue-300' : 'bg-slate-200'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ==================== APP ====================
export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [lang, setLang] = useState<Lang>('en')
  const [, setOriginalFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string>('')
  const [removing, setRemoving] = useState(false)
  const [removingProgress, setRemovingProgress] = useState<ProgressState>(null)
  const [preloading, setPreloading] = useState(true)
  const [preloadProgress, setPreloadProgress] = useState(0)
  const [cutoutCanvas, setCutoutCanvas] = useState<HTMLCanvasElement | null>(null)
  const [bgColor, setBgColor] = useState<BgColor>('white')
  const [customBgColor, setCustomBgColor] = useState('#438EDB')
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [sizeIndex, setSizeIndex] = useState(0)
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all')

  const filteredPresets = useMemo(() =>
    activeCategory === 'all' ? SIZE_PRESETS : SIZE_PRESETS.filter(s => s.category === activeCategory),
    [activeCategory]
  )
  const [finalCanvas, setFinalCanvas] = useState<HTMLCanvasElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [editHistory, setEditHistory] = useState<ImageData[]>([])
  const [brushRadius, setBrushRadius] = useState(15)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [smoothing, setSmoothing] = useState(0)
  const [upscaled, setUpscaled] = useState(false)
  const [upscaling, setUpscaling] = useState(false)
  const [isEraser, setIsEraser] = useState(false)
  const [clothing, setClothing] = useState<Clothing>('none')
  const [cropOffsetY, setCropOffsetY] = useState(0)
  const originalCutoutRef = useRef<HTMLCanvasElement | null>(null)
  const editCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCamera, setShowCamera] = useState(false)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [batchResults, setBatchResults] = useState<Array<{ fileName: string; canvas: HTMLCanvasElement }>>([])
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)

  const strings = t(lang)
  const size = SIZE_PRESETS[sizeIndex]

  // Preload AI model on page load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setPreloadProgress(10)
        await new Promise(r => setTimeout(r, 100))
        setPreloadProgress(30)
        await preload()
        if (!cancelled) {
          setPreloadProgress(90)
          await new Promise(r => setTimeout(r, 100))
          setPreloadProgress(100)
        }
      } catch (e) {
      } finally {
        if (!cancelled) setPreloading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Stop camera stream
  useEffect(() => {
    if (!showCamera) {
      cameraStreamRef.current?.getTracks().forEach(t => t.stop())
      cameraStreamRef.current = null
    }
  }, [showCamera])

  // Process uploaded file with retry
  const processFile = useCallback(async (file: File | Blob, attempt = 1) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert(lang === 'zh' ? '不支持的文件格式，请上传 JPG、PNG 或 WebP 图片。' : 'Unsupported file format. Please upload a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      alert(lang === 'zh' ? '文件太大，请选择 20MB 以内的图片。' : 'File too large. Please select an image under 20MB.')
      return
    }
    if (file instanceof File) setOriginalFile(file)
    else setOriginalFile(new File([file], 'camera-photo.jpg', { type: file.type }))
    setOriginalUrl(URL.createObjectURL(file))
    setStep('edit')
    setRemoving(true)
    setRemovingProgress(null)
    try {
      const blob = await removeBackground(file, {
        progress: (key: string, current: number, total: number) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0
          setRemovingProgress({ stage: key, progress: pct })
        },
      })
      const url = URL.createObjectURL(blob)
      const img = await loadImage(url)
      const canvas = document.createElement('canvas')
      const MAX_DIM = 2000
      let drawW = img.naturalWidth
      let drawH = img.naturalHeight
      if (Math.max(drawW, drawH) > MAX_DIM) {
        const scale = MAX_DIM / Math.max(drawW, drawH)
        drawW = Math.round(drawW * scale)
        drawH = Math.round(drawH * scale)
      }
      canvas.width = drawW
      canvas.height = drawH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      setCutoutCanvas(canvas)
      const orig = document.createElement('canvas')
      orig.width = canvas.width
      orig.height = canvas.height
      orig.getContext('2d')!.drawImage(canvas, 0, 0)
      originalCutoutRef.current = orig
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(`Background removal failed (attempt ${attempt}):`, err)
      if (attempt < 2) {
        setRemovingProgress({ stage: 'retry', progress: 0 })
        await new Promise(r => setTimeout(r, 2000))
        return processFile(file, attempt + 1)
      }
      alert(lang === 'zh' ? '背景去除失败，可能是网络问题（模型下载约40MB）。请检查网络后重试，或尝试使用 VPN。' : 'Background removal failed. This is likely a network issue (model download ~40MB). Please check your connection and retry, or try using a VPN.')
      setStep('upload')
    } finally {
      setRemoving(false)
    }
  }, [lang])

  // When cutout changes, regenerate final
  useEffect(() => {
    if (!cutoutCanvas) return
    const targetRatio = size.wPx / size.hPx
    detectAndCrop(cutoutCanvas, targetRatio, cropOffsetY).then((cropped) => {
      const final = compositePhoto(cropped, bgColor, size, customBgColor, brightness, contrast, smoothing, clothing)
      setFinalCanvas(final)
    })
  }, [cutoutCanvas, bgColor, sizeIndex, brightness, contrast, smoothing, cropOffsetY, clothing])

  // Batch processing
  const processBatchFiles = useCallback(async (files: File[]) => {
    const limited = files.slice(0, 20)
    setBatchProcessing(true)
    setBatchResults([])
    setBatchProgress(0)
    for (let i = 0; i < limited.length; i++) {
      try {
        const blob = await removeBackground(limited[i])
        const url = URL.createObjectURL(blob)
        const img = await loadImage(url)
        const canvas = document.createElement('canvas')
        const MAX_DIM = 2000
        let dw = img.naturalWidth
        let dh = img.naturalHeight
        if (Math.max(dw, dh) > MAX_DIM) {
          const scale = MAX_DIM / Math.max(dw, dh)
          dw = Math.round(dw * scale)
          dh = Math.round(dh * scale)
        }
        canvas.width = dw
        canvas.height = dh
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        const targetRatio = size.wPx / size.hPx
        const cropped = await detectAndCrop(canvas, targetRatio)
        const final = compositePhoto(cropped, bgColor, size, customBgColor, brightness, contrast, smoothing, clothing)
        setBatchResults(prev => [...prev, { fileName: limited[i].name, canvas: final }])
      } catch (err) {
        console.error(`Batch processing failed for ${limited[i].name}:`, err)
      }
      setBatchProgress(Math.round(((i + 1) / limited.length) * 100))
    }
    setBatchProcessing(false)
  }, [size, bgColor, customBgColor, brightness, contrast, smoothing, clothing])

  // Drag & drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (batchMode) {
      const files = Array.from(e.dataTransfer.files).filter(f => ['image/jpeg','image/png','image/webp'].includes(f.type))
      if (files.length > 0) processBatchFiles(files)
      return
    }
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile, batchMode, processBatchFiles])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (batchMode) {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) processBatchFiles(files)
      return
    }
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile, batchMode])

  const previewDataUrl = useMemo(() => finalCanvas?.toDataURL() ?? '', [finalCanvas])
  const downloadDataUrl = useMemo(() => finalCanvas?.toDataURL() ?? '', [finalCanvas])

  const handleDownloadPNG = () => {
    if (!finalCanvas) return
    const link = document.createElement('a')
    link.download = `photo_${size.labelEn.replace(/\s/g, '_')}.png`
    link.href = finalCanvas.toDataURL('image/png')
    link.click()
  }

  const handleDownloadJPG = () => {
    if (!finalCanvas) return
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = finalCanvas.width
    tempCanvas.height = finalCanvas.height
    const tempCtx = tempCanvas.getContext('2d')!
    if (bgColor === 'transparent') {
      tempCtx.fillStyle = '#ffffff'
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
    }
    tempCtx.drawImage(finalCanvas, 0, 0)
    const link = document.createElement('a')
    link.download = `photo_${size.labelEn.replace(/\s/g, '_')}.jpg`
    link.href = tempCanvas.toDataURL('image/jpeg', 0.95)
    link.click()
  }

  const handleDownloadPDF = () => {
    if (!finalCanvas) return
    generatePrintPDF(finalCanvas, size, lang)
  }

  // --- Manual editing on cutout canvas ---
  const startEditing = useCallback(() => {
    if (!cutoutCanvas) return
    const ctx = cutoutCanvas.getContext('2d')!
    setEditHistory([ctx.getImageData(0, 0, cutoutCanvas.width, cutoutCanvas.height)])
    setEditing(true)
  }, [cutoutCanvas])

  useEffect(() => {
    if (!editing || !cutoutCanvas) return
    const ec = editCanvasRef.current
    if (!ec) return
    const maxW = 400
    const scale = Math.min(maxW / cutoutCanvas.width, maxW / cutoutCanvas.height, 1)
    ec.width = Math.round(cutoutCanvas.width * scale)
    ec.height = Math.round(cutoutCanvas.height * scale)
    ec.getContext('2d')!.drawImage(cutoutCanvas, 0, 0, ec.width, ec.height)
  }, [editing, cutoutCanvas])

  const applyEditing = useCallback(() => {
    if (!cutoutCanvas) return
    setEditing(false)
    setEditHistory([])
    setCutoutCanvas((prev) => {
      if (!prev) return prev
      const copy = document.createElement('canvas')
      copy.width = prev.width
      copy.height = prev.height
      copy.getContext('2d')!.drawImage(prev, 0, 0)
      return copy
    })
  }, [cutoutCanvas])

  const undoEdit = useCallback(() => {
    if (!cutoutCanvas || editHistory.length === 0) return
    const prev = editHistory[editHistory.length - 1]
    const ctx = cutoutCanvas.getContext('2d')!
    ctx.putImageData(prev, 0, 0)
    setEditHistory((h) => h.slice(0, -1))
    const ec = editCanvasRef.current
    if (ec) {
      const ectx = ec.getContext('2d')!
      ectx.clearRect(0, 0, ec.width, ec.height)
      ectx.drawImage(cutoutCanvas, 0, 0, ec.width, ec.height)
    }
    setCutoutCanvas(prev => prev)
  }, [cutoutCanvas, editHistory])

  const editCanvasDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const ec = editCanvasRef.current
    const cutout = cutoutCanvas
    if (!ec || !cutout || !isDrawingRef.current) return
    const rect = ec.getBoundingClientRect()
    const scaleX = cutout.width / rect.width
    const scaleY = cutout.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    const r = brushRadius * scaleX
    const ctx = cutout.getContext('2d')!
    if (isEraser) {
      const orig = originalCutoutRef.current
      if (orig) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(orig, 0, 0)
        ctx.restore()
      }
    } else {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const ectx = ec.getContext('2d')!
    ectx.clearRect(0, 0, ec.width, ec.height)
    ectx.drawImage(cutout, 0, 0, ec.width, ec.height)
  }, [cutoutCanvas, brushRadius, isEraser])

  const editCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true
    if (cutoutCanvas) {
      const ctx = cutoutCanvas.getContext('2d')!
      setEditHistory((prev) => [...prev, ctx.getImageData(0, 0, cutoutCanvas.width, cutoutCanvas.height)])
    }
    editCanvasDraw(e)
  }, [cutoutCanvas, editCanvasDraw])

  const goToUpload = () => {
    setStep('upload')
    setCutoutCanvas(null)
    setFinalCanvas(null)
    setRemoving(false)
    if (originalUrl) URL.revokeObjectURL(originalUrl)
    setOriginalUrl('')
    setOriginalFile(null)
  }

  // --- Shared Header ---
  const Header = () => (
    <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20 w-10 h-10 flex items-center justify-center">
            <Camera className="h-5 w-5" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">{strings.title}</h1>
        </div>
        <div className="rounded-full border border-slate-200/90 bg-slate-50/80 p-0.5 shadow-sm flex items-center">
          <button
            onClick={() => setLang('en')}
            className={`px-3.5 py-1.5 text-sm font-semibold rounded-full transition-all duration-200 ${lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            EN
          </button>
          <button
            onClick={() => setLang('zh')}
            className={`px-3.5 py-1.5 text-sm font-semibold rounded-full transition-all duration-200 ${lang === 'zh' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            中文
          </button>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 pb-4">
        <StepIndicator currentStep={step} strings={strings} />
      </div>
    </header>
  )

  // --- Shared Footer ---
  const Footer = () => (
    <footer className="border-t border-slate-200/60 bg-slate-50/80 backdrop-blur-sm py-8 mt-auto">
      <div className="max-w-2xl mx-auto px-6">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <Camera className="h-3 w-3 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-bold text-slate-700">{strings.title}</span>
        </div>
        <p className="text-center text-sm text-slate-400">{strings.footerText}</p>
        <p className="text-center text-xs text-slate-300 mt-2">
          {lang === 'zh' ? 'Powered by @imgly/background-removal · Open Source' : 'Powered by @imgly/background-removal · Open Source'}
        </p>
      </div>
    </footer>
  )

  // ==================== UPLOAD STEP ====================
  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/30 font-sans text-slate-900 antialiased flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-lg">

            {/* Batch mode toggle */}
            <div className="flex justify-center mb-6">
              <div className="rounded-full border border-slate-200/90 bg-slate-50/80 p-0.5 shadow-sm flex items-center">
                <button
                  onClick={() => setBatchMode(false)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${!batchMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {lang === 'zh' ? '单张模式' : 'Single Mode'}
                </button>
                <button
                  onClick={() => setBatchMode(true)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${batchMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  {lang === 'zh' ? '批量模式' : 'Batch Mode'}
                </button>
              </div>
            </div>

            {/* Batch processing progress */}
            {batchProcessing && (
              <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-soft text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 mb-4">
                  <div className="w-6 h-6 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-slate-700 font-semibold mb-2">
                  {lang === 'zh' ? `正在处理 ${batchResults.length + 1}/${batchProgress === 100 ? batchResults.length : '...'}...` : `Processing ${batchResults.length + 1}...`}
                </p>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden w-64 mx-auto">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${batchProgress}%` }} />
                </div>
                <p className="mt-2 text-sm font-semibold text-blue-600">{batchProgress}%</p>
              </div>
            )}

            {/* Batch results */}
            {batchMode && !batchProcessing && batchResults.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800">
                    {lang === 'zh' ? '批量结果' : 'Batch Results'} ({batchResults.length})
                  </h3>
                  <button
                    onClick={() => { setBatchResults([]); setBatchProgress(0) }}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm transition-all duration-200"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {lang === 'zh' ? '重新选择' : 'Reselect'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                  {batchResults.map((r, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-3 shadow-soft">
                      <div
                        className="rounded-xl overflow-hidden mb-2"
                        style={{
                          ...(bgColor === 'transparent' ? checkerStyle : bgColor === 'custom' ? { backgroundColor: customBgColor } : { backgroundColor: BG_COLORS[bgColor] }),
                        }}
                      >
                        <img src={r.canvas.toDataURL()} alt={r.fileName} className="w-full h-auto object-contain" />
                      </div>
                      <p className="text-xs text-slate-500 truncate text-center" title={r.fileName}>{r.fileName.replace(/\.[^.]+$/, '')}</p>
                      <button
                        onClick={() => {
                          const link = document.createElement('a')
                          link.download = `photo_${r.fileName.replace(/\.[^.]+$/, '')}.png`
                          link.href = r.canvas.toDataURL('image/png')
                          link.click()
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-all"
                      >
                        <Download className="h-3 w-3" />
                        PNG
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      batchResults.forEach(r => {
                        const link = document.createElement('a')
                        link.download = `photo_${r.fileName.replace(/\.[^.]+$/, '')}.png`
                        link.href = r.canvas.toDataURL('image/png')
                        link.click()
                      })
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 hover:shadow-xl transition-all duration-200"
                  >
                    <Package className="h-4 w-4" />
                    {lang === 'zh' ? '全部下载 (PNG)' : 'Download All (PNG)'}
                  </button>
                  <button
                    onClick={() => {
                      const pdf = new jsPDF('p', 'mm', 'a4')
                      const pageW = 210, pageH = 297
                      const photoW = size.wMm
                      const photoH = size.hMm
                      const gap = 2
                      const cols = Math.floor((pageW + gap) / (photoW + gap))
                      const rows = Math.floor((pageH + gap) / (photoH + gap))
                      const totalW = cols * photoW + (cols - 1) * gap
                      const totalH = rows * photoH + (rows - 1) * gap
                      const startX = (pageW - totalW) / 2
                      const startY = (pageH - totalH) / 2

                      batchResults.forEach((r) => {
                        pdf.addPage('a4', 'p')
                        const imgData = r.canvas.toDataURL('image/png')
                        for (let i = 0; i < rows * cols; i++) {
                          const c = i % cols
                          const row = Math.floor(i / cols)
                          const x = startX + c * (photoW + gap)
                          const y = startY + row * (photoH + gap)
                          pdf.addImage(imgData, 'PNG', x, y, photoW, photoH)
                        }
                      })
                      pdf.deletePage(1) // remove blank first page
                      pdf.save('batch_photos.pdf')
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 hover:shadow-xl transition-all duration-200"
                  >
                    <Printer className="h-4 w-4" />
                    {lang === 'zh' ? '全部下载 (PDF)' : 'Download All (PDF)'}
                  </button>
                </div>
              </div>
            )}

            {/* Hero */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 px-4 py-1.5 mb-5">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-bold text-blue-600">{lang === 'zh' ? 'AI 驱动 · 完全免费' : 'AI-Powered · Free'}</span>
              </div>
              <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-b from-slate-900 to-slate-600 bg-clip-text text-transparent mb-3">
                {strings.title}
              </h2>
              <p className="text-lg text-slate-400 max-w-sm mx-auto">{strings.subtitle}</p>
            </div>

            {/* Upload area */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="relative border-2 border-dashed border-slate-200 rounded-3xl bg-white/60 backdrop-blur-sm p-14 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/20 hover:shadow-xl hover:shadow-blue-600/5 transition-all duration-500 group overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-blue-50/0 to-blue-50/0 group-hover:from-blue-50/50 group-hover:to-indigo-50/30 transition-all duration-500 rounded-3xl" />
              <div className="relative">
                <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-600/20 w-20 h-20 mx-auto mb-6 flex items-center justify-center group-hover:scale-110 group-hover:shadow-2xl group-hover:shadow-blue-600/30 transition-all duration-500">
                  <Upload className="h-8 w-8" strokeWidth={1.8} />
                </div>
                <p className="text-lg font-semibold text-slate-700 mb-2 group-hover:text-blue-700 transition-colors">
                  {batchMode
                    ? (lang === 'zh' ? '拖拽多张照片到此处，或点击选择文件（最多 20 张）' : 'Drag & drop multiple photos here, or click to browse (max 20)')
                    : strings.uploadHint}
                </p>
                <p className="text-sm text-slate-400">{strings.uploadFormats}{batchMode ? ` · ${lang === 'zh' ? '最多 20 张' : 'Max 20 photos'}` : ''}</p>
                <p className="text-xs text-slate-300 mt-3 flex items-center justify-center gap-1.5">
                  <span>💡</span>
                  {lang === 'zh' ? '人脸检测功能在 Chrome 浏览器中效果最佳' : 'Face detection works best in Chrome'}
                </p>
              </div>
            </div>

            {/* Preloading bar */}
            {preloading && (
              <div className="mt-6 rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft text-center">
                <p className="text-sm text-slate-500 mb-3 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  {lang === 'zh' ? '正在预加载 AI 模型...' : 'Preloading AI model...'}
                </p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-64 mx-auto">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${preloadProgress}%` }} />
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              multiple={batchMode}
            />

            {/* Camera button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={async () => {
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
                    cameraStreamRef.current = stream
                    setShowCamera(true)
                    setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream }, 100)
                  } catch {
                    alert(lang === 'zh' ? '无法访问摄像头，请检查权限设置。' : 'Cannot access camera. Please check permission settings.')
                  }
                }}
                className="flex items-center gap-2 rounded-xl bg-white border border-slate-200/90 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all duration-200"
              >
                <Camera className="h-4 w-4" />
                {lang === 'zh' ? '📷 拍照' : '📷 Take Photo'}
              </button>
            </div>

            {/* Camera modal */}
            {showCamera && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="relative bg-white rounded-3xl shadow-2xl p-6 w-full max-w-lg space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 text-center">
                    {lang === 'zh' ? '拍照' : 'Take Photo'}
                  </h3>
                  <div className="flex justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full max-h-[60vh] rounded-2xl object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => setShowCamera(false)}
                      className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm transition-all duration-200"
                    >
                      {lang === 'zh' ? '取消' : 'Cancel'}
                    </button>
                    <button
                      onClick={() => {
                        const video = videoRef.current
                        if (!video) return
                        const canvas = document.createElement('canvas')
                        canvas.width = video.videoWidth
                        canvas.height = video.videoHeight
                        const ctx = canvas.getContext('2d')!
                        ctx.save()
                        ctx.scale(-1, 1)
                        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
                        ctx.restore()
                        canvas.toBlob((blob) => {
                          if (blob) {
                            setShowCamera(false)
                            processFile(blob)
                          }
                        }, 'image/jpeg', 0.95)
                      }}
                      className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 hover:shadow-xl transition-all duration-200"
                    >
                      <Camera className="h-4 w-4" />
                      {lang === 'zh' ? '拍照' : 'Capture'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Feature cards */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: <Shield className="h-5 w-5" />, title: strings.feature1Title, desc: strings.feature1Desc, gradient: 'from-blue-500 to-indigo-500' },
                { icon: <Ruler className="h-5 w-5" />, title: strings.feature2Title, desc: strings.feature2Desc, gradient: 'from-violet-500 to-purple-500' },
                { icon: <FileDown className="h-5 w-5" />, title: strings.feature3Title, desc: strings.feature3Desc, gradient: 'from-emerald-500 to-teal-500' },
              ].map((f, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 text-center"
                >
                  <div className={`rounded-xl bg-gradient-to-br ${f.gradient} text-white w-10 h-10 mx-auto mb-3 flex items-center justify-center shadow-md`}>
                    {f.icon}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">{f.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  // ==================== EDIT STEP ====================
  if (step === 'edit') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/30 font-sans text-slate-900 antialiased flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="max-w-2xl mx-auto space-y-4 pt-6">

            {removing ? (
              <div className="rounded-3xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-16 shadow-soft text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 mb-5">
                  <div className="w-7 h-7 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-slate-700 font-semibold text-lg mb-1">{strings.removing}</p>
                <p className="text-sm text-slate-400 mb-5">{lang === 'zh' ? '首次使用需下载约 40MB 模型' : 'First use requires ~40MB model download'}</p>
                {removingProgress && (
                  <div className="w-72 mx-auto">
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${removingProgress.progress}%` }} />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-blue-600">{removingProgress.progress}%</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Original thumbnail */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <p className="text-sm font-bold text-slate-700 mb-3">{strings.originalPhoto}</p>
                  <img src={originalUrl} alt="original" className="w-20 h-20 object-cover rounded-xl shadow-sm ring-2 ring-slate-100" />
                </div>

                {/* Background color */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <p className="text-sm font-bold text-slate-700 mb-4">{strings.bgColor}</p>
                  <div className="flex gap-4 flex-wrap">
                    {(['white', 'blue', 'red', 'transparent', 'custom'] as BgColor[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => setBgColor(c)}
                        className={`flex flex-col items-center gap-2 group transition-all duration-300 ${bgColor === c ? 'scale-110' : 'hover:scale-105'}`}
                      >
                        <div
                          className={`w-14 h-14 rounded-full border-[3px] transition-all duration-300 ${
                            bgColor === c
                              ? 'border-blue-500 ring-4 ring-blue-500/15 shadow-lg shadow-blue-500/20'
                              : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                          }`}
                          style={c === 'custom'
                            ? { background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }
                            : c === 'transparent' ? checkerStyle : { backgroundColor: BG_COLORS[c] }}
                        />
                        <span className={`text-xs font-semibold transition-colors ${bgColor === c ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                          {c === 'custom' ? (lang === 'zh' ? '自定义' : 'Custom') : strings[c as keyof ReturnType<typeof t>]}
                        </span>
                      </button>
                    ))}
                    {bgColor === 'custom' && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative">
                          <input
                            ref={colorInputRef}
                            type="color"
                            value={customBgColor}
                            onChange={(e) => setCustomBgColor(e.target.value)}
                            className="absolute inset-0 w-14 h-14 opacity-0 cursor-pointer"
                          />
                          <div
                            className="w-14 h-14 rounded-full border-[3px] border-blue-500 ring-4 ring-blue-500/15 shadow-lg shadow-blue-500/20 flex items-center justify-center"
                            style={{ backgroundColor: customBgColor }}
                          >
                            <Palette className="w-5 h-5 text-white drop-shadow" strokeWidth={2} />
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-blue-600">{customBgColor}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Photo Adjustment - Brightness / Contrast */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-bold text-slate-700">{lang === 'zh' ? '照片调整' : 'Photo Adjustment'}</p>
                    <button
                      onClick={() => { setBrightness(100); setContrast(100); setSmoothing(0) }}
                      disabled={brightness === 100 && contrast === 100 && smoothing === 0}
                      className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-all duration-200 shadow-sm"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {lang === 'zh' ? '重置' : 'Reset'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Sun className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="text-xs font-medium text-slate-500 w-14">{lang === 'zh' ? '亮度' : 'Brightness'}</span>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={brightness}
                        onChange={(e) => setBrightness(Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-600 w-7 text-right">{brightness}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CircleDot className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="text-xs font-medium text-slate-500 w-14">{lang === 'zh' ? '对比度' : 'Contrast'}</span>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={contrast}
                        onChange={(e) => setContrast(Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-600 w-7 text-right">{contrast}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="text-xs font-medium text-slate-500 w-14">{lang === 'zh' ? '磨皮' : 'Smoothing'}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={smoothing}
                        onChange={(e) => setSmoothing(Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-600 w-7 text-right">{smoothing}</span>
                    </div>
                  </div>
                </div>

                {/* Clothing */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <div className="flex items-center gap-2 mb-4">
                    <Shirt className="h-4 w-4 text-slate-400" />
                    <p className="text-sm font-bold text-slate-700">{strings.clothing}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {([['none', strings.clothingNone], ['white-shirt', strings.clothingWhiteShirt], ['suit', strings.clothingSuit]] as [Clothing, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setClothing(val)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                          clothing === val
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Crop position */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MoveVertical className="h-4 w-4 text-slate-400" />
                      <p className="text-sm font-bold text-slate-700">{lang === 'zh' ? '裁剪位置' : 'Crop Position'}</p>
                    </div>
                    {cropOffsetY !== 0 && (
                      <button
                        onClick={() => setCropOffsetY(0)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >{lang === 'zh' ? '重置' : 'Reset'}</button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{lang === 'zh' ? '上下调整人脸在照片中的位置' : 'Adjust face position up/down'}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-4 text-right">↑</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={cropOffsetY}
                      onChange={(e) => setCropOffsetY(Number(e.target.value))}
                      className="flex-1 accent-blue-600"
                    />
                    <span className="text-xs text-slate-400 w-4">↓</span>
                    <span className="text-xs font-bold text-slate-600 w-10 text-right">{cropOffsetY === 0 ? '0' : (cropOffsetY > 0 ? `+${cropOffsetY}` : cropOffsetY)}</span>
                  </div>
                </div>

                {/* Size presets */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <p className="text-sm font-bold text-slate-700 mb-4">{strings.photoSize}</p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.key}
                        onClick={() => setActiveCategory(cat.key)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                          activeCategory === cat.key
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        {lang === 'zh' ? cat.labelZh : cat.labelEn}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {filteredPresets.map((s) => {
                      const realIndex = SIZE_PRESETS.indexOf(s)
                      return (
                        <button
                          key={realIndex}
                          onClick={() => setSizeIndex(realIndex)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                            sizeIndex === realIndex
                              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                          }`}
                        >
                          {lang === 'zh' ? s.labelZh : s.labelEn}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Upscale */}
                {cutoutCanvas && (
                  <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-4 shadow-soft space-y-3">
                    <button
                        onClick={async () => {
                          setUpscaling(true)
                          await new Promise(r => setTimeout(r, 0))
                          const cutout = cutoutCanvas
                          const temp = document.createElement('canvas')
                          temp.width = cutout.width * 2
                          temp.height = cutout.height * 2
                          const tCtx = temp.getContext('2d')!
                          tCtx.imageSmoothingEnabled = true
                          tCtx.imageSmoothingQuality = 'high'
                          tCtx.drawImage(cutout, 0, 0, temp.width, temp.height)
                          const sharp = document.createElement('canvas')
                          sharp.width = temp.width
                          sharp.height = temp.height
                          const sCtx = sharp.getContext('2d')!
                          sCtx.filter = 'contrast(1.1) saturate(0.9)'
                          sCtx.drawImage(temp, 0, 0)
                          setCutoutCanvas(sharp)
                          setUpscaled(true)
                          setUpscaling(false)
                        }}
                        disabled={upscaling || upscaled}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm shadow-lg shadow-purple-600/25 hover:shadow-purple-600/40 transition-all disabled:opacity-50"
                      >
                        <ZoomIn className="h-4 w-4" />
                        {upscaling ? (lang === 'zh' ? '正在提升...' : 'Upscaling...') : upscaled ? (lang === 'zh' ? '✓ 已提升 (2x)' : '✓ Upscaled (2x)') : (lang === 'zh' ? '✨ 提升分辨率 (2x)' : '✨ Upscale (2x)')}
                      </button>
                    <p className="text-xs text-center text-slate-400">{lang === 'zh' ? '使用高质量插值放大 2 倍' : '2x high-quality interpolation'}</p>
                  </div>
                )}

                {/* Preview with glow */}
                {finalCanvas && (
                  <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-soft">
                    <p className="text-sm font-bold text-slate-700 mb-4">{strings.preview}</p>
                    <div className="flex justify-center">
                      <div className="relative p-4 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/50">
                        <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-blue-100/40 to-indigo-100/40 blur-xl" />
                        <div
                          className="relative rounded-xl border border-slate-200/80 overflow-hidden shadow-md"
                          style={{
                            width: 200,
                            height: 200 * (size.hPx / size.wPx),
                            ...(bgColor === 'transparent' ? checkerStyle : bgColor === 'custom' ? { backgroundColor: customBgColor } : { backgroundColor: BG_COLORS[bgColor] }),
                          }}
                        >
                          <img
                            src={previewDataUrl}
                            alt="preview"
                            className="absolute inset-0 w-full h-full object-contain"
                          />
                        </div>
                      </div>
                    </div>
                    {/* DPI / Resolution info */}
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Info className="h-3 w-3" />
                        <span className="font-semibold">{lang === 'zh' ? '分辨率' : 'Resolution'}:</span>
                        <span>{size.wPx} × {size.hPx} px</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-semibold">{lang === 'zh' ? '打印尺寸' : 'Print Size'}:</span>
                        <span>{size.wMm} × {size.hMm} mm</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-semibold text-slate-500">{lang === 'zh' ? '打印 DPI' : 'Print DPI'}:</span>
                        {(() => {
                          const dpiW = Math.round(size.wPx / size.wMm * 25.4)
                          const dpiH = Math.round(size.hPx / size.hMm * 25.4)
                          const dpi = Math.min(dpiW, dpiH)
                          const ok = dpi >= 300
                          return <span className={ok ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{dpi} {ok ? (lang === 'zh' ? '✓ 满足要求' : '✓ Meets requirements') : (lang === 'zh' ? '⚠ 偏低' : '⚠ Low')}</span>
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Manual Edit */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-slate-700">{strings.manualEdit}</p>
                    {!editing ? (
                      <button
                        onClick={startEditing}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 shadow-sm"
                      >
                        {strings.manualEdit}
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={undoEdit}
                          disabled={editHistory.length === 0}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all duration-200 shadow-sm"
                        >
                          {strings.undoEdit}
                        </button>
                        <button
                          onClick={applyEditing}
                          className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:shadow-xl"
                        >
                          {strings.applyEdit}
                        </button>
                      </div>
                    )}
                  </div>
                  {editing && (
                    <>
                      <p className="text-sm text-slate-400 mb-3">{strings.manualEditHint}</p>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <button
                          onClick={() => setIsEraser(!isEraser)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                            isEraser
                              ? 'bg-slate-800 text-white shadow-lg shadow-slate-800/25'
                              : 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                          }`}
                        >
                          {isEraser ? strings.eraserMode : strings.paintMode}
                        </button>
                        <div className="flex items-center gap-2 bg-slate-50 rounded-full px-4 py-2">
                          <span className="text-xs font-medium text-slate-500">{strings.brushSize}</span>
                          <input
                            type="range"
                            min={3}
                            max={50}
                            value={brushRadius}
                            onChange={(e) => setBrushRadius(Number(e.target.value))}
                            className="w-20 accent-blue-600"
                          />
                          <span className="text-xs font-bold text-slate-600 w-5">{brushRadius}</span>
                        </div>
                      </div>
                      <div className="flex justify-center">
                        <canvas
                          ref={editCanvasRef}
                          onMouseDown={editCanvasMouseDown}
                          onMouseMove={editCanvasDraw}
                          onMouseUp={() => { isDrawingRef.current = false }}
                          onMouseLeave={() => { isDrawingRef.current = false }}
                          onTouchStart={(e) => { e.preventDefault(); isDrawingRef.current = true; if (cutoutCanvas) { const ctx = cutoutCanvas.getContext('2d')!; setEditHistory((prev) => [...prev, ctx.getImageData(0, 0, cutoutCanvas.width, cutoutCanvas.height)]) } const touch = e.touches[0]; editCanvasDraw({ clientX: touch.clientX, clientY: touch.clientY } as React.MouseEvent<HTMLCanvasElement>) }}
                          onTouchMove={(e) => { e.preventDefault(); const touch = e.touches[0]; editCanvasDraw({ clientX: touch.clientX, clientY: touch.clientY } as React.MouseEvent<HTMLCanvasElement>) }}
                          onTouchEnd={() => { isDrawingRef.current = false }}
                          className="rounded-xl border border-slate-200 cursor-crosshair max-w-full"
                          style={{ maxHeight: 400 }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Nav */}
                <div className="flex justify-between pt-2 pb-4">
                  <button
                    onClick={goToUpload}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 shadow-sm"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {strings.back}
                  </button>
                  <button
                    onClick={() => setStep('download')}
                    disabled={!finalCanvas}
                    className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {strings.next}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  // ==================== DOWNLOAD STEP ====================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/30 font-sans text-slate-900 antialiased flex flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-lg mx-auto pt-6 space-y-6">

          {/* Success message */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-xl shadow-emerald-500/20 mb-4">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-b from-slate-900 to-slate-600 bg-clip-text text-transparent">
              {strings.downloadDone.split('！')[0].split('!')[0]}{lang === 'zh' ? '！' : '!'}
            </h2>
            <p className="text-slate-400 mt-2">{strings.downloadPhoto.split(' (')[0]} · {lang === 'zh' ? size.labelZh : size.labelEn}</p>
          </div>

          {/* Preview card with glow */}
          {finalCanvas && (
            <div className="rounded-3xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-8 shadow-soft">
              <div className="flex justify-center">
                <div className="relative p-5 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/50">
                  <div className="absolute inset-3 rounded-xl bg-gradient-to-br from-blue-100/50 to-indigo-100/50 blur-2xl" />
                  <div
                    className="relative rounded-xl border border-slate-200/80 overflow-hidden shadow-lg"
                    style={{
                      width: 240,
                      height: 240 * (size.hPx / size.wPx),
                      ...(bgColor === 'transparent' ? checkerStyle : {}),
                    }}
                  >
                    <img
                      src={downloadDataUrl}
                      alt="final"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-slate-400 mt-5 font-medium">
                {lang === 'zh' ? size.labelZh : size.labelEn} · {size.wPx}×{size.hPx}px
              </p>
            </div>
          )}

          {/* Download buttons - card style */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={handleDownloadPNG}
              className="group rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 text-center"
            >
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white w-12 h-12 mx-auto mb-3 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-300">
                <Download className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">{strings.downloadPhoto.split(' (')[0]}</h3>
              <p className="text-xs text-slate-400">PNG · {size.wPx}×{size.hPx}px</p>
            </button>

            <button
              onClick={handleDownloadJPG}
              className="group rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 text-center"
            >
              <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white w-12 h-12 mx-auto mb-3 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform duration-300">
                <Image className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">{lang === 'zh' ? '下载证件照' : 'Download Photo'} (JPG)</h3>
              <p className="text-xs text-slate-400">JPEG · 95% quality</p>
            </button>

            <button
              onClick={handleDownloadPDF}
              className="group rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 text-center"
            >
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white w-12 h-12 mx-auto mb-3 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
                <Printer className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">{lang === 'zh' ? '排版打印' : 'Print Layout'}</h3>
              <p className="text-xs text-slate-400">PDF · A4</p>
            </button>
          </div>

          {/* Back button */}
          <button
            onClick={() => setStep('edit')}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            {strings.backToEdit}
          </button>
        </div>
      </main>
      <Footer />
    </div>
  )
}
