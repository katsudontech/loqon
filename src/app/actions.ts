'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  MAX_PROJECT_TITLE_LENGTH,
  extensionForPath,
  isOwnedStoragePath,
  isProjectId,
  parseOwnedStoragePath,
  validateUploadMetadata,
  validateUploadSignature,
} from '@/lib/upload'

type UploadKind = 'audio' | 'pdf'
type ExpectedProjectState = { audioUrl: string; pdfUrl: string }

function requireSupabaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('Supabaseの設定がありません')
  return supabaseUrl
}

function validateProjectInput(
  projectId: unknown,
  title: unknown,
  audioUrl: unknown,
  pdfUrl: unknown,
  isUpdate: unknown,
): asserts projectId is string {
  if (typeof projectId !== 'string' || !isProjectId(projectId)) throw new Error('不正なプロジェクトIDです')
  if (typeof title !== 'string' || title.length > MAX_PROJECT_TITLE_LENGTH || title.includes('\0')) {
    throw new Error(`プロジェクト名は${MAX_PROJECT_TITLE_LENGTH}文字以下にしてください`)
  }
  if (audioUrl !== null && typeof audioUrl !== 'string') throw new Error('不正な音源URLです')
  if (pdfUrl !== null && typeof pdfUrl !== 'string') throw new Error('不正なPDF URLです')
  if (typeof isUpdate !== 'boolean') throw new Error('不正な保存モードです')
}

async function removeObjects(
  projectId: string,
  paths: string[],
  reason: string,
  allowLegacy = false,
): Promise<void> {
  if (paths.length === 0) return

  const safePaths = [...new Set(paths)].filter((path) =>
    isOwnedStoragePath(projectId, path, undefined, { allowLegacy }),
  )
  if (safePaths.length !== paths.length) {
    console.warn(`${reason}: project配下でないパスの削除を拒否しました`)
  }
  if (safePaths.length === 0) return

  try {
    const { error } = await getSupabaseAdmin().storage.from('projects').remove(safePaths)
    if (error) console.warn(`${reason}に失敗しました:`, error)
  } catch (error) {
    console.warn(`${reason}に失敗しました:`, error)
  }
}

function parseNewObject(url: string, projectId: string, kind: UploadKind): string {
  const path = parseOwnedStoragePath(requireSupabaseUrl(), projectId, url, kind)
  if (!path) throw new Error('ファイルURLがプロジェクトのStorage領域を指していません')
  return path
}

async function validateStoredObject(path: string, kind: UploadKind): Promise<void> {
  const { data, error } = await getSupabaseAdmin().storage.from('projects').download(path)
  if (error || !data) throw new Error('アップロードしたファイルを確認できませんでした')

  const metadataError = validateUploadMetadata({
    name: path.split('/').at(-1) ?? '',
    size: data.size,
    type: data.type,
  }, kind)
  if (metadataError) throw new Error(metadataError)

  const signatureError = await validateUploadSignature(data, kind, extensionForPath(path))
  if (signatureError) throw new Error(signatureError)
}

/**
 * Best-effort compensation for a browser-to-Storage batch that failed before
 * saveProjectRecord ran. Only immutable paths for this exact project can be
 * removed, and objects currently referenced by the project are protected.
 */
export async function discardProjectUploads(projectId: string, urls: string[]): Promise<void> {
  if (!isProjectId(projectId)) throw new Error('不正なプロジェクトIDです')
  if (!Array.isArray(urls) || urls.length > 2 || urls.some((url) => typeof url !== 'string')) {
    throw new Error('不正なクリーンアップ対象です')
  }

  const uniqueUrls = [...new Set(urls)]
  const paths = uniqueUrls.map((url) => {
    const path = parseOwnedStoragePath(requireSupabaseUrl(), projectId, url)
    if (!path) throw new Error('project配下でないファイルは削除できません')
    return path
  })

  const { data: current, error } = await getSupabaseAdmin()
    .rpc('get_public_project', { p_project_id: projectId })
    .maybeSingle()
  if (error) throw new Error('クリーンアップ前のプロジェクト確認に失敗しました')

  const referencedPaths = new Set<string>()
  if (current) {
    for (const [url, kind] of [[current.audio_url, 'audio'], [current.pdf_url, 'pdf']] as const) {
      const path = parseOwnedStoragePath(requireSupabaseUrl(), projectId, url, kind, {
        allowQuery: true,
        allowLegacy: true,
      })
      if (path) referencedPaths.add(path)
    }
  }

  await removeObjects(projectId, paths.filter((path) => !referencedPaths.has(path)), '未確定ファイルの補償削除')
}

