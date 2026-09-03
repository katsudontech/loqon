import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

let adminClient: SupabaseClient<Database> | undefined

/**
 * The service role is only used behind tightly validated Server Actions. Keep
 * client creation lazy so build and static analysis do not require secrets.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (adminClient) return adminClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabaseのサーバー設定がありません')
  }

  adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return adminClient
}
