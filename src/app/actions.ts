'use server'

import { supabase } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/types/database.types'

type ProjectUpdate = Database['public']['Tables']['projects']['Update']

export async function saveProjectRecord(
  projectId: string,
  title: string,
  audioUrl: string | null,
  pdfUrl: string | null,
  isUpdate: boolean
) {
  try {
    if (isUpdate) {
      const updateData: ProjectUpdate = { title: title || '名称未設定プロジェクト' }
      if (audioUrl) updateData.audio_url = audioUrl
      if (pdfUrl) updateData.pdf_url = pdfUrl

      const { error: dbError } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)

      if (dbError) throw dbError
      
      revalidatePath(`/${projectId}/edit`)
    } else {
      const { error: dbError } = await supabase
        .from('projects')
        .insert({
          id: projectId,
          title: title || '名称未設定プロジェクト',
          audio_url: audioUrl!,
          pdf_url: pdfUrl!,
        })

      if (dbError) throw dbError
    }
  } catch (error) {
    console.error('データベース保存エラー:', error)
    throw new Error('プロジェクト情報の保存に失敗しました')
  }

  // 成功したら編集画面へリダイレクト
  redirect(`/${projectId}/edit`)
}
