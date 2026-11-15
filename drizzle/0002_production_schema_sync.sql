-- HUMANITY CONNECT — Backward-Compatible Production Schema Synchronization Migration
-- Safe to run on any existing production PostgreSQL database (does NOT drop tables or delete records).
-- Usage: psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f drizzle/0002_production_schema_sync.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Core Identity & Account Columns
CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firebase_uid text UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone_e164 text UNIQUE,
  password_hash text,
  country_code text DEFAULT 'KE' NOT NULL,
  county text,
  sub_county text,
  preferred_language text DEFAULT 'en' NOT NULL,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  mfa_enabled boolean DEFAULT false NOT NULL,
  mfa_secret_enc text,
  approval_status text DEFAULT 'ACTIVE' NOT NULL,
  suspension_reason text,
  failed_login_attempts integer DEFAULT 0 NOT NULL,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS county text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sub_county text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0 NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_enabled boolean DEFAULT false NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_secret_enc text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspension_reason text;

-- 2. Roles, Assignments & Direct Permission Flags
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  is_beneficiary_role boolean DEFAULT false NOT NULL,
  is_privileged boolean DEFAULT false NOT NULL,
  requires_mfa boolean DEFAULT false NOT NULL,
  self_assignable boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.users(id),
  status text DEFAULT 'ACTIVE' NOT NULL,
  assigned_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_role ON public.user_roles USING btree (user_id, role_id);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_code text NOT NULL,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permission_flag ON public.user_permissions USING btree (user_id, permission_code);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_permissions USING btree (user_id);

-- 3. Sessions & OTP Verification Tokens
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_label text NOT NULL,
  user_agent text,
  ip_hash text,
  active_role_code text NOT NULL,
  mfa_verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions USING btree (user_id, expires_at);

CREATE TABLE IF NOT EXISTS public.verification_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  target text NOT NULL,
  code_hash text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 4. Registration Profile, Guardian, Organisation, Consent & Verification Queue Tables
CREATE TABLE IF NOT EXISTS public.beneficiary_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  reference_code text NOT NULL UNIQUE,
  classification text NOT NULL,
  display_alias text NOT NULL,
  country_code text DEFAULT 'KE' NOT NULL,
  county text NOT NULL,
  sub_county text,
  ward text,
  landmark_hint_enc text,
  guardian_org_name text,
  is_minor_case boolean DEFAULT false NOT NULL,
  vulnerability_summary text NOT NULL,
  national_id_hash text,
  verification_level text DEFAULT 'V0' NOT NULL,
  verification_status text DEFAULT 'INTAKE_SUBMITTED' NOT NULL,
  safeguarding_cleared boolean DEFAULT false NOT NULL,
  public_listing_approved boolean DEFAULT false NOT NULL,
  assigned_officer_id uuid REFERENCES public.users(id),
  monthly_need_target_minor integer DEFAULT 650000 NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  age_group text DEFAULT 'MULTI_GENERATIONAL' NOT NULL,
  specific_challenges jsonb DEFAULT '[]'::jsonb NOT NULL,
  photo_limit_override_reason text,
  audio_narration_object_key text,
  audio_transcript text,
  audio_language text DEFAULT 'sw',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.verification_cases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number text NOT NULL UNIQUE,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  assigned_officer_id uuid REFERENCES public.users(id),
  officer_workspace text DEFAULT 'VERIFICATION_OFFICER' NOT NULL,
  verification_level text DEFAULT 'V0' NOT NULL,
  stage text DEFAULT 'DOCUMENT_REVIEW' NOT NULL,
  field_county text NOT NULL,
  identity_verified boolean DEFAULT false NOT NULL,
  guardian_verified boolean DEFAULT false NOT NULL,
  household_verified boolean DEFAULT false NOT NULL,
  need_verified boolean DEFAULT false NOT NULL,
  document_checklist_ok boolean DEFAULT false NOT NULL,
  field_visit_verified boolean DEFAULT false NOT NULL,
  field_visit_date timestamptz,
  field_visit_notes text,
  institutional_confirmation_ref text,
  safeguarding_cleared boolean DEFAULT false NOT NULL,
  duplicate_alert_flag boolean DEFAULT false NOT NULL,
  duplicate_alert_details text,
  case_deadline_at timestamptz,
  follow_up_reminder_at timestamptz,
  appeal_status text DEFAULT 'NONE' NOT NULL,
  appeal_reason text,
  decision_notes text,
  decided_by uuid REFERENCES public.users(id),
  decided_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verif_cases_stage ON public.verification_cases USING btree (stage, verification_level);

