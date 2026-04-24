# 📸 免费证件照制作工具 / Free ID Photo Maker

**AI 驱动的证件照生成器 — 完全在浏览器本地运行，无需上传照片到任何服务器。**

AI-powered ID photo generator — runs entirely in your browser, no server upload needed.

## ✨ 功能 / Features

- 🤖 **AI 智能抠图** — 自动去除背景（基于 @imgly/background-removal）
- 👤 **人脸检测** — 智能裁剪，自动居中人脸（支持 Chrome FaceDetector API）
- 🎨 **背景颜色** — 白色、蓝色、红色、透明、自定义颜色
- 📐 **多种尺寸** — 一寸、二寸、小二寸、护照、签证、社交头像等
- 🖨️ **排版打印** — 自动排版 A4 纸，生成 PDF 直接打印
- 🌐 **中英双语** — 支持中文 / English 切换
- 📱 **响应式设计** — 手机、平板、电脑均可使用
- 📷 **拍照上传** — 支持摄像头直接拍照
- 🔄 **批量处理** — 支持批量生成证件照
- 🔒 **隐私安全** — 所有处理在本地完成，照片不会上传

## 🚀 在线使用 / Live Demo

👉 [https://thomaszhou22.github.io/photo_id_maker/](https://thomaszhou22.github.io/photo_id_maker/)

## 🛠️ 技术栈 / Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- @imgly/background-removal（AI 背景去除）
- jsPDF（PDF 生成）
- Lucide React（图标）

## 📦 本地开发 / Local Development

```bash
git clone https://github.com/Thomaszhou22/photo_id_maker.git
cd photo_id_maker
npm install
npm run dev
```

## 📄 License

MIT
