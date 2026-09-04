'use client'

import dynamic from 'next/dynamic'

// サーバー側での描画(SSR)を完全にオフにして、ブラウザ側だけで PDFViewer を読み込むためのラッパー（包み紙）コンポーネントです
export const PDFViewerWrapper = dynamic(
  () => import('./PDFViewer').then((mod) => mod.PDFViewer),
  { 
    ssr: false,
    loading: () => (
      <div className="pdf-stage-inner text-zinc-300" aria-live="polite">
        PDFビューアを準備中...
      </div>
    )
  }
)
