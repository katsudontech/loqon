import React from 'react'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

type DocumentProps = {
  children?: React.ReactNode
  onLoadSuccess?: (value: { numPages: number }) => void
  options?: object
}

type PageProps = {
  pageNumber: number
  onRenderSuccess?: () => void
}

let latestDocumentProps: DocumentProps | undefined
let latestPageProps: PageProps[] = []

vi.mock('react-pdf', () => ({
  pdfjs: { version: 'test-version', GlobalWorkerOptions: {} },
  Document: (props: DocumentProps) => {
    latestDocumentProps = props
    return React.createElement('section', { 'data-testid': 'document' }, props.children)
  },
  Page: (props: PageProps) => {
    latestPageProps.push(props)
    return React.createElement('canvas', { 'data-page': props.pageNumber })
  },
}))

import { PDF_DOCUMENT_OPTIONS, PDFViewer, getVisiblePdfPages } from './PDFViewer'

describe('PDFViewer performance bounds', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
    latestDocumentProps = undefined
    latestPageProps = []
  })

  it('keeps Document options reference-stable across renders', () => {
    expect(PDF_DOCUMENT_OPTIONS).toBe(PDF_DOCUMENT_OPTIONS)
    expect(Object.isFrozen(PDF_DOCUMENT_OPTIONS)).toBe(true)

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    act(() => {
      root?.render(React.createElement(PDFViewer, { url: '/formation.pdf', currentPage: 1 }))
    })
    const firstOptions = latestDocumentProps?.options
    act(() => {
      root?.render(React.createElement(PDFViewer, { url: '/formation.pdf', currentPage: 2 }))
    })

    expect(firstOptions).toBe(PDF_DOCUMENT_OPTIONS)
    expect(latestDocumentProps?.options).toBe(firstOptions)
  })

  it('renders at most two pages while switching the visible window', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const render = (currentPage: number, pages: number[]) => {
      act(() => {
        root?.render(React.createElement(PDFViewer, {
          url: '/formation.pdf',
          currentPage,
          pages,
          fitToContainer: false,
        }))
      })
      act(() => latestDocumentProps?.onLoadSuccess?.({ numPages: 3 }))
    }

    render(1, [1, 2, 3])
    expect(host.querySelectorAll('[data-page]').length).toBe(2)
    render(2, [2, 3, 4])
    expect(host.querySelectorAll('[data-page]').length).toBe(2)
    render(3, [3, 4, 5])
    expect(host.querySelectorAll('[data-page]').length).toBe(1)
    expect(getVisiblePdfPages(1, [1, 2, 3, 4])).toEqual([1, 2])

    latestPageProps = []
    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/formation.pdf',
        currentPage: 1,
        renderStandbyPage: true,
      }))
    })
    act(() => latestDocumentProps?.onLoadSuccess?.({ numPages: 3 }))
    expect([...host.querySelectorAll('[data-page]')].map((node) => node.getAttribute('data-page')))
      .toEqual(['1', '2'])
    expect(host.querySelector('[data-page="1"]')?.parentElement?.className).not.toContain('opacity-0')
    expect(host.querySelector('[data-page="2"]')?.parentElement?.className).toContain('opacity-0')
    act(() => latestPageProps.find((props) => props.pageNumber === 2)?.onRenderSuccess?.())
    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/formation.pdf',
        currentPage: 2,
        renderStandbyPage: true,
      }))
    })
    expect([...host.querySelectorAll('[data-page]')].map((node) => node.getAttribute('data-page')))
      .toEqual(['2', '3'])
    expect(host.querySelector('[data-page="2"]')?.parentElement?.className).not.toContain('opacity-0')
    expect(host.querySelector('[data-page="3"]')?.parentElement?.className).toContain('opacity-0')

    // A non-adjacent jump keeps the currently visible page until the target
    // reports that its canvas is ready, and still never mounts three pages.
    latestPageProps = []
    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/second-formation.pdf',
        currentPage: 1,
        renderStandbyPage: true,
      }))
    })
    act(() => latestDocumentProps?.onLoadSuccess?.({ numPages: 4 }))
    act(() => latestPageProps.find((props) => props.pageNumber === 2)?.onRenderSuccess?.())
    latestPageProps = []
    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/second-formation.pdf',
        currentPage: 4,
        renderStandbyPage: true,
      }))
    })
    expect([...host.querySelectorAll('[data-page]')].map((node) => node.getAttribute('data-page')))
      .toEqual(['1', '4'])
    expect(host.querySelector('[data-page="1"]')?.parentElement?.className).not.toContain('opacity-0')
    expect(host.querySelector('[data-page="4"]')?.parentElement?.className).toContain('opacity-0')

    act(() => latestPageProps.find((props) => props.pageNumber === 4)?.onRenderSuccess?.())
    expect([...host.querySelectorAll('[data-page]')].map((node) => node.getAttribute('data-page')))
      .toEqual(['4'])
    expect(host.querySelector('[data-page="4"]')?.parentElement?.className).not.toContain('opacity-0')

    // A rapid second jump discards the first target's callback without ever
    // exposing a third canvas.
    latestPageProps = []
    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/second-formation.pdf',
        currentPage: 2,
        renderStandbyPage: true,
      }))
    })
    const staleTargetCallback = latestPageProps.find((props) => props.pageNumber === 2)?.onRenderSuccess
    latestPageProps = []
    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/second-formation.pdf',
        currentPage: 3,
        renderStandbyPage: true,
      }))
    })
    expect(host.querySelectorAll('[data-page]').length).toBe(2)
    act(() => staleTargetCallback?.())
    expect([...host.querySelectorAll('[data-page]')].map((node) => node.getAttribute('data-page')))
      .toEqual(['4', '3'])
    act(() => latestPageProps.find((props) => props.pageNumber === 3)?.onRenderSuccess?.())
    expect([...host.querySelectorAll('[data-page]')].map((node) => node.getAttribute('data-page')))
      .toEqual(['3', '4'])
  })

  it('renders formation labels and a bounded empty next state on the final page', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/formation.pdf',
        currentPage: 1,
        pages: [1, 2],
        pageLabels: { current: '現在の構成', next: '次の構成', emptyNext: '次の構成はありません' },
        fitToContainer: false,
      }))
    })
    act(() => latestDocumentProps?.onLoadSuccess?.({ numPages: 2 }))

    expect(host.querySelectorAll('[data-page]')).toHaveLength(2)
    expect(host.textContent).toContain('現在の構成 1 / 2')
    expect(host.textContent).toContain('次の構成 2 / 2')

    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/formation.pdf',
        currentPage: 2,
        pages: [2],
        pageLabels: { current: '現在の構成', next: '次の構成', emptyNext: '次の構成はありません' },
        showEmptyNext: true,
        fitToContainer: false,
      }))
    })

    expect(host.querySelectorAll('[data-page]')).toHaveLength(1)
    expect(host.textContent).toContain('現在の構成 2 / 2')
    expect(host.textContent).toContain('次の構成はありません')
  })

  it('exposes working zoom, reset, and focus-mode controls', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    act(() => {
      root?.render(React.createElement(PDFViewer, {
        url: '/formation.pdf',
        currentPage: 1,
      }))
    })
    act(() => latestDocumentProps?.onLoadSuccess?.({ numPages: 1 }))

    expect(host.querySelectorAll('[data-page]')).toHaveLength(1)
    const zoomIn = host.querySelector('[aria-label="PDFを拡大"]') as HTMLButtonElement
    const reset = host.querySelector('[aria-label="PDFの倍率をリセット"]') as HTMLButtonElement
    act(() => zoomIn.click())
    expect(host.querySelector('.pdf-stage-inner')?.className).toContain('pdf-zoomed')
    expect(host.querySelector('.pdf-page')?.className).toContain('pdf-page-zoomed')

    act(() => reset.click())
    expect(host.querySelector('.pdf-stage-inner')?.className).not.toContain('pdf-zoomed')

    const page = host.querySelector('[role="button"]') as HTMLDivElement
    const stage = host.querySelector('.pdf-stage-inner') as HTMLDivElement
    Object.defineProperty(stage, 'requestFullscreen', { configurable: true, value: undefined })
    act(() => page.click())
    expect(stage.className).toContain('pdf-focus-mode')
    expect(page.getAttribute('aria-label')).toBe('PDFのフォーカス表示を終了')
    act(() => page.click())
    expect(stage.className).not.toContain('pdf-focus-mode')
  })
})

