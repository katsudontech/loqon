import { beforeEach, describe, expect, it, vi } from 'vitest'

const projectId = '123e4567-e89b-12d3-a456-426614174000'
const otherProjectId = '223e4567-e89b-12d3-a456-426614174000'
const supabaseUrl = 'https://example.supabase.co'
const newAudioPath = `${projectId}/audio/123e4567-e89b-12d3-a456-426614174001.mp3`
const newAudioUrl = `${supabaseUrl}/storage/v1/object/public/projects/${newAudioPath}`
const newPdfPath = `${projectId}/pdf/123e4567-e89b-12d3-a456-426614174002.pdf`
const newPdfUrl = `${supabaseUrl}/storage/v1/object/public/projects/${newPdfPath}`

const { adminMock, rpcMock, removeMock, downloadMock } = vi.hoisted(() => {
  const rpc = vi.fn()
  const remove = vi.fn(async () => ({ error: null }))
  const download = vi.fn(async (path: string) => ({
    data: path.includes('/pdf/')
      ? new Blob(['%PDF-1.7\n%%EOF'], { type: 'application/pdf' })
      : new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x64])], { type: 'audio/mpeg' }),
    error: null,
  }))
  return {
    rpcMock: rpc,
    removeMock: remove,
    downloadMock: download,
    adminMock: {
      rpc,
      storage: { from: () => ({ download, remove }) },
    },
  }
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => adminMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('REDIRECT') }) }))

describe('saveProjectRecord upload compensation', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
    rpcMock.mockReset()
    removeMock.mockClear()
    downloadMock.mockClear()
  })

  it('commits a successful upload only after validating both stored objects', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'create_project_by_id') return Promise.resolve({ error: null })
      throw new Error(`unexpected RPC ${name}`)
    })
    const { saveProjectRecord } = await import('@/app/actions')

    await expect(saveProjectRecord(projectId, 'Title', newAudioUrl, newPdfUrl, false)).rejects.toThrow('REDIRECT')
    expect(downloadMock).toHaveBeenNthCalledWith(1, newAudioPath)
    expect(downloadMock).toHaveBeenNthCalledWith(2, newPdfPath)
    expect(rpcMock).toHaveBeenCalledWith('create_project_by_id', expect.objectContaining({
      p_audio_url: newAudioUrl,
      p_pdf_url: newPdfUrl,
    }))
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('removes both new objects after a database failure without deleting the old URLs', async () => {
    const oldAudioUrl = `${supabaseUrl}/storage/v1/object/public/projects/${projectId}/audio.mp3?t=123`
    const oldPdfUrl = `${supabaseUrl}/storage/v1/object/public/projects/${projectId}/formation.pdf?t=123`
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_public_project') {
        return { maybeSingle: async () => ({ data: { audio_url: oldAudioUrl, pdf_url: oldPdfUrl }, error: null }) }
      }
      if (name === 'update_project_by_id') return Promise.resolve({ error: new Error('database unavailable') })
      throw new Error(`unexpected RPC ${name}`)
    })
    const { saveProjectRecord } = await import('@/app/actions')

    await expect(saveProjectRecord(projectId, 'Title', newAudioUrl, newPdfUrl, true))
      .rejects.toThrow('database unavailable')
    expect(removeMock).toHaveBeenCalledWith([newAudioPath, newPdfPath])
    expect(removeMock).not.toHaveBeenCalledWith(expect.arrayContaining([
      `${projectId}/audio.mp3`,
      `${projectId}/formation.pdf`,
    ]))
  })

  it('updates project metadata without requiring replacement files', async () => {
    const oldAudioUrl = `${supabaseUrl}/storage/v1/object/public/projects/${projectId}/audio.mp3?t=123`
    const oldPdfUrl = `${supabaseUrl}/storage/v1/object/public/projects/${projectId}/formation.pdf?t=123`
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_public_project') {
        return { maybeSingle: async () => ({ data: { audio_url: oldAudioUrl, pdf_url: oldPdfUrl }, error: null }) }
      }
      if (name === 'update_project_by_id') return Promise.resolve({ error: null })
      throw new Error(`unexpected RPC ${name}`)
    })
    const { saveProjectRecord } = await import('@/app/actions')

    await expect(saveProjectRecord(projectId, 'Renamed', null, null, true)).rejects.toThrow('REDIRECT')
    expect(rpcMock).toHaveBeenCalledWith('update_project_by_id', expect.objectContaining({
      p_title: 'Renamed',
      p_audio_url: null,
      p_pdf_url: null,
    }))
    expect(downloadMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('rejects a projectId/path mismatch before touching the database or another project path', async () => {
    const mismatchedUrl = newAudioUrl.replace(projectId, otherProjectId)
    const { saveProjectRecord } = await import('@/app/actions')

    await expect(saveProjectRecord(projectId, 'Title', mismatchedUrl, newPdfUrl, false))
      .rejects.toThrow('Storage領域')
    expect(rpcMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('rejects spoofed stored MIME and compensates the strictly parsed new path', async () => {
    downloadMock.mockResolvedValueOnce({
      data: new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x64])], { type: 'application/pdf' }),
      error: null,
    })
    const { saveProjectRecord } = await import('@/app/actions')

    await expect(saveProjectRecord(projectId, 'Title', newAudioUrl, newPdfUrl, false))
      .rejects.toThrow('対応している音源形式')
    expect(rpcMock).not.toHaveBeenCalled()
    expect(removeMock).toHaveBeenCalledWith([newAudioPath, newPdfPath])
  })
})

describe('discardProjectUploads', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
    rpcMock.mockReset()
    removeMock.mockClear()
  })

  it('never removes an object that the current project record references', async () => {
    rpcMock.mockReturnValue({
      maybeSingle: async () => ({
        data: { audio_url: newAudioUrl, pdf_url: newPdfUrl },
        error: null,
      }),
    })
    const { discardProjectUploads } = await import('@/app/actions')

    await discardProjectUploads(projectId, [newAudioUrl, newPdfUrl])
    expect(removeMock).not.toHaveBeenCalled()
  })
})
