'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { saveProjectRecord } from '@/app/actions'
import Link from 'next/link'

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setErrorMsg('');

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const audioFile = formData.get('audio') as File | null;
    const pdfFile = formData.get('pdf') as File | null;

    if (!isUpdate) {
      if (!audioFile || !pdfFile || audioFile.size === 0 || pdfFile.size === 0) {
        setErrorMsg('音源とPDFファイルは必須です');
        setPending(false);
        return;
      }
    }

    try {
      const projectId = isUpdate ? project.id : crypto.randomUUID();
      
      let audioUrl = null;
      if (audioFile && audioFile.size > 0) {
        const audioExtension = audioFile.name.split('.').pop();
        const audioPath = `${projectId}/audio.${audioExtension}`;
        
        const { error: audioError } = await supabase.storage
          .from('projects')
          .upload(audioPath, audioFile, {
            contentType: audioFile.type,
            cacheControl: '31536000',
            upsert: true
          });
          
        if (audioError) throw audioError;
        audioUrl = supabase.storage.from('projects').getPublicUrl(audioPath).data.publicUrl + '?t=' + Date.now();
      }

      let pdfUrl = null;
      if (pdfFile && pdfFile.size > 0) {
        const pdfPath = `${projectId}/formation.pdf`;
        
        const { error: pdfError } = await supabase.storage
          .from('projects')
          .upload(pdfPath, pdfFile, {
            contentType: pdfFile.type,
            cacheControl: '31536000',
            upsert: true
          });
          
        if (pdfError) throw pdfError;
        pdfUrl = supabase.storage.from('projects').getPublicUrl(pdfPath).data.publicUrl + '?t=' + Date.now();
      }

      // DB保存とリダイレクトはServer Actionで行う
      await saveProjectRecord(projectId, title, audioUrl, pdfUrl, isUpdate);
      
    } catch (err: any) {
      console.error('アップロードエラー:', err);
      setErrorMsg(err.message || 'アップロードに失敗しました');
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
      {errorMsg && (
        <div className="p-4 bg-red-900/30 border border-red-500 rounded-xl text-red-200 text-sm">
          {errorMsg}
        </div>
      )}
      
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium text-zinc-300">
          プロジェクト名 {isUpdate ? '' : '(任意)'}
        </label>
        <input
          type="text"
          id="title"
          name="title"
          defaultValue={project?.title || ''}
          placeholder="例: 2026 Showcase HipHop"
          className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-zinc-600 transition-all"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="audio" className="block text-sm font-medium text-zinc-300">
          音源ファイル {isUpdate && <span className="text-zinc-500 text-xs ml-2">※変更する場合のみ選択</span>}
          {!isUpdate && <span className="text-red-400">*</span>}
        </label>
        <input
          type="file"
          id="audio"
          name="audio"
          accept="audio/*"
          required={!isUpdate}
          className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
        />
        {isUpdate && project?.audio_url && (
          <p className="text-xs text-zinc-500 mt-2 truncate">現在のファイル: <a href={project.audio_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">リンクを開く</a></p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="pdf" className="block text-sm font-medium text-zinc-300">
          構成図 (PDF) {isUpdate && <span className="text-zinc-500 text-xs ml-2">※変更する場合のみ選択</span>}
          {!isUpdate && <span className="text-red-400">*</span>}
        </label>
        <input
          type="file"
          id="pdf"
          name="pdf"
          accept="application/pdf"
          required={!isUpdate}
          className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
        />
        {isUpdate && project?.pdf_url && (
          <p className="text-xs text-zinc-500 mt-2 truncate">現在のファイル: <a href={project.pdf_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">リンクを開く</a></p>
        )}
      </div>

      <div className="pt-4">
        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
