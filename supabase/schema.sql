-- =============================================================================
-- M Bee Enterprises – Financial & Documentation Services in Punjab
-- Proprietors: Baljinder Singh & Manpreet Singh (ਬਲਜਿੰਦਰ ਸਿੰਘ ਅਤੇ ਮਨਪ੍ਰੀਤ ਸਿੰਘ)
-- Address: Bank of Baroda, near Bus Stand, near Mahilpur, Mahilpur, Punjab 146105
-- Official Phones: 82888-37597, 99156-28427 | Email: enterprisesmbee@gmail.com
-- Complete Supabase / PostgreSQL Database Schema & Seed SQL
-- =============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Customer Profiles Table (mbee_profiles)
CREATE TABLE IF NOT EXISTS public.mbee_profiles (
  uid TEXT PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT DEFAULT '',
  city TEXT DEFAULT 'Mahilpur, Punjab',
  occupation TEXT DEFAULT 'Citizen / Family',
  auth_provider TEXT DEFAULT 'mobile' CHECK (auth_provider IN ('mobile', 'google')),
  submitted_documents JSONB DEFAULT '[]'::jsonb,
  work_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mbee_profiles_mobile ON public.mbee_profiles (mobile);
CREATE INDEX IF NOT EXISTS idx_mbee_profiles_member_id ON public.mbee_profiles (member_id);

-- 2. Customer Enquiries & Submissions Table (mbee_enquiries)
CREATE TABLE IF NOT EXISTS public.mbee_enquiries (
  id TEXT PRIMARY KEY DEFAULT ('ENQ-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT),
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

CREATE INDEX IF NOT EXISTS idx_mbee_enquiries_status ON public.mbee_enquiries (status);
CREATE INDEX IF NOT EXISTS idx_mbee_enquiries_mobile ON public.mbee_enquiries (user_mobile);

-- 3. Submitted Documents Status Tracker Table (mbee_submitted_documents)
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

CREATE INDEX IF NOT EXISTS idx_mbee_submitted_docs_uid ON public.mbee_submitted_documents (uid);
CREATE INDEX IF NOT EXISTS idx_mbee_submitted_docs_status ON public.mbee_submitted_documents (status);

-- 4. Custom Services Added by Admin Table (mbee_custom_services)
CREATE TABLE IF NOT EXISTS public.mbee_custom_services (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL CHECK (category_id IN ('documentation', 'financial', 'property', 'digital')),
  icon_name TEXT NOT NULL DEFAULT 'FileCheck2',
  badge TEXT CHECK (badge IN ('popular', 'new')),
  title_en TEXT NOT NULL,
  title_pa TEXT NOT NULL,
  short_desc_en TEXT NOT NULL,
  short_desc_pa TEXT NOT NULL,
  preparation_list_en JSONB NOT NULL DEFAULT '[]'::jsonb,
  preparation_list_pa JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Website Announcements Banner Table (mbee_announcements)
CREATE TABLE IF NOT EXISTS public.mbee_announcements (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  announcement_text TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT 'Baljinder Singh & Manpreet Singh',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatic updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_mbee_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mbee_profiles_updated_at ON public.mbee_profiles;
CREATE TRIGGER trg_mbee_profiles_updated_at
BEFORE UPDATE ON public.mbee_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_mbee_timestamp();

DROP TRIGGER IF EXISTS trg_mbee_enquiries_updated_at ON public.mbee_enquiries;
CREATE TRIGGER trg_mbee_enquiries_updated_at
BEFORE UPDATE ON public.mbee_enquiries
FOR EACH ROW EXECUTE FUNCTION public.update_mbee_timestamp();

DROP TRIGGER IF EXISTS trg_mbee_submitted_docs_updated_at ON public.mbee_submitted_documents;
CREATE TRIGGER trg_mbee_submitted_docs_updated_at
BEFORE UPDATE ON public.mbee_submitted_documents
FOR EACH ROW EXECUTE FUNCTION public.update_mbee_timestamp();

-- Enable Row Level Security (RLS)
ALTER TABLE public.mbee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_submitted_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_custom_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_announcements ENABLE ROW LEVEL SECURITY;

-- Policies for Anon / Authenticated Client & Service Role Sync
DROP POLICY IF EXISTS "Allow public read/write on mbee_profiles" ON public.mbee_profiles;
CREATE POLICY "Allow public read/write on mbee_profiles"
  ON public.mbee_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on mbee_enquiries" ON public.mbee_enquiries;
CREATE POLICY "Allow public read/write on mbee_enquiries"
  ON public.mbee_enquiries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on mbee_submitted_documents" ON public.mbee_submitted_documents;
CREATE POLICY "Allow public read/write on mbee_submitted_documents"
  ON public.mbee_submitted_documents FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on mbee_custom_services" ON public.mbee_custom_services;
CREATE POLICY "Allow public read/write on mbee_custom_services"
  ON public.mbee_custom_services FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on mbee_announcements" ON public.mbee_announcements;
CREATE POLICY "Allow public read/write on mbee_announcements"
  ON public.mbee_announcements FOR ALL USING (true) WITH CHECK (true);

-- Seed Initial Enquiries & Announcements for M Bee Enterprises (Mahilpur, Punjab 146105)
INSERT INTO public.mbee_announcements (id, announcement_text, updated_by)
VALUES (
  1,
  'Welcome to M Bee Enterprises (Prop. Baljinder Singh & Manpreet Singh), Bank of Baroda, near Bus Stand, Mahilpur (82888-37597, 99156-28427).',
  'Baljinder Singh & Manpreet Singh'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mbee_enquiries (
  id, reference_code, user_name, user_mobile, user_city, service_name, work_description, preferred_contact, status
)
VALUES
  (
    'ENQ-SEED-101',
    'WRK-4821',
    'Gurpreet Singh',
    '9876543210',
    'Mahilpur, Punjab',
    'Passport Application Assistance',
    'Fresh Passport application and PSK appointment slot booking at Jalandhar/Hoshiarpur.',
    'whatsapp',
    'Pending'
  ),
  (
    'ENQ-SEED-102',
    'WRK-5190',
    'Harjinder Kaur',
    '9814011223',
    'Garhshankar, Punjab',
    'Home Loan Assistance',
    'Home construction loan file assessment and 6-month bank statement review.',
    'call',
    'Processing'
  ),
  (
    'ENQ-SEED-103',
    'WRK-6034',
    'Sukhdev Singh',
    '9417299881',
    'Chabbewal, Punjab',
    'Aadhaar & PAN Card Linking',
    'Demographic name correction on PAN card and Aadhaar-PAN linking verification.',
    'whatsapp',
    'Completed'
  )
ON CONFLICT (id) DO NOTHING;
