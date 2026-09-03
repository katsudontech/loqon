'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** A bounded list of pages to show (the editor uses current + next). */
  pages?: number[]
  onDocumentLoadSuccess?: (numPages: number) => void
  fitToContainer?: boolean
  /** Keep one adjacent standby canvas for flicker-free forward page turns. */
  renderStandbyPage?: boolean
}

export function PDFViewer({
  url,
  currentPage,
  pages,
  onDocumentLoadSuccess,
  fitToContainer = true,
  renderStandbyPage = false,
}: Props) {
  const [numPages, setNumPages] = useState<number>()
  const containerRef = useRef<HTMLDivElement>(null)
  const requestedPageRef = useRef(currentPage)
  const [slots, setSlots] = useState(() => ({
    shownPage: currentPage,
    standbyPage: null as number | null,
    standbyReady: false,
  }))
  const [containerWidth, setContainerWidth] = useState(getInitialWidth)

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
          <div className="flex flex-col items-center justify-center gap-4 text-zinc-400 aspect-[4/3] w-full">
            <div className="w-8 h-8 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
            <p>PDFを読み込み中...</p>
          </div>
        )}
        className={`w-full ${fitToContainer ? 'h-full flex-1 flex flex-col' : 'flex flex-col'}`}
      >
        {numPages && pagesToRender.length > 0 && (
          <div className={`w-full ${fitToContainer ? 'flex flex-col h-full flex-1' : ''}`}>
            <div
              className={`relative w-full ${fitToContainer
                ? 'h-full flex-1 bg-zinc-900/50 flex items-center justify-center p-2 sm:p-4 overflow-hidden'
                : 'flex flex-col justify-center items-center gap-4'}`}
            >
              {pagesToRender.map((pageNumber, index) => (
                <div
                  key={pageNumber}
                  className={`${fitToContainer
                    ? `absolute inset-0 flex items-center justify-center overflow-hidden p-2 sm:p-4 ${index === 0 ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`
                    : 'flex flex-col items-center justify-center w-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden'}`}
                >
                  {!fitToContainer && (
                    <div className="w-full bg-zinc-800 text-center text-zinc-300 text-xs sm:text-sm font-bold py-1 sm:py-2 border-b border-zinc-700 shrink-0">
                      {index === 0 ? `現在のページ (${pageNumber}P)` : `次のページ (${pageNumber}P)`}
                    </div>
                  )}
                  <Page
                    pageNumber={pageNumber}
                    width={containerWidth}
                    className={`shadow-xl flex items-center justify-center ${fitToContainer
                      ? 'max-w-full max-h-full [&_canvas]:max-w-full [&_canvas]:max-h-full [&_canvas]:!w-auto [&_canvas]:!h-auto [&_canvas]:object-contain'
                      : '[&_canvas]:!w-full [&_canvas]:!h-auto'}`}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onRenderSuccess={() => handlePageRenderSuccess(pageNumber)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Document>
    </div>
  )
}
