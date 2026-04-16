import { useState, useRef, useCallback, useEffect } from 'react'
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
    // Crop around face with padding, targeting the desired aspect ratio
    const faceCX = faceBox.x + faceBox.width / 2
    const faceCY = faceBox.y + faceBox.height / 2
    const faceSize = Math.max(faceBox.width, faceBox.height)
    const padFactor = 1.8

    cropW = faceSize * padFactor
    cropH = cropW / targetRatio

    // Ensure face is in upper third
    const desiredFaceY = cropH * 0.35
    cropY = faceCY - desiredFaceY
    cropX = faceCX - cropW / 2

    // Clamp to image bounds
    cropX = Math.max(0, Math.min(srcW - cropW, cropX))
    cropY = Math.max(0, Math.min(srcH - cropH, cropY))

    // If clamping caused issues, refit
    if (cropW > srcW || cropH > srcH) {
      cropW = srcW
      cropH = srcW / targetRatio
      cropX = 0
      cropY = Math.max(0, (srcH - cropH) / 2)
    }
  } else {
    // Center crop
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

  // Draw cutout centered and covering
  const srcRatio = cutoutCanvas.width / cutoutCanvas.height
  const dstRatio = size.wPx / size.hPx

  let dw: number, dh: number, dx: number, dy: number
  if (srcRatio > dstRatio) {
    dh = out.height
    dw = dh * srcRatio
  } else {
    dw = out.width
    dh = dw / srcRatio
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

  // First page
  pdf.addImage(imgData, 'PNG', startX, startY, photoW, photoH)

  // Add cut lines on first page
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

// ==================== APP ====================
export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [lang, setLang] = useState<Lang>('zh')
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
        await preload()
        if (!cancelled) setPreloadProgress(100)
      } catch (e) {
        // Model preload failed silently, will retry on actual use
      } finally {
        if (!cancelled) setPreloading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Process uploaded file
  const processFile = useCallback(async (file: File) => {
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
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      setCutoutCanvas(canvas)
      // Save original for eraser restore
      const orig = document.createElement('canvas')
      orig.width = canvas.width
      orig.height = canvas.height
      orig.getContext('2d')!.drawImage(canvas, 0, 0)
      originalCutoutRef.current = orig
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Background removal failed:', err)
      alert(lang === 'zh' ? '背景去除失败，请重试' : 'Background removal failed, please retry')
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
    // Save current state for undo
    const ctx = cutoutCanvas.getContext('2d')!
    setEditHistory([ctx.getImageData(0, 0, cutoutCanvas.width, cutoutCanvas.height)])
    setEditing(true)
  }, [cutoutCanvas])

  // Initialize edit canvas when entering edit mode
  useEffect(() => {
    if (!editing || !cutoutCanvas) return
    const ec = editCanvasRef.current
    if (!ec) return
    // Scale to fit max 400px width
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
    // Force re-render of final canvas
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
    // Update display
    const ec = editCanvasRef.current
    if (ec) {
      const ectx = ec.getContext('2d')!
      ectx.clearRect(0, 0, ec.width, ec.height)
      ectx.drawImage(cutoutCanvas, 0, 0, ec.width, ec.height)
    }
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
      // Restore original pixels from the saved cutout
      const orig = originalCutoutRef.current
      if (orig) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(x - r, y - r, r * 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(orig, 0, 0)
        ctx.restore()
      }
    } else {
      // Erase (make transparent)
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    // Mirror to edit display canvas
    const ectx = ec.getContext('2d')!
    ectx.clearRect(0, 0, ec.width, ec.height)
    ectx.drawImage(cutout, 0, 0, ec.width, ec.height)
  }, [cutoutCanvas, brushRadius, isEraser])

  const editCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true
    // Save state before drawing for undo
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

  // --- Language Toggle ---
  const LangToggle = () => (
    <button
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      className="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur text-sm font-medium text-slate-700 shadow hover:bg-white transition-all border border-slate-200"
    >
      {lang === 'zh' ? 'EN' : '中文'}
    </button>
  )

  // --- UPLOAD STEP ---
  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex items-center justify-center p-4">
        <LangToggle />
        <div className="w-full max-w-lg">
          <h1 className="text-3xl font-bold text-center text-slate-800 mb-8">
            📷 {strings.title}
          </h1>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-300 rounded-2xl bg-white/70 backdrop-blur-sm p-16 text-center cursor-pointer hover:border-blue-500 hover:bg-white/90 transition-all shadow-lg hover:shadow-xl group"
          >
            <div className="text-6xl mb-4 group-hover:scale-110 transition-transform">🖼️</div>
            <p className="text-lg text-slate-600 font-medium">{strings.uploadHint}</p>
            <p className="text-sm text-slate-400 mt-2">{strings.uploadFormats}</p>
          </div>
          {preloading && (
            <div className="mt-6 bg-white/80 backdrop-blur rounded-xl shadow p-4 text-center">
              <p className="text-sm text-slate-500">{lang === 'zh' ? '正在预加载 AI 模型...' : 'Preloading AI model...'}</p>
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden w-48 mx-auto">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${preloadProgress}%` }} />
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
        </div>
      </div>
    )
  }

  // --- EDIT STEP ---
  if (step === 'edit') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 p-4">
        <LangToggle />
        <div className="max-w-2xl mx-auto pt-16">
          <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">{strings.uploadTitle}</h2>

          {/* Original thumbnail */}
          <div className="mb-6">
            <p className="text-sm text-slate-500 mb-2">{strings.uploadHint}</p>
            <img src={originalUrl} alt="original" className="w-24 h-24 object-cover rounded-lg shadow border" />
          </div>

          {/* Background removal status */}
          {removing ? (
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg p-12 text-center">
              <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-slate-600">{strings.removing}</p>
              {removingProgress && (
                <div className="mt-3 w-64 mx-auto">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${removingProgress.progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{removingProgress.progress}%</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Background color */}
              <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg p-6 mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">{strings.bgColor}</p>
                <div className="flex gap-2 flex-wrap">
                  {(['white', 'blue', 'red', 'transparent'] as BgColor[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setBgColor(c)}
                      className={`w-10 h-10 rounded-xl border-2 transition-all ${
                        bgColor === c ? 'border-blue-500 scale-110 shadow-lg' : 'border-slate-300 hover:scale-105'
                      }`}
                      style={c === 'transparent' ? checkerStyle : { backgroundColor: BG_COLORS[c] }}
                      title={strings[c]}
                    />
                  ))}
                  <span className="flex items-center ml-2 text-sm text-slate-500">{strings[bgColor]}</span>
                </div>
              </div>

              {/* Size presets */}
              <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg p-6 mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">{strings.photoSize}</p>
                <div className="flex gap-2 flex-wrap">
                  {SIZE_PRESETS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSizeIndex(i)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        sizeIndex === i
                          ? 'bg-blue-500 text-white shadow-lg'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {lang === 'zh' ? s.labelZh : s.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {finalCanvas && (
                <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg p-6 mb-4">
                  <p className="text-sm font-semibold text-slate-700 mb-3">{strings.preview}</p>
                  <div className="flex justify-center">
                    <div
                      className="relative border border-slate-200 rounded-lg overflow-hidden shadow"
                      style={{
                        width: 200,
                        height: 200 * (size.hPx / size.wPx),
                        ...(bgColor === 'transparent' ? checkerStyle : {}),
                      }}
                    >
                      <img
                        src={finalCanvas.toDataURL()}
                        alt="preview"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Edit */}
              <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg p-6 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-700">{strings.manualEdit}</p>
                  {!editing ? (
                    <button
                      onClick={startEditing}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-all"
                    >
                      ✏️ {strings.manualEdit}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={undoEdit}
                        disabled={editHistory.length === 0}
                        className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300 disabled:opacity-50 transition-all"
                      >
                        ↩️ {strings.undoEdit}
                      </button>
                      <button
                        onClick={applyEditing}
                        className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all"
                      >
                        ✓ {strings.applyEdit}
                      </button>
                    </div>
                  )}
                </div>
                {editing && (
                  <>
                    <p className="text-xs text-slate-400 mb-3">{strings.manualEditHint}</p>
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <button
                        onClick={() => setIsEraser(!isEraser)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isEraser ? 'bg-slate-700 text-white' : 'bg-red-500 text-white'}`}
                      >
                        {isEraser ? '🧹 ' + strings.eraserMode : '🖌️ ' + strings.paintMode}
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{strings.brushSize}</span>
                        <input
                          type="range"
                          min={3}
                          max={50}
                          value={brushRadius}
                          onChange={(e) => setBrushRadius(Number(e.target.value))}
                          className="w-24"
                        />
                        <span className="text-xs text-slate-400 w-6">{brushRadius}</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <canvas
                        ref={editCanvasRef}
                        onMouseDown={editCanvasMouseDown}
                        onMouseMove={editCanvasDraw}
                        onMouseUp={() => { isDrawingRef.current = false }}
                        onMouseLeave={() => { isDrawingRef.current = false }}
                        className="rounded-lg border-2 border-dashed border-slate-300 cursor-crosshair max-w-full"
                        style={{ maxHeight: 400 }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Nav */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={goToUpload}
                  className="px-6 py-2.5 rounded-xl bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-all"
                >
                  ← {strings.back}
                </button>
                <button
                  onClick={() => setStep('download')}
                  disabled={!finalCanvas}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                >
                  {strings.next} →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // --- DOWNLOAD STEP ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 p-4">
      <LangToggle />
      <div className="max-w-lg mx-auto pt-16">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">{strings.downloadPhoto.split(' ')[0]}</h2>

        {finalCanvas && (
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex justify-center">
              <div
                className="relative border border-slate-200 rounded-lg overflow-hidden shadow-lg"
                style={{
                  width: 240,
                  height: 240 * (size.hPx / size.wPx),
                  ...(bgColor === 'transparent' ? checkerStyle : {}),
                }}
              >
                <img
                  src={finalCanvas.toDataURL()}
                  alt="final"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
            </div>
            <p className="text-center text-sm text-slate-500 mt-4">
              {lang === 'zh' ? size.labelZh : size.labelEn} · {size.wPx}×{size.hPx}px
            </p>
          </div>
        )}

        <div className="space-y-3 mb-6">
          <button
            onClick={handleDownloadPNG}
            className="w-full px-6 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            📥 {strings.downloadPhoto}
          </button>
          <button
            onClick={handleDownloadPDF}
            className="w-full px-6 py-3 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            🖨️ {strings.downloadPrint}
          </button>
        </div>

        <button
          onClick={() => setStep('edit')}
          className="w-full px-6 py-2.5 rounded-xl bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-all"
        >
          ← {strings.backToEdit}
        </button>
      </div>
    </div>
  )
}
