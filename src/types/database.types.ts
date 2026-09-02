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
      get_public_project: {
        Args: {
          p_project_id: string
        }
        Returns: {
          id: string
          title: string | null
          audio_url: string
          pdf_url: string
          created_at: string
        }[]
      }
      get_public_timeline_markers: {
        Args: {
          p_project_id: string
        }
        Returns: Database['public']['Tables']['timeline_markers']['Row'][]
      }
      replace_timeline_markers: {
        Args: {
          p_markers: Json
          p_project_id: string
        }
        Returns: undefined
      }
      update_project_by_id: {
        Args: {
          p_project_id: string
          p_title: string
          p_audio_url: string | null
          p_pdf_url: string | null
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
