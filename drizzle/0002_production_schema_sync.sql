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

-- 7. AI Matching Engine, Needs, Donations, Sponsorships & Operational Ledger Tables
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_permission ON public.role_permissions USING btree (role_id, permission_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id uuid REFERENCES public.users(id),
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  ip_hash text,
  details_json jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.media_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES public.users(id),
  beneficiary_id uuid REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  doc_category text NOT NULL,
  storage_bucket text DEFAULT 'hc-private-vault-ke' NOT NULL,
  object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  checksum_sha256 text NOT NULL,
  access_scope text DEFAULT 'PRIVATE_ENCRYPTED' NOT NULL,
  encryption_key_ref text NOT NULL,
  review_status text DEFAULT 'PENDING_REVIEW' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.needs_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  default_priority_weight integer DEFAULT 10 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.need_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_code text NOT NULL UNIQUE,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.needs_categories(id),
  title text NOT NULL,
  description text NOT NULL,
  supporting_evidence_notes text,
  supporting_media_id uuid REFERENCES public.media_records(id),
  target_amount_minor integer NOT NULL,
  approved_amount_minor integer,
  fulfilled_amount_minor integer DEFAULT 0 NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  deadline_at timestamptz,
  is_recurring boolean DEFAULT false NOT NULL,
  frequency text DEFAULT 'ONE_TIME' NOT NULL,
  duration_months integer DEFAULT 1 NOT NULL,
  priority_tier text DEFAULT 'P3_HIGH' NOT NULL,
  urgency_level text DEFAULT 'HIGH' NOT NULL,
  verification_status text DEFAULT 'PENDING_REVIEW' NOT NULL,
  status text DEFAULT 'SUBMITTED' NOT NULL,
  human_approved_by uuid REFERENCES public.users(id),
  human_approved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.priority_assessments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  need_request_id uuid NOT NULL REFERENCES public.need_requests(id) ON DELETE CASCADE,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  assessed_by uuid NOT NULL REFERENCES public.users(id),
  vulnerability_score integer NOT NULL,
  urgency_score integer NOT NULL,
  dependency_score integer NOT NULL,
  safeguarding_risk_score integer DEFAULT 10 NOT NULL,
  empowerment_potential_score integer DEFAULT 5 NOT NULL,
  composite_priority integer NOT NULL,
  ai_advisory_tier text,
  human_final_tier text NOT NULL,
  assessment_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
  rationale text NOT NULL,
  human_approved boolean DEFAULT false NOT NULL,
  assessed_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.household_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  member_alias text NOT NULL,
  full_name_enc text NOT NULL,
  relationship text NOT NULL,
  age_years integer NOT NULL,
  is_minor boolean DEFAULT false NOT NULL,
  schooling_status text,
  health_notes_enc text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.beneficiary_stories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL,
  narrative text NOT NULL,
  language text DEFAULT 'en' NOT NULL,
  cover_image_path text,
  consent_verified boolean DEFAULT false NOT NULL,
  is_published boolean DEFAULT false NOT NULL,
  approved_by uuid REFERENCES public.users(id),
  published_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.matching_engine_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key text DEFAULT 'DEFAULT' NOT NULL UNIQUE,
  algorithm_name text DEFAULT 'Humanity Connect Dynamic Impact Matcher' NOT NULL,
  weight_need_alignment integer DEFAULT 30 NOT NULL,
  weight_location_focus integer DEFAULT 20 NOT NULL,
  weight_budget_fit integer DEFAULT 20 NOT NULL,
  weight_urgency_impact integer DEFAULT 20 NOT NULL,
  weight_age_demographics integer DEFAULT 10 NOT NULL,
  prioritise_underfunded_pct integer DEFAULT 60 NOT NULL,
  min_threshold_score integer DEFAULT 35 NOT NULL,
  enable_gemini_analysis boolean DEFAULT true NOT NULL,
  require_human_safeguard_gate boolean DEFAULT true NOT NULL,
  transparency_notes text DEFAULT 'Scores combine deterministic weighted criteria (Need, Location, Budget, Urgency/Underfunded Gap, Age/Challenges) with bounded Gemini AI contextual analysis. Only V4-verified, safeguarding-cleared cases are eligible.' NOT NULL,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz DEFAULT now() NOT NULL
);

