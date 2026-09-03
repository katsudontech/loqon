import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { uploadProjectFiles } = vi.hoisted(() => ({
  uploadProjectFiles: vi.fn(() => new Promise(() => undefined)),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: vi.fn() } },
}))
vi.mock('@/app/actions', () => ({
  discardProjectUploads: vi.fn(),
  saveProjectRecord: vi.fn(),
}))
vi.mock('@/lib/upload', async () => {
  const actual = await vi.importActual<typeof import('@/lib/upload')>('@/lib/upload')
  return { ...actual, uploadProjectFiles }
})

import { ProjectForm } from './ProjectForm'

describe('ProjectForm validation accessibility', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    uploadProjectFiles.mockClear()
  })

  const render = () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(React.createElement(ProjectForm)))
    return host.querySelector('form') as HTMLFormElement
  }

  const submit = async (form: HTMLFormElement) => {
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
  }

  it('shows required errors near fields and preserves typed title', async () => {
    const form = render()
    const title = form.querySelector('#title') as HTMLInputElement
    title.value = '練習用プロジェクト'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    await submit(form)

    expect(title.value).toBe('練習用プロジェクト')
    expect(form.querySelector('#audio-error')?.textContent).toContain('音源ファイルを選択')
    expect(form.querySelector('#pdf-error')?.textContent).toContain('PDFファイルを選択')
    expect(form.querySelector('#audio')?.getAttribute('aria-invalid')).toBe('true')
    expect(form.querySelector('#audio')?.getAttribute('aria-describedby')).toBe('audio-help audio-error')
    expect(form.querySelector('#pdf')?.getAttribute('aria-describedby')).toBe('pdf-help pdf-error')
  })

  it('shows type and size errors immediately for selected files', () => {
    const form = render()
    const audio = form.querySelector('#audio') as HTMLInputElement
    const invalidType = new File(['not audio'], 'practice.txt', { type: 'text/plain' })
    Object.defineProperty(audio, 'files', { configurable: true, value: [invalidType] })
    act(() => audio.dispatchEvent(new Event('change', { bubbles: true })))
    expect(form.querySelector('#audio-error')?.textContent).toContain('対応している音源形式')

    const pdf = form.querySelector('#pdf') as HTMLInputElement
    const oversized = new File(['small'], 'formation.pdf', { type: 'application/pdf' })
    Object.defineProperty(oversized, 'size', { configurable: true, value: 50 * 1024 * 1024 + 1 })
    Object.defineProperty(pdf, 'files', { configurable: true, value: [oversized] })
    act(() => pdf.dispatchEvent(new Event('change', { bubbles: true })))
    expect(form.querySelector('#pdf-error')?.textContent).toContain('50MB以下')
  })

  it('blocks a second submit synchronously while an upload is pending', async () => {
    render()
    // Updating an existing project allows both file inputs to remain empty.
    act(() => root?.render(React.createElement(ProjectForm, {
      project: { id: '123e4567-e89b-12d3-a456-426614174000', title: '既存', audio_url: null, pdf_url: null },
    })))
    const updatedForm = host?.querySelector('form') as HTMLFormElement
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    await act(async () => {
      updatedForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      updatedForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(uploadProjectFiles).toHaveBeenCalledOnce()
  })
})
