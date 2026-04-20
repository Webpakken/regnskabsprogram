export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CompanyRole = 'owner' | 'manager' | 'bookkeeper' | 'accountant'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          current_company_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          current_company_id?: string | null
        }
        Update: {
          full_name?: string | null
          current_company_id?: string | null
        }
      }
      companies: {
        Row: {
          id: string
          name: string
          cvr: string | null
          base_currency: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          cvr?: string | null
          base_currency?: string
        }
        Update: {
          name?: string
          cvr?: string | null
          base_currency?: string
        }
      }
      company_members: {
        Row: {
          id: string
          company_id: string
          user_id: string
          role: CompanyRole
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          role?: CompanyRole
        }
        Update: { role?: CompanyRole }
      }
      subscriptions: {
        Row: {
          id: string
          company_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          status: string
          current_period_end: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          current_period_end?: string | null
        }
        Update: {
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          current_period_end?: string | null
        }
      }
      invoices: {
        Row: {
          id: string
          company_id: string
          invoice_number: string
          customer_name: string
          customer_email: string | null
          issue_date: string
          due_date: string
          currency: string
          status: 'draft' | 'sent' | 'paid' | 'cancelled'
          net_cents: number
          vat_cents: number
          gross_cents: number
          notes: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          invoice_number: string
          customer_name: string
          customer_email?: string | null
          issue_date?: string
          due_date: string
          currency?: string
          status?: 'draft' | 'sent' | 'paid' | 'cancelled'
          net_cents?: number
          vat_cents?: number
          gross_cents?: number
          notes?: string | null
          sent_at?: string | null
        }
        Update: {
          customer_name?: string
          customer_email?: string | null
          issue_date?: string
          due_date?: string
          currency?: string
          status?: 'draft' | 'sent' | 'paid' | 'cancelled'
          net_cents?: number
          vat_cents?: number
          gross_cents?: number
          notes?: string | null
          sent_at?: string | null
        }
      }
      invoice_line_items: {
        Row: {
          id: string
          invoice_id: string
          description: string
          quantity: number
          unit_price_cents: number
          vat_rate: number
          line_net_cents: number
          line_vat_cents: number
          line_gross_cents: number
          sort_order: number
        }
        Insert: {
          id?: string
          invoice_id: string
          description: string
          quantity?: number
          unit_price_cents: number
          vat_rate?: number
          line_net_cents: number
          line_vat_cents: number
          line_gross_cents: number
          sort_order?: number
        }
        Update: {
          description?: string
          quantity?: number
          unit_price_cents?: number
          vat_rate?: number
          line_net_cents?: number
          line_vat_cents?: number
          line_gross_cents?: number
          sort_order?: number
        }
      }
      vouchers: {
        Row: {
          id: string
          company_id: string
          storage_path: string
          filename: string
          mime_type: string | null
          title: string | null
          category: string | null
          notes: string | null
          uploaded_by: string | null
          uploaded_at: string
          expense_date: string
          gross_cents: number
          vat_cents: number
          net_cents: number
          vat_rate: number
        }
        Insert: {
          id?: string
          company_id: string
          storage_path: string
          filename: string
          mime_type?: string | null
          title?: string | null
          category?: string | null
          notes?: string | null
          uploaded_by?: string | null
          expense_date?: string
          gross_cents?: number
          vat_cents?: number
          net_cents?: number
          vat_rate?: number
        }
        Update: {
          title?: string | null
          category?: string | null
          notes?: string | null
          expense_date?: string
          gross_cents?: number
          vat_cents?: number
          net_cents?: number
          vat_rate?: number
        }
      }
      bank_connections: {
        Row: {
          id: string
          company_id: string
          provider: string
          status: 'pending' | 'connected' | 'error' | 'disconnected'
          institution_name: string | null
          external_user_id: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          provider?: string
          status?: string
          institution_name?: string | null
          external_user_id?: string | null
          last_error?: string | null
        }
        Update: {
          status?: string
          institution_name?: string | null
          external_user_id?: string | null
          last_error?: string | null
        }
      }
      pending_invites: {
        Row: {
          id: string
          company_id: string
          email: string
          role: CompanyRole
          invited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          email: string
          role: CompanyRole
          invited_by?: string | null
        }
        Update: { role?: CompanyRole }
      }
      activity_events: {
        Row: {
          id: string
          company_id: string
          actor_id: string | null
          event_type: string
          title: string
          meta: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          actor_id?: string | null
          event_type: string
          title: string
          meta?: Json | null
        }
        Update: never
      }
    }
    Functions: {
      next_invoice_number: { Args: { p_company_id: string }; Returns: string }
      get_popular_invoice_products_globally: {
        Args: { p_limit?: number }
        Returns: {
          description: string
          unit_price_cents: number
          vat_rate: number
          usage_count: number
        }[]
      }
      get_popular_invoice_products_for_company: {
        Args: { p_company_id: string; p_limit?: number }
        Returns: {
          description: string
          unit_price_cents: number
          vat_rate: number
          usage_count: number
        }[]
      }
    }
  }
}
