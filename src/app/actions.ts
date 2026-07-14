'use server'

import { supabase } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function saveProject(existingProjectId: string | null, formData: FormData) {
  // 1. フォームからデータを取り出す
  const title = formData.get('title') as string
  const audioFile = formData.get('audio') as File | null
  const pdfFile = formData.get('pdf') as File | null

  const isUpdate = !!existingProjectId;
  
  if (!isUpdate) {
      if (!audioFile || !pdfFile || audioFile.size === 0 || pdfFile.size === 0) {
        throw new Error('音源とPDFファイルは必須です')
      }
  }

  // 2. プロジェクトのID（UUID）を生成または取得
  const projectId = isUpdate ? existingProjectId : crypto.randomUUID()

  try {
    // 3. Supabase Storage にファイルをアップロード
    let audioUrl = null;
    if (audioFile && audioFile.size > 0) {
      const audioExtension = audioFile.name.split('.').pop()
      const audioPath = `${projectId}/audio.${audioExtension}`
      const audioBuffer = await audioFile.arrayBuffer()
      const { error: audioError } = await supabase.storage
        .from('projects')
        .upload(audioPath, audioBuffer, {
          contentType: audioFile.type,
          cacheControl: '31536000',
          upsert: true
        })
      if (audioError) throw audioError
      audioUrl = supabase.storage.from('projects').getPublicUrl(audioPath).data.publicUrl + '?t=' + Date.now();
    }

    // PDFのアップロード
    let pdfUrl = null;
    if (pdfFile && pdfFile.size > 0) {
      const pdfPath = `${projectId}/formation.pdf`
      const pdfBuffer = await pdfFile.arrayBuffer()
      const { error: pdfError } = await supabase.storage
        .from('projects')
        .upload(pdfPath, pdfBuffer, {
          contentType: pdfFile.type,
          cacheControl: '31536000',
          upsert: true
        })
      if (pdfError) throw pdfError
      pdfUrl = supabase.storage.from('projects').getPublicUrl(pdfPath).data.publicUrl + '?t=' + Date.now();
    }

    // 5. データベースの projects テーブルに情報を保存
    if (isUpdate) {
        const updateData: any = { title: title || '名称未設定プロジェクト' };
        if (audioUrl) updateData.audio_url = audioUrl;
        if (pdfUrl) updateData.pdf_url = pdfUrl;

        const { error: dbError } = await supabase
          .from('projects')
          .update(updateData)
          .eq('id', projectId);

        if (dbError) throw dbError;
        
        revalidatePath(`/${projectId}/edit`);
    } else {
        const { error: dbError } = await supabase
          .from('projects')
          .insert({
            id: projectId,
            title: title || '名称未設定プロジェクト',
            audio_url: audioUrl!,
            pdf_url: pdfUrl!,
          })

        if (dbError) throw dbError;
    }

  } catch (error) {
    console.error('アップロードエラー:', error)
    throw new Error('アップロードに失敗しました')
  }

  // 6. 成功したら編集画面へリダイレクト
  redirect(`/${projectId}/edit`)
}
