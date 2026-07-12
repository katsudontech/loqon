export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          user_id: string | null
          title: string | null
          audio_url: string
          pdf_url: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          title?: string | null
          audio_url: string
          pdf_url: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          title?: string | null
          audio_url?: string
          pdf_url?: string
          created_at?: string
        }
        Relationships: []
      }
      timeline_markers: {
        Row: {
          id: string
          project_id: string
          page_number: number
          start_time: number
          end_time: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          page_number: number
          start_time: number
          end_time: number
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          page_number?: number
          start_time?: number
          end_time?: number
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