describe('PDF/PWA source safeguards', () => {
  it('has no runtime CDN worker/CMap and no misleading install claims', async () => {
    const componentPath = path.resolve(process.cwd(), 'src/components')
    const pdfSource = await readFile(path.join(componentPath, 'PDFViewer.tsx'), 'utf8')
    const promptSource = await readFile(path.join(componentPath, 'InstallPrompt.tsx'), 'utf8')

    const forbiddenCdn = ['un', 'pkg'].join('')
    expect(pdfSource.toLowerCase()).not.toContain(forbiddenCdn)
    expect(pdfSource).toContain('/pdfjs/${pdfjs.version}/cmaps/')
    expect(pdfSource).toContain('/pdfjs/${pdfjs.version}/standard_fonts/')
    expect(pdfSource).toContain('/pdfjs/${pdfjs.version}/wasm/')
    expect(pdfSource).toContain('/pdfjs/${pdfjs.version}/iccs/')
    const misleadingPhrases = [
      ['通信量が', '大幅に', '削減'].join(''),
      ['オフ', 'ライン'].join(''),
      ['7', '日'].join(''),
      [
        ['再', 'び'].join(''),
        ['ダウン', 'ロード'].join(''),
      ].join(''),
    ]
    for (const phrase of misleadingPhrases) {
      expect(promptSource).not.toContain(phrase)
    }
  })
})