INSERT INTO public.matching_engine_config (config_key)
VALUES ('DEFAULT')
ON CONFLICT (config_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sponsor_matching_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_id uuid NOT NULL UNIQUE REFERENCES public.supporter_profiles(id) ON DELETE CASCADE,
  sponsor_entity_type text DEFAULT 'INDIVIDUAL' NOT NULL,
  budget_minor integer DEFAULT 600000 NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  preferred_cadence text DEFAULT 'MONTHLY' NOT NULL,
  interest_categories jsonb DEFAULT '["EDUCATION","FOOD","MEDICAL"]'::jsonb NOT NULL,
  location_focus jsonb DEFAULT '["ALL"]'::jsonb NOT NULL,
  preferred_age_groups jsonb DEFAULT '["ALL"]'::jsonb NOT NULL,
  preferred_classifications jsonb DEFAULT '["ORPHAN_GUARDIAN","DESTITUTE","NEEDY"]'::jsonb NOT NULL,
  impact_goal text DEFAULT 'Prioritise high-urgency household stability, schooling continuity, and sustainable livelihoods.' NOT NULL,
  proactive_opt_in boolean DEFAULT true NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sponsorship_match_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_id uuid NOT NULL REFERENCES public.supporter_profiles(id) ON DELETE CASCADE,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  need_request_id uuid REFERENCES public.need_requests(id),
  composite_score integer NOT NULL,
  breakdown_json jsonb NOT NULL,
  beneficiary_signals_json jsonb NOT NULL,
  gemini_rationale text,
  gemini_impact_projection text,
  recommended_approach text,
  used_model text,
  status text DEFAULT 'SUGGESTED' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_match_suggestions_supporter ON public.sponsorship_match_suggestions USING btree (supporter_id, composite_score);

CREATE TABLE IF NOT EXISTS public.humanitarian_funds (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  fund_type text NOT NULL,
  organisation_id uuid REFERENCES public.organisations(id),
  country_code text DEFAULT 'KE' NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  available_balance_minor integer DEFAULT 0 NOT NULL,
  total_received_minor integer DEFAULT 0 NOT NULL,
  total_disbursed_minor integer DEFAULT 0 NOT NULL,
  description text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.donations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_id uuid NOT NULL REFERENCES public.supporter_profiles(id),
  pathway text NOT NULL,
  beneficiary_id uuid REFERENCES public.beneficiary_profiles(id),
  need_request_id uuid REFERENCES public.need_requests(id),
  fund_id uuid REFERENCES public.humanitarian_funds(id),
  is_pledge boolean DEFAULT false NOT NULL,
  sponsorship_coverage text DEFAULT 'PARTIAL' NOT NULL,
  is_gift_donation boolean DEFAULT false NOT NULL,
  gift_honoree_name text,
  gift_message text,
  amount_minor integer NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  status text DEFAULT 'PLEDGED' NOT NULL,
  originated_from_ai_match boolean DEFAULT false NOT NULL,
  match_suggestion_id uuid REFERENCES public.sponsorship_match_suggestions(id) ON DELETE SET NULL,
  notes text,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  donation_id uuid NOT NULL REFERENCES public.donations(id),
  provider text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  checkout_request_id text UNIQUE,
  mpesa_receipt_number text UNIQUE,
  phone_e164 text,
  amount_minor integer NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  verification_status text DEFAULT 'INITIATED' NOT NULL,
  raw_callback_hash text,
  failure_reason text,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.fund_allocations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id uuid NOT NULL REFERENCES public.humanitarian_funds(id),
  need_request_id uuid REFERENCES public.need_requests(id),
  beneficiary_id uuid REFERENCES public.beneficiary_profiles(id),
  project_title text NOT NULL,
  allocated_amount_minor integer NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  approved_by uuid NOT NULL REFERENCES public.users(id),
  status text DEFAULT 'APPROVED' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.disbursements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pathway text NOT NULL,
  fund_allocation_id uuid REFERENCES public.fund_allocations(id),
  sponsorship_id uuid,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id),
  amount_minor integer NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  channel text NOT NULL,
  external_reference text,
  approved_by uuid NOT NULL REFERENCES public.users(id),
  status text DEFAULT 'SCHEDULED' NOT NULL,
  disbursed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sponsorships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_id uuid NOT NULL REFERENCES public.supporter_profiles(id),
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id),
  need_request_id uuid REFERENCES public.need_requests(id),
  monthly_amount_minor integer NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  status text DEFAULT 'PENDING_FIRST_PAYMENT' NOT NULL,
  originated_from_ai_match boolean DEFAULT false NOT NULL,
  match_suggestion_id uuid REFERENCES public.sponsorship_match_suggestions(id) ON DELETE SET NULL,
  started_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.recurring_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_reference text NOT NULL UNIQUE,
  supporter_id uuid NOT NULL REFERENCES public.supporter_profiles(id),
  pathway text NOT NULL,
  sponsorship_id uuid REFERENCES public.sponsorships(id),
  fund_id uuid REFERENCES public.humanitarian_funds(id),
  amount_minor integer NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  cadence text DEFAULT 'MONTHLY' NOT NULL,
  custom_interval_days integer,
  payment_method text DEFAULT 'MPESA_DARAJA' NOT NULL,
  supporter_consent_granted boolean DEFAULT true NOT NULL,
  supporter_consent_at timestamptz DEFAULT now() NOT NULL,
  payment_authorised boolean DEFAULT false NOT NULL,
  start_date timestamptz DEFAULT now() NOT NULL,
  end_date timestamptz,
  next_charge_at timestamptz NOT NULL,
  last_run_at timestamptz,
  failed_attempts integer DEFAULT 0 NOT NULL,
  last_failure_reason text,
  renewal_mode text DEFAULT 'MANUAL_CONFIRM' NOT NULL,
  beneficiary_reassessment_due_at timestamptz,
  status text DEFAULT 'ACTIVE' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.safeguarding_incidents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid REFERENCES public.beneficiary_profiles(id),
  reported_by_user_id uuid NOT NULL REFERENCES public.users(id),
  assigned_admin_id uuid REFERENCES public.users(id),
  severity text DEFAULT 'HIGH' NOT NULL,
  category text NOT NULL,
  summary_enc text NOT NULL,
  status text DEFAULT 'OPEN' NOT NULL,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id uuid NOT NULL REFERENCES public.humanitarian_funds(id),
  title text NOT NULL,
  county text NOT NULL,
  country_code text DEFAULT 'KE' NOT NULL,
  summary text NOT NULL,
  cover_image_path text,
  target_amount_minor integer NOT NULL,
  raised_amount_minor integer DEFAULT 0 NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  beneficiaries_impacted integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'ACTIVE' NOT NULL,
  lead_officer_id uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.volunteer_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id),
  assignment_type text NOT NULL,
  county text NOT NULL,
  project_id uuid REFERENCES public.community_projects(id),
  beneficiary_id uuid REFERENCES public.beneficiary_profiles(id),
  skills_summary text NOT NULL,
  scheduled_date text NOT NULL,
  status text DEFAULT 'ASSIGNED' NOT NULL,
  field_report_notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.empowerment_milestones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  pathway_name text NOT NULL,
  module_title text NOT NULL,
  completion_pct integer DEFAULT 0 NOT NULL,
  micro_grant_status text DEFAULT 'ELIGIBLE_IN_TRAINING' NOT NULL,
  mentor_user_id uuid REFERENCES public.users(id),
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.saved_beneficiaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_id uuid NOT NULL REFERENCES public.supporter_profiles(id) ON DELETE CASCADE,
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiary_profiles(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_supporter_beneficiary ON public.saved_beneficiaries USING btree (supporter_id, beneficiary_id);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_group_id uuid NOT NULL,
  pathway text NOT NULL,
  account_code text NOT NULL,
  account_name text NOT NULL,
  debit_minor integer DEFAULT 0 NOT NULL,
  credit_minor integer DEFAULT 0 NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.financial_approvals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type text NOT NULL,
  pathway text NOT NULL,
  target_entity_id uuid NOT NULL,
  amount_minor integer NOT NULL,
  currency text DEFAULT 'KES' NOT NULL,
  maker_user_id uuid NOT NULL REFERENCES public.users(id),
  checker_user_id uuid REFERENCES public.users(id),
  reason text NOT NULL,
  status text DEFAULT 'PENDING_CHECKER' NOT NULL,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.talksasa_sms_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_ref text NOT NULL UNIQUE,
  idempotency_key text UNIQUE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  template_code text DEFAULT 'GENERAL' NOT NULL,
  sender_id text DEFAULT 'HUMANITY' NOT NULL,
  recipient_msisdn text NOT NULL,
  recipient_masked text NOT NULL,
  message_preview text NOT NULL,
  message_length integer DEFAULT 0 NOT NULL,
  sms_units integer DEFAULT 1 NOT NULL,
  provider_uid text,
  delivery_status text DEFAULT 'QUEUED' NOT NULL,
  http_status integer,
  attempt_count integer DEFAULT 1 NOT NULL,
  error_reason text,
  provider_response_json jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.talksasa_webhook_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sms_log_id uuid REFERENCES public.talksasa_sms_logs(id) ON DELETE SET NULL,
  provider_uid text,
  event_type text DEFAULT 'DLR' NOT NULL,
  delivery_status text NOT NULL,
  signature_verified boolean DEFAULT false NOT NULL,
  payload_json jsonb NOT NULL,
  received_at timestamptz DEFAULT now() NOT NULL
);

COMMIT;
