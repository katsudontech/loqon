'use client'

import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
// react-pdfの標準スタイル
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// ワーカーの設定：これがないとNext.jsでPDFが描画されません
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

type Props = {
  url: string // Supabaseから渡ってくるPDFのURL
  currentPage: number // 親コンポーネント(EditorContainer)から指定されるページ番号
  onDocumentLoadSuccess?: (numPages: number) => void // ページ総数を親に伝えるコールバック
  fitToContainer?: boolean // PDFを親コンテナに合わせるか（true）、自身の高さで描画するか（false）
}

export function PDFViewer({ url, currentPage, onDocumentLoadSuccess, fitToContainer = true }: Props) {
  const [numPages, setNumPages] = useState<number>()

  // PDFの読み込みが成功した時に呼ばれる関数
  function handleLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    if (onDocumentLoadSuccess) {
      onDocumentLoadSuccess(numPages)
    }
  }

  // スマホ等の画面サイズに合わせてPDFの横幅を最適化する仕組み
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number>(800)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        // paddingを除いた実際の描画可能幅を取得
        let { width } = entries[0].contentRect
        if (fitToContainer) {
          width = width - 32 // padding分を考慮
        }
        // 小さすぎると見えないので最小幅を設ける
        setContainerWidth(Math.max(width, 200))
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [fitToContainer])

  // --- プレレンダリング（先読み）用の計算 ---
  const prevPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = numPages && currentPage < numPages ? currentPage + 1 : null;

  return (
    <div className={`flex flex-col w-full ${fitToContainer ? 'h-full flex-1 overflow-hidden' : ''}`}>
      <Document
        file={url}
        options={{
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
          cMapPacked: true,
        }}
        onLoadSuccess={handleLoadSuccess}
        loading={
          <div className="flex flex-col items-center justify-center gap-4 text-zinc-400 aspect-[4/3] w-full">
            <div className="w-8 h-8 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
            <p>PDFを読み込み中...</p>
          </div>
        }
        className={`w-full ${fitToContainer ? 'h-full flex-1 flex flex-col' : 'flex flex-col'}`}
      >
        {numPages && (
          <div className={`w-full ${fitToContainer ? 'flex flex-col h-full flex-1' : ''}`}>
            {/* メインPDF表示エリア */}
            <div
              ref={containerRef}
              className={`relative w-full ${fitToContainer ? 'h-full flex-1 bg-zinc-900/50 flex items-center justify-center p-2 sm:p-4 overflow-hidden' : 'flex justify-center items-center'}`}
            >
              {/* 前のページ（プレレンダリング用・完全透明で見えない） */}
              {prevPage && (
                <div className={`absolute inset-0 opacity-0 pointer-events-none flex items-center justify-center overflow-hidden`}>
                  <Page
                    pageNumber={prevPage}
                    width={containerWidth}
                    className={`flex items-center justify-center ${fitToContainer ? 'max-w-full max-h-full [&_canvas]:max-w-full [&_canvas]:max-h-full [&_canvas]:!w-auto [&_canvas]:!h-auto [&_canvas]:object-contain' : '[&_canvas]:!w-full [&_canvas]:!h-auto'}`}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </div>
              )}

              {/* 現在のページ */}
              <div className={`${fitToContainer ? 'absolute inset-0 flex items-center justify-center overflow-hidden p-2 sm:p-4' : 'flex items-center justify-center w-full'}`}>
                <Page
                  pageNumber={currentPage}
                  width={containerWidth}
                  className={`shadow-xl flex items-center justify-center ${fitToContainer ? 'max-w-full max-h-full [&_canvas]:max-w-full [&_canvas]:max-h-full [&_canvas]:!w-auto [&_canvas]:!h-auto [&_canvas]:object-contain' : '[&_canvas]:!w-full [&_canvas]:!h-auto'}`}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </div>

              {/* 次のページ（プレレンダリング用・完全透明で見えない） */}
              {nextPage && (
                <div className={`absolute inset-0 opacity-0 pointer-events-none flex items-center justify-center overflow-hidden`}>
                  <Page
                    pageNumber={nextPage}
                    width={containerWidth}
                    className={`flex items-center justify-center ${fitToContainer ? 'max-w-full max-h-full [&_canvas]:max-w-full [&_canvas]:max-h-full [&_canvas]:!w-auto [&_canvas]:!h-auto [&_canvas]:object-contain' : '[&_canvas]:!w-full [&_canvas]:!h-auto'}`}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Document>
    </div>
  )
}
