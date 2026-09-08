'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Keep worker setup beside Document/Page so module execution order cannot reset
// it. Turbopack bundles this worker, making PDF.js same-origin and CSP-safe.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// react-pdf compares options by reference. A module-scope object prevents a
// PDF.js reload whenever the parent updates audio or timeline state.
export const PDF_DOCUMENT_OPTIONS = Object.freeze({
  cMapUrl: `/pdfjs/${pdfjs.version}/cmaps/`,
  cMapPacked: true,
})

/** Keep the canvas tree bounded even when a caller supplies many pages. */
export function getVisiblePdfPages(currentPage: number, pages?: number[]) {
  const requestedPages = pages?.length ? pages : [currentPage]
  return [...new Set(requestedPages)]
    .filter((page) => Number.isInteger(page) && page > 0)
    .slice(0, 2)
}

const getInitialWidth = () => (
  typeof window === 'undefined'
    ? 800
    : Math.max(Math.round(window.innerWidth - 32), 200)
)

type Props = {
  url: string
  currentPage: number
  /** An optional bounded list of pages to show. */
  pages?: number[]
  /** Labels for the bounded current/next preview cards. */
  pageLabels?: { current: string; next: string; emptyNext?: string }
  /** Render an empty next-card when the current page is the final page. */
  showEmptyNext?: boolean
  /** Layout for non-fit previews, used by the editor's two-card view. */
  previewLayout?: 'stack' | 'grid'
  onDocumentLoadSuccess?: (numPages: number) => void
  fitToContainer?: boolean
  /** Keep one adjacent standby canvas for flicker-free forward page turns. */
  renderStandbyPage?: boolean
}

