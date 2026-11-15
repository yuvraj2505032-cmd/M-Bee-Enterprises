-- =============================================================================
-- M Bee Enterprises – Financial & Documentation Services in Punjab
-- Proprietors: Baljinder Singh & Manpreet Singh (ਬਲਜਿੰਦਰ ਸਿੰਘ ਅਤੇ ਮਨਪ੍ਰੀਤ ਸਿੰਘ)
-- Location: Bank of Baroda, near Bus Stand, near Mahilpur, Mahilpur, Punjab 146105
-- Contact: 82888-37597, 99156-28427 | Email: enterprisesmbee@gmail.com
--
-- COMPLETE SUPABASE SQL FILE (TABLES + RLS POLICIES + READY-TO-RUN SQL QUERIES)
-- Copy and run this entire file in your Supabase Dashboard -> SQL Editor -> New Query
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- PART 1: CREATE WEBSITE TABLES (DDL QUERIES)
-- =============================================================================

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

-- 2. Customer Enquiries & Service Submissions Table (mbee_enquiries)
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

-- 6. Service Document & Eligibility Requirements Table (mbee_service_requirements)
CREATE TABLE IF NOT EXISTS public.mbee_service_requirements (
  service_id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL CHECK (category_id IN ('documentation', 'financial', 'property', 'digital')),
  service_title_en TEXT NOT NULL,
  service_title_pa TEXT NOT NULL,
  required_documents_en JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_documents_pa JSONB NOT NULL DEFAULT '[]'::jsonb,
  turnaround_en TEXT NOT NULL DEFAULT '',
  turnaround_pa TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast searching & filtering
CREATE INDEX IF NOT EXISTS idx_mbee_profiles_mobile ON public.mbee_profiles (mobile);
CREATE INDEX IF NOT EXISTS idx_mbee_enquiries_status ON public.mbee_enquiries (status);
CREATE INDEX IF NOT EXISTS idx_mbee_enquiries_mobile ON public.mbee_enquiries (user_mobile);
CREATE INDEX IF NOT EXISTS idx_mbee_submitted_docs_uid ON public.mbee_submitted_documents (uid);
CREATE INDEX IF NOT EXISTS idx_mbee_submitted_docs_status ON public.mbee_submitted_documents (status);
CREATE INDEX IF NOT EXISTS idx_mbee_service_req_category ON public.mbee_service_requirements (category_id);

-- =============================================================================
-- PART 2: ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.mbee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_submitted_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_custom_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbee_service_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access on mbee_profiles" ON public.mbee_profiles;
CREATE POLICY "Allow public access on mbee_profiles"
  ON public.mbee_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on mbee_enquiries" ON public.mbee_enquiries;
CREATE POLICY "Allow public access on mbee_enquiries"
  ON public.mbee_enquiries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on mbee_submitted_documents" ON public.mbee_submitted_documents;
CREATE POLICY "Allow public access on mbee_submitted_documents"
  ON public.mbee_submitted_documents FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on mbee_custom_services" ON public.mbee_custom_services;
CREATE POLICY "Allow public access on mbee_custom_services"
  ON public.mbee_custom_services FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on mbee_announcements" ON public.mbee_announcements;
CREATE POLICY "Allow public access on mbee_announcements"
  ON public.mbee_announcements FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- PART 3: INSERT INITIAL WEBSITE DATA (SEED QUERIES)
-- =============================================================================

-- Query 1: Insert / Update Customer Profile
INSERT INTO public.mbee_profiles (
  uid, member_id, name, mobile, email, city, occupation, auth_provider
)
VALUES (
  'mbee-user-9876543210',
  'MBE-3210',
  'Gurpreet Singh',
  '9876543210',
  'gurpreet.singh@gmail.com',
  'Mahilpur, Punjab',
  'Citizen / Family',
  'google'
)
ON CONFLICT (uid) DO UPDATE SET
  name = EXCLUDED.name,
  mobile = EXCLUDED.mobile,
  city = EXCLUDED.city,
  updated_at = NOW();

-- Query 2: Insert Customer Enquiries & Service Submissions
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
    'PAN Card & Aadhaar Linking',
    'Demographic name correction on PAN card and Aadhaar-PAN linking verification.',
    'whatsapp',
    'Completed'
  )
ON CONFLICT (id) DO NOTHING;

-- Query 3: Insert Submitted Documents for Customer Status Tracker
INSERT INTO public.mbee_submitted_documents (
  id, uid, reference_no, document_name, service_category, status, remarks, submitted_at
)
VALUES
  (
    'DOC-1001',
    'mbee-user-9876543210',
    'DOC-4821',
    'Aadhaar & PAN KYC Set',
    'Identity & KYC Verification',
    'Completed',
    'Verified at M Bee Enterprises Desk (Baljinder Singh & Manpreet Singh)',
    'Today, 10:30 AM'
  ),
  (
    'DOC-1002',
    'mbee-user-9876543210',
    'DOC-5190',
    'Passport Application File & Birth Proof',
    'Passport & Citizen Services',
    'Processing',
    'Application under review for appointment slot',
    'Today, 11:45 AM'
  )
ON CONFLICT (id) DO NOTHING;

-- Query 4: Set Homepage Announcement Banner
INSERT INTO public.mbee_announcements (id, announcement_text, updated_by)
VALUES (
  1,
  'Welcome to M Bee Enterprises (Prop. Baljinder Singh & Manpreet Singh), Bank of Baroda, near Bus Stand, Mahilpur (82888-37597, 99156-28427).',
  'Baljinder Singh & Manpreet Singh'
)
ON CONFLICT (id) DO UPDATE SET
  announcement_text = EXCLUDED.announcement_text,
  updated_at = NOW();

-- =============================================================================
-- PART 4: COMMON WEBSITE & ADMIN DASHBOARD SQL QUERIES (SELECT / UPDATE / DELETE)
-- =============================================================================

-- Query 5: Admin Dashboard Summary Counts (Total, Pending, Processing, Completed)
SELECT
  COUNT(*) AS total_submissions,
  COUNT(*) FILTER (WHERE status = 'Pending') AS pending_count,
  COUNT(*) FILTER (WHERE status = 'Processing') AS processing_count,
  COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count
FROM public.mbee_enquiries;

-- Query 6: Fetch All Customer Enquiries Ordered by Newest First
SELECT
  id,
  reference_code,
  user_name,
  user_mobile,
  user_city,
  service_name,
  work_description,
  status,
  created_at
FROM public.mbee_enquiries
ORDER BY created_at DESC;

-- Query 7: Mark an Enquiry as 'Completed' (Admin Dashboard Action)
UPDATE public.mbee_enquiries
SET status = 'Completed', updated_at = NOW()
WHERE id = 'ENQ-SEED-101'
RETURNING *;

-- Query 8: Update a Customer's Submitted Document Status Badge (Pending / Processing / Completed)
UPDATE public.mbee_submitted_documents
SET status = 'Completed', updated_at = NOW()
WHERE id = 'DOC-1002'
RETURNING *;

-- Query 9: Fetch Customer Profile Along With Their Submitted Documents
SELECT
  p.uid,
  p.member_id,
  p.name,
  p.mobile,
  p.email,
  p.city,
  d.reference_no,
  d.document_name,
  d.service_category,
  d.status AS document_status,
  d.remarks
FROM public.mbee_profiles p
LEFT JOIN public.mbee_submitted_documents d ON d.uid = p.uid
ORDER BY p.updated_at DESC;