CREATE TABLE IF NOT EXISTS public.verification_case_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.verification_cases(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES public.users(id),
  actor_workspace text NOT NULL,
  event_type text NOT NULL,
  previous_level text,
  new_level text,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_events_case ON public.verification_case_events USING btree (case_id, created_at);

CREATE TABLE IF NOT EXISTS public.guardian_relationships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  guardian_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  legal_doc_verified boolean DEFAULT false NOT NULL,
  consent_authority boolean DEFAULT true NOT NULL,
  verified_by uuid REFERENCES public.users(id),
  verified_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  granted_by_user_id uuid NOT NULL REFERENCES public.users(id),
  consent_scope text NOT NULL,
  granted boolean DEFAULT false NOT NULL,
  policy_version text DEFAULT 'KE-DPA-2026.1' NOT NULL,
  granted_at timestamptz DEFAULT now() NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.organisations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  org_type text NOT NULL,
  registration_number text,
  country_code text DEFAULT 'KE' NOT NULL,
  county text DEFAULT 'Nairobi' NOT NULL,
  contact_email text NOT NULL,
  verification_status text DEFAULT 'PENDING' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.supporter_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES public.organisations(id),
  supporter_type text DEFAULT 'SUPPORTIVE' NOT NULL,
  display_name text NOT NULL,
  preferred_currency text DEFAULT 'KES' NOT NULL,
  anonymous_giving boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel text DEFAULT 'IN_APP' NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 5. Governance, Retention, Field Drafts & Staff Establishment Directory Tables
CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_key text NOT NULL UNIQUE,
  data_class text NOT NULL,
  retention_years integer NOT NULL,
  minimum_retention_years integer DEFAULT 0 NOT NULL,
  storage_tier text NOT NULL,
  disposal_method text NOT NULL,
  restrict_cross_browser_cache boolean DEFAULT true NOT NULL,
  statutory_lock boolean DEFAULT false NOT NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  category text DEFAULT 'DATA_RETENTION' NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  value_json jsonb NOT NULL,
  is_restricted boolean DEFAULT true NOT NULL,
  enforce_no_browser_storage boolean DEFAULT true NOT NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_settings_cat ON public.platform_settings USING btree (category);

CREATE TABLE IF NOT EXISTS public.field_draft_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  captured_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.verification_cases(id) ON DELETE SET NULL,
  record_type text DEFAULT 'FIELD_VISIT' NOT NULL,
  county text DEFAULT 'Nairobi' NOT NULL,
  payload_enc text NOT NULL,
  sync_status text DEFAULT 'PENDING' NOT NULL,
  captured_at timestamptz DEFAULT now() NOT NULL,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_field_drafts_user_status ON public.field_draft_records USING btree (captured_by_user_id, sync_status);

CREATE TABLE IF NOT EXISTS public.staff_departments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  department_number integer NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  planned_count integer DEFAULT 0 NOT NULL,
  head_job_id text,
  workspace_focus text DEFAULT '' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_departments_num ON public.staff_departments USING btree (department_number, code);

-- 6. Seed All Five Self-Assignable Account Categories Without Overwriting Existing Roles
INSERT INTO public.roles (code, name, description, is_beneficiary_role, is_privileged, requires_mfa, self_assignable)
VALUES
  ('ORPHAN_GUARDIAN', 'Orphan / Guardian', 'Guardian or organisation representing an orphaned child or child-headed household.', true, false, false, true),
  ('DESTITUTE', 'Destitute', 'Individual or household facing acute displacement or severe deprivation.', true, false, false, true),
  ('NEEDY', 'Needy', 'Vulnerable household seeking medical, rent, education, or livelihood empowerment support.', true, false, false, true),
  ('SUPPORTIVE', 'Supportive', 'Individual sponsor, donor, or community volunteer supporting verified needs.', false, false, false, true),
  ('WELL_WISHER', 'Well Wisher', 'Philanthropist, corporate partner, foundation, or humanitarian institution.', false, false, false, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;
