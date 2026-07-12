'use client'

import dynamic from 'next/dynamic'

// サーバー側での描画(SSR)を完全にオフにして、ブラウザ側だけで PDFViewer を読み込むためのラッパー（包み紙）コンポーネントです
export const PDFViewerWrapper = dynamic(
  () => import('./PDFViewer').then((mod) => mod.PDFViewer),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-zinc-500">
        PDFビューアを準備中...
      </div>
    )
  }
)
