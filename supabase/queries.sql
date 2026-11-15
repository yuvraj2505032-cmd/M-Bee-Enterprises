-- =============================================================================
-- M Bee Enterprises (Prop. Baljinder Singh & Manpreet Singh)
-- Ready-to-Run Website SQL Queries (SELECT, INSERT, UPDATE, DELETE)
-- =============================================================================

-- 1. Get Admin Dashboard KPI Summary (Total, Pending, Processing, Completed)
SELECT
  COUNT(*) AS total_submissions,
  COUNT(*) FILTER (WHERE status = 'Pending') AS pending_count,
  COUNT(*) FILTER (WHERE status = 'Processing') AS processing_count,
  COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count
FROM public.mbee_enquiries;

-- 2. Get All Pending & Processing Customer Enquiries for Admin Follow-up
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
WHERE status IN ('Pending', 'Processing')
ORDER BY created_at DESC;

-- 3. Mark a Customer Enquiry as Completed
UPDATE public.mbee_enquiries
SET status = 'Completed', updated_at = NOW()
WHERE id = 'ENQ-SEED-101'
RETURNING *;

-- 4. Track Customer Submitted Documents by Mobile Number
SELECT
  p.name AS customer_name,
  p.mobile AS customer_mobile,
  d.reference_no,
  d.document_name,
  d.service_category,
  d.status,
  d.submitted_at
FROM public.mbee_submitted_documents d
JOIN public.mbee_profiles p ON p.uid = d.uid
WHERE p.mobile = '9876543210'
ORDER BY d.created_at DESC;

-- 5. Update Submitted Document Status Badge ('Pending' | 'Processing' | 'Completed')
UPDATE public.mbee_submitted_documents
SET status = 'Completed', updated_at = NOW()
WHERE id = 'DOC-1002'
RETURNING *;

-- 6. Search Custom Services Added by Admin
SELECT *
FROM public.mbee_custom_services
WHERE title_en ILIKE '%Passport%' OR title_pa ILIKE '%ਪਾਸਪੋਰਟ%'
ORDER BY created_at DESC;
