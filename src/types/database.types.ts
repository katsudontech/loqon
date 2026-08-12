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
          name: string | null
        }
        Insert: {
          id?: string
          project_id: string
          page_number: number
          start_time: number
          end_time: number
          created_at?: string
          name?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          page_number?: number
          start_time?: number
          end_time?: number
          created_at?: string
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      replace_timeline_markers: {
        Args: {
          p_markers: Json
          p_project_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
