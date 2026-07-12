import { createClient } from '@supabase/supabase-js'

// .env.local に書いたURLとキーを読み込みます
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// アプリ内で使い回すSupabaseクライアント（通信役）を作成！
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
