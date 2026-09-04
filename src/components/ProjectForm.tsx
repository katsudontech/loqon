'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { discardProjectUploads, saveProjectRecord } from '@/app/actions'
import {
  MAX_PROJECT_TITLE_LENGTH,
  MAX_UPLOAD_BYTES,
  validateUploadMetadata,
  uploadProjectFiles,
} from '@/lib/upload'

type ProjectType = {
  id: string;
  title: string | null;
  audio_url: string | null;
  pdf_url: string | null;
}

type Props = {
  project?: ProjectType | null;
}

export function ProjectForm({ project }: Props) {
  const isUpdate = !!project;
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; audio?: string; pdf?: string }>({});
  const [progress, setProgress] = useState('');
  const submittingRef = useRef(false)

  const validateFile = (entry: FormDataEntryValue | null, kind: 'audio' | 'pdf') => {
    if (!(entry instanceof File) || !entry.name) return null
    return validateUploadMetadata(entry, kind)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return
    submittingRef.current = true
    setPending(true);
    setErrorMsg('');
    setFieldErrors({});
    setProgress('');

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const audioEntry = formData.get('audio');
    const pdfEntry = formData.get('pdf');
    // An unselected file input is represented by a nameless zero-byte File.
    // A named zero-byte file remains selected and is rejected by validation.
    const audioFile = audioEntry instanceof File && audioEntry.name ? audioEntry : null;
    const pdfFile = pdfEntry instanceof File && pdfEntry.name ? pdfEntry : null;
    const nextErrors: { title?: string; audio?: string; pdf?: string } = {};
    if (title.length > MAX_PROJECT_TITLE_LENGTH) nextErrors.title = `プロジェクト名は${MAX_PROJECT_TITLE_LENGTH}文字以下にしてください`;
    const audioError = validateFile(audioEntry, 'audio');
    const pdfError = validateFile(pdfEntry, 'pdf');
    if (audioError) nextErrors.audio = audioError;
    if (pdfError) nextErrors.pdf = pdfError;

    if (!isUpdate) {
      if (!audioFile) nextErrors.audio = nextErrors.audio ?? '音源ファイルを選択してください';
      if (!pdfFile) nextErrors.pdf = nextErrors.pdf ?? 'PDFファイルを選択してください';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setErrorMsg('入力内容を確認してください');
      setPending(false);
      submittingRef.current = false
      return;
    }

    const projectId = isUpdate ? project.id : crypto.randomUUID();
    let uploadedUrls: string[] = [];

    const cleanupUploads = async (urls: string[]) => {
      if (urls.length === 0) return
      try {
        await discardProjectUploads(projectId, urls)
      } catch (error) {
        console.warn('アップロード済みファイルのクリーンアップに失敗しました:', error)
      }
    }

    try {
      setProgress('ファイルを確認してアップロードしています…');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl) throw new Error('Supabaseの設定がありません')
      const bucket = supabase.storage.from('projects')
      const { audioUrl, pdfUrl } = await uploadProjectFiles({
        projectId,
        supabaseUrl,
        audioFile,
        pdfFile,
        upload: (path, file, options) => bucket.upload(path, file, options),
        discardPartialUploads: cleanupUploads,
      })
      setProgress('保存しています…')
      uploadedUrls = [audioUrl, pdfUrl].filter((url): url is string => Boolean(url))

      // DB保存とリダイレクトはServer Actionで行う
      await saveProjectRecord(projectId, title, audioUrl, pdfUrl, isUpdate);
      
    } catch (err: unknown) {
      await cleanupUploads(uploadedUrls)
      console.error('アップロードエラー:', err);
      const message = typeof err === 'object'
        && err !== null
        && 'message' in err
        && typeof err.message === 'string'
        ? err.message
        : 'アップロードに失敗しました';
      setErrorMsg(message);
      setPending(false);
      setProgress('');
      submittingRef.current = false
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form-panel" noValidate>
      {errorMsg && (
        <div role="alert" aria-live="assertive" className="alert alert-error">
          {errorMsg}
        </div>
      )}
      
      <div className="field">
        <label htmlFor="title">
          プロジェクト名 {isUpdate ? '' : '(任意)'}
        </label>
        <input
          type="text"
          id="title"
          name="title"
          defaultValue={project?.title || ''}
          maxLength={MAX_PROJECT_TITLE_LENGTH}
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={['title-help', fieldErrors.title ? 'title-error' : null].filter(Boolean).join(' ')}
          placeholder="例: 2026 Showcase HipHop"
          className="text-input"
        />
        <p id="title-help" className="field-help">最大{MAX_PROJECT_TITLE_LENGTH}文字</p>
        {fieldErrors.title && <p id="title-error" role="alert" className="alert-error">{fieldErrors.title}</p>}
      </div>

      <div className="field">
        <label htmlFor="audio">
          音源ファイル {isUpdate && <span className="text-zinc-500 text-xs ml-2">※変更する場合のみ選択</span>}
          {!isUpdate && <span className="text-red-400">*</span>}
        </label>
        <input
          type="file"
          id="audio"
          name="audio"
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,audio/ogg,audio/flac,audio/mp4,audio/aac,.mp3,.wav,.ogg,.oga,.flac,.m4a,.mp4,.aac"
          required={!isUpdate}
          aria-invalid={Boolean(fieldErrors.audio)}
          aria-describedby={['audio-help', fieldErrors.audio ? 'audio-error' : null].filter(Boolean).join(' ')}
          onChange={(event) => setFieldErrors((current) => ({ ...current, audio: validateFile(event.target.files?.[0] ?? null, 'audio') ?? undefined }))}
          className="file-input"
        />
        <p id="audio-help" className="field-help">MP3、WAV、OGG、FLAC、M4A、AAC / 最大{Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB</p>
        {fieldErrors.audio && <p id="audio-error" role="alert" className="alert-error">{fieldErrors.audio}</p>}
        {isUpdate && project?.audio_url && (
          <p className="field-help truncate">現在のファイル: <a href={project.audio_url} target="_blank" rel="noopener noreferrer" className="text-link">リンクを開く</a></p>
        )}
      </div>

      <div className="field">
        <label htmlFor="pdf">
          構成図 (PDF) {isUpdate && <span className="text-zinc-500 text-xs ml-2">※変更する場合のみ選択</span>}
          {!isUpdate && <span className="text-red-400">*</span>}
        </label>
        <input
          type="file"
          id="pdf"
          name="pdf"
          accept="application/pdf"
          required={!isUpdate}
          aria-invalid={Boolean(fieldErrors.pdf)}
          aria-describedby={['pdf-help', fieldErrors.pdf ? 'pdf-error' : null].filter(Boolean).join(' ')}
          onChange={(event) => setFieldErrors((current) => ({ ...current, pdf: validateFile(event.target.files?.[0] ?? null, 'pdf') ?? undefined }))}
          className="file-input"
        />
        <p id="pdf-help" className="field-help">PDF（.pdf） / 最大{Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB</p>
        {fieldErrors.pdf && <p id="pdf-error" role="alert" className="alert-error">{fieldErrors.pdf}</p>}
        {isUpdate && project?.pdf_url && (
          <p className="field-help truncate">現在のファイル: <a href={project.pdf_url} target="_blank" rel="noopener noreferrer" className="text-link">リンクを開く</a></p>
        )}
      </div>

      <div className="form-actions">
        {progress && <p className="field-help text-center" aria-live="polite" aria-busy="true">{progress}</p>}
        <button
          type="submit"
          disabled={pending}
          className="button w-full"
        >
          {pending ? (
            <>
              <span aria-hidden="true">…</span>
              {isUpdate ? '更新中...' : 'アップロード中...'}
            </>
          ) : (
            isUpdate ? '設定を更新する' : 'プロジェクトを作成する'
          )}
        </button>
      </div>
    </form>
  )
}
