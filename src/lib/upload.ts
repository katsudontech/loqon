export const STORAGE_BUCKET = 'projects'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const MAX_PROJECT_TITLE_LENGTH = 200

export const AUDIO_FORMATS = {
  mp3: { mimeTypes: ['audio/mpeg'], extensions: ['mp3'] },
  wav: { mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'], extensions: ['wav'] },
  ogg: { mimeTypes: ['audio/ogg'], extensions: ['ogg', 'oga'] },
  flac: { mimeTypes: ['audio/flac'], extensions: ['flac'] },
  m4a: { mimeTypes: ['audio/mp4'], extensions: ['m4a', 'mp4'] },
  aac: { mimeTypes: ['audio/aac'], extensions: ['aac'] },
} as const

export type UploadKind = 'audio' | 'pdf'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const uuidPattern = new RegExp(`^${UUID}$`, 'i')
const immutableFilePattern = new RegExp(`^${UUID}[.][a-z0-9]+$`, 'i')

const audioByExtension = new Map<string, { format: string; mimeTypes: readonly string[] }>(
  Object.entries(AUDIO_FORMATS).flatMap(([format, value]) =>
    value.extensions.map((extension) => [extension, { format, mimeTypes: value.mimeTypes }] as const),
  ),
)
const audioExtensions = new Set(Object.values(AUDIO_FORMATS).flatMap((value) => value.extensions as readonly string[]))
const audioMimeTypes = new Set(Object.values(AUDIO_FORMATS).flatMap((value) => value.mimeTypes as readonly string[]))

export function extensionForFileName(name: string): string {
  return name.trim().toLowerCase().split('.').pop() ?? ''
}

export function isProjectId(value: string): boolean {
  return uuidPattern.test(value)
}

export function validateUploadMetadata(
  file: Pick<File, 'name' | 'size' | 'type'>,
  kind: UploadKind,
): string | null {
  if (!file || file.size <= 0) return 'ファイルが空です'
  if (file.size > MAX_UPLOAD_BYTES) return 'ファイルサイズは50MB以下にしてください'

  const extension = extensionForFileName(file.name)
  if (kind === 'pdf') {
    if (extension !== 'pdf' || file.type !== 'application/pdf') {
      return 'PDFはapplication/pdf形式の.pdfファイルを選択してください'
    }
    return null
  }

  const format = audioByExtension.get(extension)
  if (!format || !audioMimeTypes.has(file.type) || !(format.mimeTypes as readonly string[]).includes(file.type)) {
    return '対応している音源形式（MP3、WAV、OGG、FLAC、M4A、AAC）を選択してください'
  }
  return null
}

export async function validateUploadSignature(file: Blob, kind: UploadKind, extension: string): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length))

  if (kind === 'pdf') {
    if (text(0, 5) !== '%PDF-') return 'PDFの内容を確認できませんでした'
    const tail = new TextDecoder().decode(await file.slice(Math.max(0, file.size - 1024)).arrayBuffer())
    return tail.includes('%%EOF') ? null : 'PDFの終端を確認できませんでした'
  }

  const valid =
    (extension === 'mp3' && (text(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) ||
    (extension === 'wav' && text(0, 4) === 'RIFF' && text(8, 4) === 'WAVE') ||
    ((extension === 'ogg' || extension === 'oga') && text(0, 4) === 'OggS') ||
    (extension === 'flac' && text(0, 4) === 'fLaC') ||
    ((extension === 'm4a' || extension === 'mp4') && text(4, 4) === 'ftyp') ||
    (extension === 'aac' && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0)

  return valid ? null : 'ファイルの内容が拡張子と一致しません'
}

export function createUploadPath(projectId: string, kind: UploadKind, extension: string): string {
  if (!isProjectId(projectId)) throw new Error('不正なプロジェクトIDです')
  const normalized = extension.toLowerCase()
  if (kind === 'pdf' && normalized !== 'pdf') throw new Error('不正なPDF拡張子です')
  if (kind === 'audio' && !audioExtensions.has(normalized)) throw new Error('不正な音源拡張子です')
  return `${projectId}/${kind}/${crypto.randomUUID()}.${normalized}`
}

export function isOwnedStoragePath(
  projectId: string,
  path: string,
  kind?: UploadKind,
  options: { allowLegacy?: boolean } = {},
): boolean {
  if (!isProjectId(projectId) || path.startsWith('/') || path.includes('?') || path.includes('#')) return false

  const pieces = path.split('/')
  if (pieces[0].toLowerCase() !== projectId.toLowerCase()) return false

  if (options.allowLegacy && pieces.length === 2) {
    if (pieces[1] === 'formation.pdf') return !kind || kind === 'pdf'
    const legacyMatch = /^audio[.]([a-z0-9]+)$/i.exec(pieces[1])
    return Boolean(legacyMatch && audioExtensions.has(legacyMatch[1].toLowerCase()) && (!kind || kind === 'audio'))
  }

  if (pieces.length !== 3 || (pieces[1] !== 'audio' && pieces[1] !== 'pdf')) return false
  if (kind && pieces[1] !== kind) return false

  const extension = extensionForFileName(pieces[2])
  if (!immutableFilePattern.test(pieces[2])) return false
  return pieces[1] === 'pdf' ? extension === 'pdf' : audioExtensions.has(extension)
}

export function parseOwnedStoragePath(
  supabaseUrl: string,
  projectId: string,
  value: string,
  kind?: UploadKind,
  options: { allowQuery?: boolean; allowLegacy?: boolean } = {},
): string | null {
  if (!isProjectId(projectId)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  let expectedOrigin: string
  try {
    expectedOrigin = new URL(supabaseUrl).origin
  } catch {
    return null
  }
  if (
    url.origin !== expectedOrigin
    || url.username
    || url.password
    || (!options.allowQuery && url.search)
    || url.hash
  ) return null
  const prefix = `/storage/v1/object/public/${STORAGE_BUCKET}/`
  if (!url.pathname.startsWith(prefix)) return null
  let path: string
  try {
    path = decodeURIComponent(url.pathname.slice(prefix.length))
  } catch {
    return null
  }
  return isOwnedStoragePath(projectId, path, kind, { allowLegacy: options.allowLegacy }) ? path : null
}

export function storagePublicUrl(supabaseUrl: string, path: string): string {
  return `${new URL(supabaseUrl).origin}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`
}

export function extensionForPath(path: string): string {
  return path.split('/').pop()?.split('.').pop()?.toLowerCase() ?? ''
}

type UploadError = { message?: string } | null

export type UploadFile = (
  path: string,
  file: File,
  options: { contentType: string; cacheControl: string; upsert: false },
) => Promise<{ error: UploadError }>

type UploadProjectFilesOptions = {
  projectId: string
  supabaseUrl: string
  audioFile: File | null
  pdfFile: File | null
  upload: UploadFile
  discardPartialUploads: (urls: string[]) => Promise<void>
}

export type UploadedProjectFiles = {
  audioUrl: string | null
  pdfUrl: string | null
}

/**
 * Validates the whole selected batch before the first network write, then
 * uploads to immutable paths. If a later upload fails, the caller-provided
 * server cleanup is asked to remove the already-created objects.
 */
export async function uploadProjectFiles({
  projectId,
  supabaseUrl,
  audioFile,
  pdfFile,
  upload,
  discardPartialUploads,
}: UploadProjectFilesOptions): Promise<UploadedProjectFiles> {
  for (const [file, kind] of [[audioFile, 'audio'], [pdfFile, 'pdf']] as const) {
    if (!file) continue
    const metadataError = validateUploadMetadata(file, kind)
    if (metadataError) throw new Error(metadataError)
    const signatureError = await validateUploadSignature(file, kind, extensionForFileName(file.name))
    if (signatureError) throw new Error(signatureError)
  }

  const uploadedUrls: string[] = []
  const result: UploadedProjectFiles = { audioUrl: null, pdfUrl: null }

  try {
    if (audioFile) {
      const audioPath = createUploadPath(projectId, 'audio', extensionForFileName(audioFile.name))
      const { error } = await upload(audioPath, audioFile, {
        contentType: audioFile.type,
        cacheControl: '31536000',
        upsert: false,
      })
      if (error) throw new Error(error.message || '音源のアップロードに失敗しました')
      result.audioUrl = storagePublicUrl(supabaseUrl, audioPath)
      uploadedUrls.push(result.audioUrl)
    }

    if (pdfFile) {
      const pdfPath = createUploadPath(projectId, 'pdf', 'pdf')
      const { error } = await upload(pdfPath, pdfFile, {
        contentType: 'application/pdf',
        cacheControl: '31536000',
        upsert: false,
      })
      if (error) throw new Error(error.message || 'PDFのアップロードに失敗しました')
      result.pdfUrl = storagePublicUrl(supabaseUrl, pdfPath)
      uploadedUrls.push(result.pdfUrl)
    }
  } catch (error) {
    if (uploadedUrls.length > 0) {
      try {
        await discardPartialUploads(uploadedUrls)
      } catch (cleanupError) {
        console.warn('アップロード途中のファイル清掃に失敗しました:', cleanupError)
      }
    }
    throw error
  }

  return result
}
