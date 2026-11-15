-- Supabase Migration 001: M Bee Enterprises Initial Schema
-- Proprietors: Baljinder Singh & Manpreet Singh | Mahilpur, Punjab 146105

CREATE TABLE IF NOT EXISTS public.mbee_profiles (
  uid TEXT PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT DEFAULT '',
  city TEXT DEFAULT 'Mahilpur, Punjab',
  occupation TEXT DEFAULT 'Citizen / Family',
  auth_provider TEXT DEFAULT 'mobile',
  submitted_documents JSONB DEFAULT '[]'::jsonb,
  work_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mbee_enquiries (
  id TEXT PRIMARY KEY,
  reference_code TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_mobile TEXT NOT NULL,
  user_city TEXT DEFAULT 'Mahilpur, Punjab',
  user_email TEXT DEFAULT '',
  member_id TEXT DEFAULT '',
  service_name TEXT NOT NULL,
  work_description TEXT NOT NULL,
  preferred_contact TEXT DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Processing', 'Completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mbee_submitted_documents (
  id TEXT PRIMARY KEY,
  uid TEXT REFERENCES public.mbee_profiles(uid) ON DELETE CASCADE,
  reference_no TEXT NOT NULL,
  document_name TEXT NOT NULL,
  service_category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Processing', 'Completed')),
  remarks TEXT DEFAULT '',
  submitted_at TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
