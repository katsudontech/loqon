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
          timeline_version: number
          timeline_updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          title?: string | null
          audio_url: string
          pdf_url: string
          created_at?: string
          timeline_version?: number
          timeline_updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          title?: string | null
          audio_url?: string
          pdf_url?: string
          created_at?: string
          timeline_version?: number
          timeline_updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: 'timeline_markers_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_project_by_id: {
        Args: {
          p_project_id: string
          p_title: string
          p_audio_url: string
          p_pdf_url: string
        }
        Returns: undefined
      }
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
      get_public_timeline_snapshot: {
        Args: { p_project_id: string }
        Returns: Json
      }
      is_legacy_project_storage_url: {
        Args: {
          p_kind: string
          p_project_id: string
          p_url: string
        }
        Returns: boolean
      }
      is_project_storage_url: {
        Args: {
          p_kind: string
          p_project_id: string
          p_url: string
        }
        Returns: boolean
      }
      replace_timeline_markers: {
        Args: {
          p_markers: Json
          p_project_id: string
          p_expected_version: number
          p_duration: number
          p_force: boolean
        }
        Returns: number
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
