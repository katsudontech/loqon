'use client'

import { useState } from 'react'
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
}

export function PDFViewer({ url, currentPage, onDocumentLoadSuccess }: Props) {
  const [numPages, setNumPages] = useState<number>()

  // PDFの読み込みが成功した時に呼ばれる関数
  function handleLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    if (onDocumentLoadSuccess) {
      onDocumentLoadSuccess(numPages)
    }
  }

  // --- プレレンダリング（先読み）用の計算 ---
  const prevPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = numPages && currentPage < numPages ? currentPage + 1 : null;

  return (
    <div className="flex flex-col items-center w-full h-full">
      {/* PDF表示エリア */}
      <div className="relative w-full max-w-4xl aspect-[4/3] bg-zinc-900 rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center p-4">
        <Document
          file={url}
          options={{
            cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
            cMapPacked: true,
          }}
          onLoadSuccess={handleLoadSuccess}
          loading={
            <div className="flex flex-col items-center gap-4 text-zinc-400">
              <div className="w-8 h-8 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
              <p>PDFを読み込み中...</p>
            </div>
          }
          className="w-full h-full flex items-center justify-center"
        >
          {numPages && (
            <div className="relative w-full h-full flex items-center justify-center">
              
              {/* 前のページ（プレレンダリング用・完全透明で見えない） */}
              {prevPage && (
                <div className="absolute inset-0 opacity-0 pointer-events-none flex items-center justify-center overflow-hidden">
                  <Page 
                    pageNumber={prevPage} 
                    width={800} 
                    renderTextLayer={false} 
                    renderAnnotationLayer={false} 
                  />
                </div>
              )}
              
              {/* 現在のページ */}
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <Page 
                  pageNumber={currentPage} 
                  width={800} 
                  className="shadow-xl max-w-full h-auto object-contain"
                  renderTextLayer={false} 
                  renderAnnotationLayer={false}
                />
              </div>

              {/* 次のページ（プレレンダリング用・完全透明で見えない） */}
              {nextPage && (
                <div className="absolute inset-0 opacity-0 pointer-events-none flex items-center justify-center overflow-hidden">
                  <Page 
                    pageNumber={nextPage} 
                    width={800} 
                    renderTextLayer={false} 
                    renderAnnotationLayer={false} 
                  />
                </div>
              )}
            </div>
          )}
        </Document>
      </div>
    </div>
  )
}
