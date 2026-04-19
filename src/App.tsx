import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Camera, Sparkles, Ruler, FileDown, Upload, Image, Shield, ArrowRight, ArrowLeft, Download, Printer } from 'lucide-react'
import { removeBackground, preload } from '@imgly/background-removal'
import { jsPDF } from 'jspdf'

// --- Types & Constants ---
type Step = 'upload' | 'edit' | 'download'
type Lang = 'zh' | 'en'
type BgColor = 'white' | 'blue' | 'red' | 'transparent'
type ProgressState = { stage: string; progress: number } | null

interface SizePreset {
  labelZh: string
  labelEn: string
  wMm: number
  hMm: number
  wPx: number
  hPx: number
}

const BG_COLORS: Record<BgColor, string> = {
  white: '#FFFFFF',
  blue: '#438EDB',
  red: '#BE0000',
  transparent: '',
}

const SIZE_PRESETS: SizePreset[] = [
  { labelZh: '一寸 25×35mm', labelEn: '1" 25×35mm', wMm: 25, hMm: 35, wPx: 295, hPx: 413 },
  { labelZh: '二寸 35×49mm', labelEn: '2" 35×49mm', wMm: 35, hMm: 49, wPx: 413, hPx: 579 },
  { labelZh: '小二寸 35×45mm', labelEn: 'Small 2" 35×45mm', wMm: 35, hMm: 45, wPx: 413, hPx: 531 },
  { labelZh: '护照 33×48mm', labelEn: 'Passport 33×48mm', wMm: 33, hMm: 48, wPx: 390, hPx: 567 },
  { labelZh: '签证 51×51mm', labelEn: 'Visa 51×51mm', wMm: 51, hMm: 51, wPx: 600, hPx: 600 },
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
})

// --- Helper: load image from File or URL ---
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// --- Helper: detect face and crop ---
async function detectAndCrop(canvas: HTMLCanvasElement, targetRatio: number): Promise<HTMLCanvasElement> {
  const imgEl = new Image()
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
  size: SizePreset
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = size.wPx
  out.height = size.hPx
  const ctx = out.getContext('2d')!

  if (bgColor !== 'transparent') {
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

  ctx.drawImage(cutoutCanvas, dx, dy, dw, dh)
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
  const [sizeIndex, setSizeIndex] = useState(0)
  const [finalCanvas, setFinalCanvas] = useState<HTMLCanvasElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [editHistory, setEditHistory] = useState<ImageData[]>([])
  const [brushRadius, setBrushRadius] = useState(15)
  const [isEraser, setIsEraser] = useState(false)
  const originalCutoutRef = useRef<HTMLCanvasElement | null>(null)
  const editCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Process uploaded file with retry
  const processFile = useCallback(async (file: File, attempt = 1) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert(lang === 'zh' ? '不支持的文件格式，请上传 JPG、PNG 或 WebP 图片。' : 'Unsupported file format. Please upload a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      alert(lang === 'zh' ? '文件太大，请选择 20MB 以内的图片。' : 'File too large. Please select an image under 20MB.')
      return
    }
    setOriginalFile(file)
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
    detectAndCrop(cutoutCanvas, targetRatio).then((cropped) => {
      const final = compositePhoto(cropped, bgColor, size)
      setFinalCanvas(final)
    })
  }, [cutoutCanvas, bgColor, sizeIndex])

  // Drag & drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const previewDataUrl = useMemo(() => finalCanvas?.toDataURL() ?? '', [finalCanvas])
  const downloadDataUrl = useMemo(() => finalCanvas?.toDataURL() ?? '', [finalCanvas])

  const handleDownloadPNG = () => {
    if (!finalCanvas) return
    const link = document.createElement('a')
    link.download = `photo_${size.labelEn.replace(/\s/g, '_')}.png`
    link.href = finalCanvas.toDataURL('image/png')
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
                <p className="text-lg font-semibold text-slate-700 mb-2 group-hover:text-blue-700 transition-colors">{strings.uploadHint}</p>
                <p className="text-sm text-slate-400">{strings.uploadFormats}</p>
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
            />

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
                    {(['white', 'blue', 'red', 'transparent'] as BgColor[]).map((c) => (
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
                          style={c === 'transparent' ? checkerStyle : { backgroundColor: BG_COLORS[c] }}
                        />
                        <span className={`text-xs font-semibold transition-colors ${bgColor === c ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                          {strings[c]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size presets */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-soft">
                  <p className="text-sm font-bold text-slate-700 mb-4">{strings.photoSize}</p>
                  <div className="flex gap-2 flex-wrap">
                    {SIZE_PRESETS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setSizeIndex(i)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                          sizeIndex === i
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        {lang === 'zh' ? s.labelZh : s.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

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
                            ...(bgColor === 'transparent' ? checkerStyle : { backgroundColor: BG_COLORS[bgColor] }),
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