export async function saveProjectRecord(
  projectId: string,
  title: string,
  audioUrl: string | null,
  pdfUrl: string | null,
  isUpdate: boolean,
) {
  const newPaths: string[] = []
  let oldAudioPath: string | null = null
  let oldPdfPath: string | null = null
  let mutationAttempted = false
  let expectedState: ExpectedProjectState | null = null

  try {
    validateProjectInput(projectId, title, audioUrl, pdfUrl, isUpdate)
    if (!isUpdate && (!audioUrl || !pdfUrl)) throw new Error('音源とPDFファイルは必須です')

    const uploads: Array<{ path: string; kind: UploadKind }> = []
    if (audioUrl) {
      const path = parseNewObject(audioUrl, projectId, 'audio')
      uploads.push({ path, kind: 'audio' })
      newPaths.push(path)
    }
    if (pdfUrl) {
      const path = parseNewObject(pdfUrl, projectId, 'pdf')
      uploads.push({ path, kind: 'pdf' })
      newPaths.push(path)
    }

    for (const upload of uploads) await validateStoredObject(upload.path, upload.kind)

    const admin = getSupabaseAdmin()
    if (isUpdate) {
      const { data: current, error: currentError } = await admin
        .rpc('get_public_project', { p_project_id: projectId })
        .maybeSingle()
      if (currentError) throw currentError
      if (!current) throw new Error('プロジェクトが見つかりません')

      oldAudioPath = parseOwnedStoragePath(requireSupabaseUrl(), projectId, current.audio_url, 'audio', {
        allowQuery: true,
        allowLegacy: true,
      })
      oldPdfPath = parseOwnedStoragePath(requireSupabaseUrl(), projectId, current.pdf_url, 'pdf', {
        allowQuery: true,
        allowLegacy: true,
      })

      expectedState = {
        audioUrl: audioUrl ?? current.audio_url,
        pdfUrl: pdfUrl ?? current.pdf_url,
      }
      mutationAttempted = true
      const { error } = await admin.rpc('update_project_by_id', {
        p_project_id: projectId,
        p_title: title,
        p_audio_url: audioUrl,
        p_pdf_url: pdfUrl,
      })
      if (error) throw error
    } else {
      expectedState = {
        audioUrl: audioUrl!,
        pdfUrl: pdfUrl!,
      }
      mutationAttempted = true
      const { error } = await admin.rpc('create_project_by_id', {
        p_project_id: projectId,
        p_title: title,
        p_audio_url: audioUrl!,
        p_pdf_url: pdfUrl!,
      })
      if (error) throw error
    }
  } catch (error) {
    let observedMutation = false
    let observationFailed = false
    if (mutationAttempted && expectedState) {
      try {
        const { data: observed, error: observationError } = await getSupabaseAdmin()
          .rpc('get_public_project', { p_project_id: projectId })
          .maybeSingle()
        if (observationError) {
          observationFailed = true
        } else {
          observedMutation = Boolean(
            newPaths.length > 0
            &&
            observed
            && observed.audio_url === expectedState.audioUrl
            && observed.pdf_url === expectedState.pdfUrl,
          )
        }
      } catch {
        observationFailed = true
      }
    }

    if (observedMutation) {
      console.warn('DB応答は失敗しましたが、保存済みの状態を再確認できました:', error)
    } else {
      // If the commit result cannot be observed, keeping a possible orphan is
      // safer than deleting an object that the database may now reference.
      if (!observationFailed) await removeObjects(projectId, newPaths, '新しいファイルの補償削除')
      else console.warn('DB commit結果を確認できないため、新しいファイルを保持します:', error)
      console.error('データベース保存エラー:', error)
      throw new Error(error instanceof Error ? error.message : 'プロジェクト情報の保存に失敗しました')
    }
  }

  // The database now points at the immutable replacements. Everything below is
  // post-commit housekeeping and must never delete the committed new objects.
  const replacementAudio = newPaths.find((path) => path.includes('/audio/'))
  const replacementPdf = newPaths.find((path) => path.includes('/pdf/'))
  const replaced = [
    audioUrl && oldAudioPath && oldAudioPath !== replacementAudio ? oldAudioPath : null,
    pdfUrl && oldPdfPath && oldPdfPath !== replacementPdf ? oldPdfPath : null,
  ].filter((path): path is string => Boolean(path))
  await removeObjects(projectId, replaced, '置き換え前ファイルのクリーンアップ', true)

  if (isUpdate) {
    try {
      revalidatePath(`/${projectId}/edit`)
    } catch (error) {
      console.warn('更新後の再検証に失敗しました:', error)
    }
  }
  redirect(`/${projectId}/edit`)
}
