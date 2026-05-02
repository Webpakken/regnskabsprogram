export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CompanyRole = 'owner' | 'manager' | 'bookkeeper' | 'accountant'

export type IncomeKind =
  | 'kommunalt_tilskud'
  | 'fondsbevilling'
  | 'medlemskontingent'
  | 'donation'
  | 'event'
  | 'andet'

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
      mfa_trusted_devices: {
        Row: {
          id: string
          user_id: string
          device_id: string
          user_agent: string | null
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_id: string
          user_agent?: string | null
          expires_at: string
        }
        Update: {
          expires_at?: string
        }
      }
      companies: {
        Row: {
          id: string
          name: string
          cvr: string | null
          entity_type: 'virksomhed' | 'forening'
          base_currency: string
          invoice_attach_pdf_to_email: boolean
          street_address: string | null
          postal_code: string | null
          city: string | null
          invoice_email: string | null
          invoice_phone: string | null
          invoice_website: string | null
          bank_reg_number: string | null
          bank_account_number: string | null
          iban: string | null
          invoice_footer_note: string | null
          invoice_logo_path: string | null
          invoice_starting_number: number
          invoice_number_digit_width: number
          automation_reminders_enabled: boolean
          automation_reminder_first_days_after_due: number
          automation_reminder_interval_days: number
          vat_registered: boolean
          vat_period: 'monthly' | 'quarterly' | 'half_yearly'
          vat_period_started_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          cvr?: string | null
          entity_type?: 'virksomhed' | 'forening'
          base_currency?: string
          invoice_attach_pdf_to_email?: boolean
          street_address?: string | null
          postal_code?: string | null
          city?: string | null
          invoice_email?: string | null
          invoice_phone?: string | null
          invoice_website?: string | null
          bank_reg_number?: string | null
          bank_account_number?: string | null
          iban?: string | null
          invoice_footer_note?: string | null
          invoice_logo_path?: string | null
          invoice_starting_number?: number
          invoice_number_digit_width?: number
          automation_reminders_enabled?: boolean
          automation_reminder_first_days_after_due?: number
          automation_reminder_interval_days?: number
          vat_registered?: boolean
          vat_period?: 'monthly' | 'quarterly' | 'half_yearly'
          vat_period_started_at?: string | null
        }
        Update: {
          name?: string
          cvr?: string | null
          entity_type?: 'virksomhed' | 'forening'
          base_currency?: string
          invoice_attach_pdf_to_email?: boolean
          street_address?: string | null
          postal_code?: string | null
          city?: string | null
          invoice_email?: string | null
          invoice_phone?: string | null
          invoice_website?: string | null
          bank_reg_number?: string | null
          bank_account_number?: string | null
          iban?: string | null
          invoice_footer_note?: string | null
          invoice_logo_path?: string | null
          invoice_starting_number?: number
          invoice_number_digit_width?: number
          automation_reminders_enabled?: boolean
          automation_reminder_first_days_after_due?: number
          automation_reminder_interval_days?: number
          vat_registered?: boolean
          vat_period?: 'monthly' | 'quarterly' | 'half_yearly'
          vat_period_started_at?: string | null
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
          stripe_price_id: string | null
          billing_plan_id: string | null
          status: string
          current_period_end: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          billing_plan_id?: string | null
          status?: string
          current_period_end?: string | null
        }
        Update: {
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          billing_plan_id?: string | null
          status?: string
          current_period_end?: string | null
        }
      }
      billing_plans: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          stripe_price_id: string | null
          monthly_price_cents: number
          compare_price_cents: number | null
          active: boolean
          marketing_hidden: boolean
          marketing_badge_text: string | null
          marketing_lock_label: string | null
          is_default_free: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          stripe_price_id?: string | null
          monthly_price_cents?: number
          compare_price_cents?: number | null
          active?: boolean
          marketing_hidden?: boolean
          marketing_badge_text?: string | null
          marketing_lock_label?: string | null
          is_default_free?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          description?: string | null
          stripe_price_id?: string | null
          monthly_price_cents?: number
          compare_price_cents?: number | null
          active?: boolean
          marketing_hidden?: boolean
          marketing_badge_text?: string | null
          marketing_lock_label?: string | null
          is_default_free?: boolean
          sort_order?: number
          updated_at?: string
        }
      }
      billing_plan_bullets: {
        Row: {
          id: string
          plan_id: string
          kind: 'feature' | 'text' | 'heading'
          feature_id: string | null
          title: string
          subtitle: string | null
          marketing_hidden: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          kind: 'feature' | 'text' | 'heading'
          feature_id?: string | null
          title: string
          subtitle?: string | null
          marketing_hidden?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          plan_id?: string
          kind?: 'feature' | 'text' | 'heading'
          feature_id?: string | null
          title?: string
          subtitle?: string | null
          marketing_hidden?: boolean
          sort_order?: number
          updated_at?: string
        }
      }
      billing_features: {
        Row: {
          id: string
          key: string
          name: string
          description: string | null
          active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description?: string | null
          active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          key?: string
          name?: string
          description?: string | null
          active?: boolean
          sort_order?: number
          updated_at?: string
        }
      }
      billing_plan_features: {
        Row: {
          plan_id: string
          feature_id: string
          enabled: boolean
          limit_value: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          plan_id: string
          feature_id: string
          enabled?: boolean
          limit_value?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          limit_value?: number | null
          updated_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          company_id: string
          invoice_number: string
          customer_name: string
          customer_email: string | null
          customer_cvr: string | null
          customer_phone: string | null
          customer_address: string | null
          customer_zip: string | null
          customer_city: string | null
          issue_date: string
          due_date: string
          currency: string
          status: 'draft' | 'sent' | 'paid' | 'cancelled'
          net_cents: number
          vat_cents: number
          gross_cents: number
          notes: string | null
          sent_at: string | null
          /** Når sat: kreditnota for denne faktura */
          credited_invoice_id: string | null
          last_automation_reminder_at: string | null
          automation_reminder_send_count: number
          is_historical: boolean
          attachment_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          invoice_number: string
          customer_name: string
          customer_email?: string | null
          customer_cvr?: string | null
          customer_phone?: string | null
          customer_address?: string | null
          customer_zip?: string | null
          customer_city?: string | null
          issue_date?: string
          due_date: string
          currency?: string
          status?: 'draft' | 'sent' | 'paid' | 'cancelled'
          net_cents?: number
          vat_cents?: number
          gross_cents?: number
          notes?: string | null
          sent_at?: string | null
          credited_invoice_id?: string | null
          last_automation_reminder_at?: string | null
          is_historical?: boolean
          attachment_path?: string | null
          automation_reminder_send_count?: number
        }
        Update: {
          customer_name?: string
          customer_email?: string | null
          customer_cvr?: string | null
          customer_phone?: string | null
          customer_address?: string | null
          customer_zip?: string | null
          customer_city?: string | null
          issue_date?: string
          due_date?: string
          currency?: string
          status?: 'draft' | 'sent' | 'paid' | 'cancelled'
          net_cents?: number
          vat_cents?: number
          gross_cents?: number
          notes?: string | null
          sent_at?: string | null
          credited_invoice_id?: string | null
          last_automation_reminder_at?: string | null
          automation_reminder_send_count?: number
          is_historical?: boolean
          attachment_path?: string | null
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
      invoice_number_seq: {
        Row: {
          company_id: string
          last_value: number
        }
        Insert: {
          company_id: string
          last_value?: number
        }
        Update: {
          last_value?: number
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
          voucher_project_id: string | null
          file_hash: string | null
          possible_duplicate_of: string | null
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
          voucher_project_id?: string | null
          file_hash?: string | null
          possible_duplicate_of?: string | null
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
          voucher_project_id?: string | null
          possible_duplicate_of?: string | null
        }
      }
      expense_upload_links: {
        Row: {
          id: string
          company_id: string
          token_hash: string
          mode: 'single_use' | 'time_window'
          expires_at: string
          max_uploads: number | null
          used_count: number
          revoked_at: string | null
          note: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          token_hash: string
          mode: 'single_use' | 'time_window'
          expires_at: string
          max_uploads?: number | null
          used_count?: number
          revoked_at?: string | null
          note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          mode?: 'single_use' | 'time_window'
          expires_at?: string
          max_uploads?: number | null
          used_count?: number
          revoked_at?: string | null
          note?: string | null
          updated_at?: string
        }
      }
      voucher_reimbursements: {
        Row: {
          id: string
          voucher_id: string
          company_id: string
          upload_link_id: string | null
          requester_name: string
          phone: string | null
          bank_reg_number: string | null
          bank_account_number: string | null
          status: 'pending_approval' | 'ready_for_refund' | 'refunded' | 'rejected'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          voucher_id: string
          company_id: string
          upload_link_id?: string | null
          requester_name: string
          phone?: string | null
          bank_reg_number?: string | null
          bank_account_number?: string | null
          status?: 'pending_approval' | 'ready_for_refund' | 'refunded' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Update: {
          requester_name?: string
          phone?: string | null
          bank_reg_number?: string | null
          bank_account_number?: string | null
          status?: 'pending_approval' | 'ready_for_refund' | 'refunded' | 'rejected'
          updated_at?: string
        }
      }
      voucher_projects: {
        Row: {
          id: string
          company_id: string
          name: string
          description: string | null
          budget_cents: number | null
          active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          description?: string | null
          budget_cents?: number | null
          active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          budget_cents?: number | null
          active?: boolean
          updated_at?: string
        }
      }
      income_entries: {
        Row: {
          id: string
          company_id: string
          entry_date: string
          amount_cents: number
          kind: IncomeKind
          source_name: string
          earmarking: string | null
          voucher_project_id: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          entry_date?: string
          amount_cents: number
          kind: IncomeKind
          source_name: string
          earmarking?: string | null
          voucher_project_id?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          entry_date?: string
          amount_cents?: number
          kind?: IncomeKind
          source_name?: string
          earmarking?: string | null
          voucher_project_id?: string | null
          notes?: string | null
          updated_at?: string
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
      notification_preferences: {
        Row: {
          user_id: string
          support_replies: boolean
          member_invites: boolean
          invoice_sent: boolean
          invoice_reminders: boolean
          subscription_updates: boolean
          platform_new_companies: boolean
          platform_new_support: boolean
          platform_new_subscriptions: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          support_replies?: boolean
          member_invites?: boolean
          invoice_sent?: boolean
          invoice_reminders?: boolean
          subscription_updates?: boolean
          platform_new_companies?: boolean
          platform_new_support?: boolean
          platform_new_subscriptions?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          support_replies?: boolean
          member_invites?: boolean
          invoice_sent?: boolean
          invoice_reminders?: boolean
          subscription_updates?: boolean
          platform_new_companies?: boolean
          platform_new_support?: boolean
          platform_new_subscriptions?: boolean
          updated_at?: string
        }
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
      platform_staff: {
        Row: {
          user_id: string
          role: 'superadmin' | 'support_admin'
          created_at: string
        }
        Insert: {
          user_id: string
          role: 'superadmin' | 'support_admin'
        }
        Update: { role?: 'superadmin' | 'support_admin' }
      }
      support_impersonation: {
        Row: {
          user_id: string
          company_id: string
          previous_company_id: string | null
          expires_at: string
        }
        Insert: {
          user_id: string
          company_id: string
          previous_company_id?: string | null
          expires_at: string
        }
        Update: {
          company_id?: string
          previous_company_id?: string | null
          expires_at?: string
        }
      }
      platform_public_settings: {
        Row: {
          id: number
          contact_email: string | null
          contact_phone: string | null
          address_line: string | null
          postal_code: string | null
          city: string | null
          org_cvr: string | null
          support_hours: string | null
          terms_url: string | null
          privacy_url: string | null
          monthly_price_cents: number | null
          pricing_title: string | null
          pricing_subtitle: string | null
          pricing_badge: string | null
          pricing_plan_name: string | null
          pricing_compare_cents: number | null
          pricing_amount_cents: number | null
          pricing_pitch: string | null
          pricing_features: string | null
          pricing_cta_label: string | null
          pricing_corner_badge: string | null
          pricing_unit_label: string | null
          pricing_lock_label: string | null
          pricing_footer_left: string | null
          pricing_footer_right: string | null
          pricing_feature_items: Json | null
          email_templates: Json | null
          landing_seo: Json | null
          updated_at: string
        }
        Insert: {
          id?: number
          contact_email?: string | null
          contact_phone?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          org_cvr?: string | null
          support_hours?: string | null
          terms_url?: string | null
          privacy_url?: string | null
          monthly_price_cents?: number | null
          pricing_title?: string | null
          pricing_subtitle?: string | null
          pricing_badge?: string | null
          pricing_plan_name?: string | null
          pricing_compare_cents?: number | null
          pricing_amount_cents?: number | null
          pricing_pitch?: string | null
          pricing_features?: string | null
          pricing_cta_label?: string | null
          pricing_corner_badge?: string | null
          pricing_unit_label?: string | null
          pricing_lock_label?: string | null
          pricing_footer_left?: string | null
          pricing_footer_right?: string | null
          pricing_feature_items?: Json | null
          email_templates?: Json | null
          landing_seo?: Json | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          org_cvr?: string | null
          support_hours?: string | null
          terms_url?: string | null
          privacy_url?: string | null
          monthly_price_cents?: number | null
          pricing_title?: string | null
          pricing_subtitle?: string | null
          pricing_badge?: string | null
          pricing_plan_name?: string | null
          pricing_compare_cents?: number | null
          pricing_amount_cents?: number | null
          pricing_pitch?: string | null
          pricing_features?: string | null
          pricing_cta_label?: string | null
          pricing_corner_badge?: string | null
          pricing_unit_label?: string | null
          pricing_lock_label?: string | null
          pricing_footer_left?: string | null
          pricing_footer_right?: string | null
          pricing_feature_items?: Json | null
          email_templates?: Json | null
          landing_seo?: Json | null
        }
      }
      platform_smtp_profiles: {
        Row: {
          id: string
          label: string
          host: string | null
          port: number | null
          user_name: string | null
          from_email: string | null
          from_name: string | null
          smtp_password: string | null
          updated_at: string
        }
        Insert: {
          id: string
          label: string
          host?: string | null
          port?: number | null
          user_name?: string | null
          from_email?: string | null
          from_name?: string | null
          smtp_password?: string | null
        }
        Update: {
          label?: string
          host?: string | null
          port?: number | null
          user_name?: string | null
          from_email?: string | null
          from_name?: string | null
          smtp_password?: string | null
        }
      }
      support_tickets: {
        Row: {
          id: string
          company_id: string
          ticket_number: number
          status: 'open' | 'closed' | 'waiting_customer'
          consent_deep_access: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          status?: 'open' | 'closed' | 'waiting_customer'
          consent_deep_access?: boolean
        }
        Update: {
          status?: 'open' | 'closed' | 'waiting_customer'
          consent_deep_access?: boolean
        }
      }
      support_messages: {
        Row: {
          id: string
          ticket_id: string
          user_id: string | null
          body: string
          is_staff: boolean
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          user_id?: string | null
          body: string
          is_staff?: boolean
        }
        Update: never
      }
      support_ticket_reads: {
        Row: {
          user_id: string
          company_id: string
          last_read_at: string
        }
        Insert: {
          user_id: string
          company_id: string
          last_read_at?: string
        }
        Update: {
          last_read_at?: string
        }
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          subscription: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          subscription: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          subscription?: Json
          updated_at?: string
        }
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
      begin_platform_impersonation: { Args: { p_company_id: string }; Returns: undefined }
      end_platform_impersonation: { Args: Record<string, never>; Returns: undefined }
      add_support_admin_by_email: { Args: { p_email: string }; Returns: undefined }
      list_platform_staff_with_emails: {
        Args: Record<string, never>
        Returns: {
          user_id: string
          role: string
          created_at: string
          email: string
        }[]
      }
      get_my_platform_role: { Args: Record<string, never>; Returns: string | null }
      ensure_platform_smtp_profiles: { Args: Record<string, never>; Returns: undefined }
      create_company_with_owner: {
        Args: {
          p_name: string
          p_cvr?: string | null
          p_entity_type?: 'virksomhed' | 'forening'
        }
        Returns: string
      }
      support_unread_staff_count: { Args: { p_company_id: string }; Returns: number }
      support_mark_ticket_read: { Args: { p_company_id: string }; Returns: undefined }
    }
  }
}