export function PDFViewer({
  url,
  currentPage,
  pages,
  pageLabels = { current: '現在のページ', next: '次のページ', emptyNext: '次のページはありません' },
  showEmptyNext = false,
  previewLayout = 'stack',
  onDocumentLoadSuccess,
  fitToContainer = true,
  renderStandbyPage = false,
}: Props) {
  const [numPages, setNumPages] = useState<number>()
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const requestedPageRef = useRef(currentPage)
  const [slots, setSlots] = useState(() => ({
    shownPage: currentPage,
    standbyPage: null as number | null,
    standbyReady: false,
  }))
  const [containerWidth, setContainerWidth] = useState(getInitialWidth)
  const [zoom, setZoom] = useState(1)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    const syncFullscreen = () => setIsFocused(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  // Never allow an accidental large canvas tree. Preserve caller order while
  // dropping duplicates and invalid pages.
  const visiblePages = useMemo(() => getVisiblePdfPages(currentPage, pages), [currentPage, pages])

  // The player owns two slots: a visible page and one hidden standby page.
  // When a requested page is not ready, retain the visible slot underneath it;
  // onRenderSuccess promotes the target and starts preparing its successor.
  const canPromoteStandby = renderStandbyPage
    && currentPage !== slots.shownPage
    && slots.standbyPage === currentPage
    && slots.standbyReady
  const effectiveShownPage = canPromoteStandby ? currentPage : slots.shownPage
  const nextPage = numPages && effectiveShownPage < numPages ? effectiveShownPage + 1 : null
  const waitingForTarget = renderStandbyPage && currentPage !== effectiveShownPage
  const standbyCandidate = renderStandbyPage
    ? (waitingForTarget ? currentPage : nextPage)
    : null

  useEffect(() => {
    requestedPageRef.current = currentPage
    if (!renderStandbyPage) return

    // Synchronize immediately-ready standby promotions and remember a target
    // that needs to be painted. The render above intentionally shows the old
    // slot until the target's Page reports success.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots((previousSlots) => {
      if (previousSlots.shownPage === currentPage) {
        return previousSlots.standbyPage === null && !previousSlots.standbyReady
          ? previousSlots
          : { ...previousSlots, standbyPage: null, standbyReady: false }
      }
      if (previousSlots.standbyPage === currentPage && previousSlots.standbyReady) {
        return {
          shownPage: currentPage,
          standbyPage: null,
          standbyReady: false,
        }
      }
      if (previousSlots.standbyPage === currentPage && !previousSlots.standbyReady) return previousSlots
      return {
        ...previousSlots,
        standbyPage: currentPage,
        standbyReady: false,
      }
    })
  }, [currentPage, renderStandbyPage])

  // A changed URL represents a different PDF document. Drop both slots and
  // the old page count so no canvas/readiness from the previous file survives.
  useEffect(() => {
    setSlots({
      shownPage: requestedPageRef.current,
      standbyPage: null,
      standbyReady: false,
    })
    setNumPages(undefined)
  }, [url])

  function handleLoadSuccess({ numPages: loadedPages }: { numPages: number }) {
    setNumPages(loadedPages)
    onDocumentLoadSuccess?.(loadedPages)
  }

  const handlePageRenderSuccess = (pageNumber: number) => {
    if (!renderStandbyPage) return
    setSlots((previousSlots) => {
      // Ignore a late callback from a page that was discarded by a rapid jump.
      if (pageNumber === requestedPageRef.current && previousSlots.shownPage !== pageNumber) {
        return {
          shownPage: pageNumber,
          standbyPage: null,
          standbyReady: false,
        }
      }
      const expectedStandby = previousSlots.standbyPage ?? previousSlots.shownPage + 1
      if (pageNumber !== expectedStandby) return previousSlots
      return {
        ...previousSlots,
        standbyPage: pageNumber,
        standbyReady: true,
      }
    })
  }

  // ResizeObserver may emit many fractional sizes while a mobile layout is
  // settling. Commit one rounded width per animation frame and ignore equal
  // values to avoid repeatedly re-rendering canvases.
  useEffect(() => {
    const container = containerRef.current
    const stage = stageRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    let frame: number | null = null
    let pendingWidth: number | null = null
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      pendingWidth = Math.max(
        Math.round(entry.contentRect.width - (fitToContainer ? 32 : 0)),
        200,
      )
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        if (pendingWidth === null) return
        const nextWidth = pendingWidth
        pendingWidth = null
        setContainerWidth((previousWidth) => (
          previousWidth === nextWidth ? previousWidth : nextWidth
        ))
      })
    })

    observer.observe(container)
    if (stage) observer.observe(stage)
    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [fitToContainer])

  const playerPages = [effectiveShownPage, standbyCandidate]
    .filter((page): page is number => page !== null)
  const pagesToRender = getVisiblePdfPages(
    effectiveShownPage,
    renderStandbyPage ? playerPages : visiblePages,
  ).filter((page) => !numPages || page <= numPages)

  const toggleFocus = () => {
    const element = stageRef.current
    if (document.fullscreenElement === element && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => undefined)
    } else if (isFocused) {
      setIsFocused(false)
    } else if (element && typeof element.requestFullscreen === 'function') {
      void element.requestFullscreen().catch(() => setIsFocused(true))
    } else {
      setIsFocused(true)
    }
  }

  const handlePdfKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleFocus()
    }
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col w-full ${fitToContainer ? 'h-full flex-1 overflow-hidden' : ''}`}
    >
      <Document
        key={url}
        file={url}
        options={PDF_DOCUMENT_OPTIONS}
        onLoadSuccess={handleLoadSuccess}
        loading={(
          <div className="pdf-stage-inner" aria-live="polite">
            <p>PDFを読み込み中…</p>
          </div>
        )}
        className={`w-full ${fitToContainer ? 'h-full flex-1 flex flex-col' : 'flex flex-col'}`}
      >
        {numPages && pagesToRender.length > 0 && (
          <div className={`w-full ${fitToContainer ? 'flex flex-col h-full flex-1' : ''}`}>
            <div
              ref={stageRef}
              className={`relative w-full ${fitToContainer
                ? `h-full flex-1 stage pdf-stage-inner ${zoom > 1 ? 'pdf-zoomed' : ''} ${isFocused ? 'pdf-focus-mode' : ''}`
                : `${previewLayout === 'grid' ? 'pdf-preview-grid' : 'flex flex-col'} justify-center items-center gap-4`}`}
            >
              {fitToContainer && <div className="pdf-tools" role="toolbar" aria-label="PDF表示操作">
                <button type="button" className="icon-button" aria-label="PDFを縮小" onClick={() => setZoom((value) => Math.max(.75, Number((value - .25).toFixed(2))))}>−</button>
                <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                <button type="button" className="icon-button" aria-label="PDFを拡大" onClick={() => setZoom((value) => Math.min(2, Number((value + .25).toFixed(2))))}>＋</button>
                <button type="button" className="icon-button" aria-label="PDFの倍率をリセット" onClick={() => setZoom(1)}>1:1</button>
                <button type="button" className="icon-button" aria-pressed={isFocused} aria-label={isFocused ? 'PDFのフォーカス表示を終了' : 'PDFをフォーカス表示'} onClick={toggleFocus}>□</button>
              </div>}
              {pagesToRender.map((pageNumber, index) => (
                <div
                  key={pageNumber}
                  className={`${fitToContainer
                    ? `pdf-page ${zoom > 1 && index === 0 ? 'pdf-page-zoomed' : ''} ${index === 0 ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`
                    : 'pdf-preview-card flex flex-col items-center justify-center w-full bg-white border border-zinc-300 rounded overflow-hidden'}`}
                  role={fitToContainer && index === 0 ? 'button' : undefined}
                  tabIndex={fitToContainer && index === 0 ? 0 : undefined}
                  aria-label={fitToContainer && index === 0 ? (isFocused ? 'PDFのフォーカス表示を終了' : 'PDFをフォーカス表示') : undefined}
                  onClick={fitToContainer && index === 0 ? toggleFocus : undefined}
                  onKeyDown={fitToContainer && index === 0 ? handlePdfKeyDown : undefined}
                >
                  {!fitToContainer && (
                    <div className="w-full bg-zinc-100 text-center text-zinc-700 text-xs sm:text-sm font-bold py-1 sm:py-2 border-b border-zinc-300 shrink-0">
                      {index === 0 ? `${pageLabels.current} ${pageNumber} / ${numPages}` : `${pageLabels.next} ${pageNumber} / ${numPages}`}
                    </div>
                  )}
                  <Page
                    pageNumber={pageNumber}
                    width={Math.round(containerWidth * zoom)}
                    className={`flex items-center justify-center ${fitToContainer
                      ? (zoom > 1
                        ? '[&_canvas]:!w-auto [&_canvas]:!h-auto'
                        : 'max-w-full max-h-full [&_canvas]:max-w-full [&_canvas]:max-h-full [&_canvas]:!w-auto [&_canvas]:!h-auto [&_canvas]:object-contain')
                      : '[&_canvas]:!w-full [&_canvas]:!h-auto'}`}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onRenderSuccess={() => handlePageRenderSuccess(pageNumber)}
                  />
                </div>
              ))}
              {!fitToContainer && showEmptyNext && (
                <div className="pdf-preview-card pdf-preview-empty flex flex-col items-center justify-center w-full border border-dashed border-zinc-400 rounded overflow-hidden bg-zinc-100 text-zinc-600">
                  <div className="w-full bg-zinc-200 text-center text-zinc-700 text-xs sm:text-sm font-bold py-1 sm:py-2 border-b border-zinc-300">
                    {pageLabels.next}
                  </div>
                  <p className="px-4 py-10 text-center text-sm">{pageLabels.emptyNext ?? '次のページはありません'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Document>
    </div>
  )
}
