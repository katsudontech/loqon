import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database.types'

// .env.local に書いたURLとキーを読み込みます。
// Keep these direct references so Next.js can inline NEXT_PUBLIC_* values in the browser bundle.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    const missingVariables = [
        !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
        !supabaseAnonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ].filter((variable): variable is string => Boolean(variable))

    throw new Error(
        `Missing required public Supabase environment variable(s): ${missingVariables.join(', ')}. ` +
        'Copy .env.example to .env.local and set both values before starting the app.',
    )
}

// アプリ内で使い回すSupabaseクライアント（通信役）を作成！
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
