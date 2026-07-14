'use client'

import { useFormStatus } from 'react-dom'

type Props = {
    idleText?: string;
    pendingText?: string;
}

export function SubmitButton({ idleText = 'プロジェクトを作成する', pendingText = 'アップロード中...' }: Props) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? (
        <>
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {pendingText}
        </>
      ) : (
        idleText
      )}
    </button>
  )
}
