'use server'

import { supabase } from '@/lib/supabase'
import { redirect } from 'next/navigation'

export async function createProject(formData: FormData) {
  // 1. フォームからデータを取り出す
  const title = formData.get('title') as string
  const audioFile = formData.get('audio') as File
  const pdfFile = formData.get('pdf') as File

  if (!audioFile || !pdfFile || audioFile.size === 0 || pdfFile.size === 0) {
    throw new Error('音源とPDFファイルは必須です')
  }

  // 2. 新しいプロジェクトのID（UUID）を生成
  const projectId = crypto.randomUUID()

  try {
    // 3. Supabase Storage にファイルをアップロード
    // 音源のアップロード (WAVやM4Aなどに対応するため拡張子を動的に取得)
    const audioExtension = audioFile.name.split('.').pop()
    const audioPath = `${projectId}/audio.${audioExtension}`
    const audioBuffer = await audioFile.arrayBuffer()
    const { error: audioError } = await supabase.storage
      .from('projects')
      .upload(audioPath, audioBuffer, {
        contentType: audioFile.type,
        cacheControl: '31536000',
        upsert: false
      })
    if (audioError) throw audioError

    // PDFのアップロード
    const pdfPath = `${projectId}/formation.pdf`
    const pdfBuffer = await pdfFile.arrayBuffer()
    const { error: pdfError } = await supabase.storage
      .from('projects')
      .upload(pdfPath, pdfBuffer, {
        contentType: pdfFile.type,
        cacheControl: '31536000',
        upsert: false
      })
    if (pdfError) throw pdfError

    // 4. アップロードしたファイルの公開URLを取得
    const { data: audioUrlData } = supabase.storage.from('projects').getPublicUrl(audioPath)
    const { data: pdfUrlData } = supabase.storage.from('projects').getPublicUrl(pdfPath)

    // 5. データベースの projects テーブルに情報を保存
    const { error: dbError } = await supabase
      .from('projects')
      .insert({
        id: projectId,
        title: title || '名称未設定プロジェクト',
        audio_url: audioUrlData.publicUrl,
        pdf_url: pdfUrlData.publicUrl,
      })

    if (dbError) throw dbError

  } catch (error) {
    console.error('アップロードエラー:', error)
    // エラーハンドリング（本来は画面にエラーを返しますが、今回はシンプルにコンソール出力のみ）
    throw new Error('アップロードに失敗しました')
  }

  // 6. 成功したら編集画面へ自動リダイレクト
  redirect(`/${projectId}/edit`)
}
