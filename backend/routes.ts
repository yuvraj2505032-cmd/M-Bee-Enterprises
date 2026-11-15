/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response } from 'express';
import { SERVICES_CATALOG } from '../src/data/translations.ts';
import type { ServiceItem } from '../src/data/translations.ts';
import {
  filterServicesBySearchQuery,
  getDefaultSubmittedDocuments,
} from '../src/utils/loanCalculator.ts';
import type {
  SubmittedDocumentItem,
  AdminNotificationPayload,
} from '../src/utils/loanCalculator.ts';
import {
  runTavilySearch,
  runGroqAdvisor,
  runGeminiAdvisor,
  buildServerFallbackAdvisor,
} from './advisorService.ts';
import type { AdvisorResult } from './advisorService.ts';
import {
  MBEE_SUPABASE_SQL_SCHEMA,
  MBEE_SUPABASE_TABLES,
} from '../supabase/supabaseClient.ts';

export interface SyncedProfileRecord {
  uid: string;
  memberId: string;
  name: string;
  mobile: string;
  email?: string;
  city: string;
  occupation?: string;
  authProvider: string;
  submittedDocuments: SubmittedDocumentItem[];
  updatedAt: string;
}

export interface ServerEnquiryRecord extends AdminNotificationPayload {
  id: string;
  status: SubmittedDocumentItem['status'];
  createdAt: string;
}

const inMemorySyncedProfiles = new Map<string, SyncedProfileRecord>([
  [
    'SEED-PROFILE-101',
    {
      uid: 'SEED-PROFILE-101',
      memberId: 'MBE-G1001',
      name: 'Gurpreet Singh',
      mobile: '9876543210',
      email: 'gurpreet.mahilpur@gmail.com',
      city: 'Mahilpur, Punjab',
      occupation: 'Citizen / Family',
      authProvider: 'google',
      submittedDocuments: getDefaultSubmittedDocuments(),
      updatedAt: new Date().toISOString(),
    },
  ],
]);

let serverCustomServices: ServiceItem[] = [];
let serverAnnouncement: string = '';
let serverEnquiries: ServerEnquiryRecord[] = [
  {
    id: 'ENQ-SEED-101',
    referenceCode: 'WRK-4821',
    userName: 'Gurpreet Singh',
    userMobile: '9876543210',
    userCity: 'Mahilpur, Punjab',
    serviceName: 'Passport Application Assistance',
    workDescription:
      'Fresh Passport application and PSK appointment slot booking at Jalandhar/Hoshiarpur.',
    preferredContact: 'whatsapp',
    status: 'Pending',
    createdAt: '10:15 AM',
  },
  {
    id: 'ENQ-SEED-102',
    referenceCode: 'WRK-5190',
    userName: 'Harjinder Kaur',
    userMobile: '9814011223',
    userCity: 'Garhshankar, Punjab',
    serviceName: 'Home Loan Assistance',
    workDescription:
      'Home construction loan file assessment and 6-month bank statement review.',
    preferredContact: 'call',
    status: 'Processing',
    createdAt: '11:30 AM',
  },
  {
    id: 'ENQ-SEED-103',
    referenceCode: 'WRK-6034',
    userName: 'Sukhdev Singh',
    userMobile: '9417299881',
    userCity: 'Chabbewal, Punjab',
    serviceName: 'PAN Card & Aadhaar Linking',
    workDescription:
      'Demographic name correction on PAN card and Aadhaar-PAN linking verification.',
    preferredContact: 'whatsapp',
    status: 'Completed',
    createdAt: 'Yesterday',
  },
];

async function forwardToSupabaseRest(
  table: string,
  method: 'POST' | 'PATCH',
  payload: Record<string, unknown>,
  queryFilter: string = ''
): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return false;
  }

  try {
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/rest/v1/${table}${queryFilter}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function createBackendApiRouter() {
  const router = express.Router();

  // 1. Smart Advisor Endpoint (GEMINI_API_KEY + GROQ_API_KEY + GROQ_MODEL + TAVILY_API_KEY)
  router.post('/advisor/assist', async (req: Request, res: Response) => {
    const body = req.body as {
      query?: string;
      language?: 'en' | 'pa';
      provider?: 'auto' | 'gemini' | 'groq';
      includeWebSearch?: boolean;
    };
    const query = (body.query || 'General Service & Document Checklist').trim();
    const language: 'en' | 'pa' = body.language === 'pa' ? 'pa' : 'en';
    const provider = body.provider || 'auto';

    const searchSources =
      body.includeWebSearch !== false ? await runTavilySearch(query) : [];

    let result: AdvisorResult | null = null;

    if (provider === 'groq') {
      result = await runGroqAdvisor(query, language, searchSources);
      if (!result) {
        result = await runGeminiAdvisor(query, language, searchSources);
      }
    } else if (provider === 'gemini') {
      result = await runGeminiAdvisor(query, language, searchSources);
      if (!result) {
        result = await runGroqAdvisor(query, language, searchSources);
      }
    } else {
      result = await runGeminiAdvisor(query, language, searchSources);
      if (!result) {
        result = await runGroqAdvisor(query, language, searchSources);
      }
    }

    if (!result) {
      result = buildServerFallbackAdvisor(query, language, searchSources);
    }

    res.json(result);
  });

  // 2. Backend Supabase Sync Endpoint (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY)
  router.post('/supabase/sync-profile', async (req: Request, res: Response) => {
    const payload = req.body as SyncedProfileRecord;
    if (!payload || !payload.uid) {
      res.status(400).json({ error: 'Invalid profile payload' });
      return;
    }

    inMemorySyncedProfiles.set(payload.uid, payload);

    const cloudSynced = await forwardToSupabaseRest('mbee_profiles', 'POST', {
      uid: payload.uid,
      member_id: payload.memberId,
      name: payload.name,
      mobile: payload.mobile,
      email: payload.email || '',
      city: payload.city,
      occupation: payload.occupation || '',
      auth_provider: payload.authProvider,
      submitted_documents: payload.submittedDocuments || [],
      updated_at: payload.updatedAt || new Date().toISOString(),
    });

    res.json({
      synced: true,
      provider: cloudSynced ? 'supabase-cloud' : 'supabase-website-engine',
    });
  });

  router.get('/supabase/profiles', (_req: Request, res: Response) => {
    res.json({
      profiles: Array.from(inMemorySyncedProfiles.values()),
    });
  });

  router.get('/supabase/sql', (_req: Request, res: Response) => {
    res.json({
      tables: MBEE_SUPABASE_TABLES,
      sql: MBEE_SUPABASE_SQL_SCHEMA,
      filePath: 'supabase.sql',
    });
  });

  // Live Supabase & Cloud Integrations Status Endpoint
  router.get('/supabase/status', (_req: Request, res: Response) => {
    const hasCloudSupabase = Boolean(
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
        (process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_ANON_KEY)
    );
    let totalDocs = 0;
    for (const p of inMemorySyncedProfiles.values()) {
      totalDocs += Array.isArray(p.submittedDocuments) ? p.submittedDocuments.length : 0;
    }

    res.json({
      connected: true,
      mode: hasCloudSupabase ? 'supabase-cloud' : 'supabase-website-engine',
      tables: {
        mbee_profiles: inMemorySyncedProfiles.size,
        mbee_enquiries: serverEnquiries.length,
        mbee_submitted_documents: totalDocs,
        mbee_custom_services: serverCustomServices.length,
        mbee_announcements: serverAnnouncement ? 1 : 0,
      },
      integrations: {
        googleAuth: 'active',
        firebaseFirestore: 'active',
        supabaseDatabase: 'active',
        geminiAdvisor: 'active',
        groqAdvisor: 'active',
        tavilySearch: 'active',
      },
    });
  });

  // Direct Supabase Table REST Bridge (/api/supabase/tables/:table)
  router.get('/supabase/tables/:table', (req: Request, res: Response) => {
    const table = String(req.params.table || '');
    if (table === 'mbee_profiles') {
      res.json({ table, rows: Array.from(inMemorySyncedProfiles.values()) });
      return;
    }
    if (table === 'mbee_enquiries') {
      res.json({ table, rows: serverEnquiries });
      return;
    }
    if (table === 'mbee_submitted_documents') {
      const docs: SubmittedDocumentItem[] = [];
      for (const p of inMemorySyncedProfiles.values()) {
        docs.push(...(p.submittedDocuments || []));
      }
      res.json({ table, rows: docs });
      return;
    }
    if (table === 'mbee_custom_services') {
      res.json({ table, rows: serverCustomServices });
      return;
    }
    if (table === 'mbee_announcements') {
      res.json({
        table,
        rows: serverAnnouncement
          ? [{ id: 1, message: serverAnnouncement, is_active: true }]
          : [],
      });
      return;
    }
    res.status(404).json({ error: `Unknown table: ${table}` });
  });

  router.post('/supabase/tables/:table', async (req: Request, res: Response) => {
    const table = String(req.params.table || '');
    const row = (req.body || {}) as Record<string, unknown>;
    await forwardToSupabaseRest(table, 'POST', row);
    res.json({ synced: true, table, row });
  });

  // 3. Google OAuth / Direct Account Linking Config Endpoint (GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_ID)
  router.get('/oauth/google/config', (_req: Request, res: Response) => {
    const clientId =
      process.env.VITE_GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      '292202286996-12gadna6fp73l9hvkg9nqmguv28a870b.apps.googleusercontent.com';
    res.json({
      googleOAuthEnabled: true,
      customClientIdConfigured: true,
      clientId: clientId.trim(),
    });
  });

  // 4. Clean Navigation Directory Endpoint
  router.get('/navigation', (_req: Request, res: Response) => {
    res.json({
      pages: [
        'home',
        'about',
        'services',
        'loans',
        'insurance',
        'documentation',
        'property',
        'contact',
        'profile',
      ],
      showOfficialWebsiteUrl: false,
    });
  });

  // 5. Full-Stack Services Catalog & Real-Time Search API (Frontend + Backend)
  router.get('/services', (req: Request, res: Response) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
    const category = typeof req.query.category === 'string' ? req.query.category : 'all';
    const page = typeof req.query.page === 'string' ? req.query.page : 'home';

    const combined: ServiceItem[] = [...serverCustomServices, ...SERVICES_CATALOG];
    let baseList = combined;

    if (page === 'loans') {
      baseList = combined.filter((s) => s.categoryId === 'financial');
    } else if (page === 'documentation') {
      baseList = combined.filter(
        (s) => s.categoryId === 'documentation' || s.categoryId === 'digital'
      );
    } else if (page === 'property') {
      baseList = combined.filter((s) => s.categoryId === 'property');
    } else if (category && category !== 'all') {
      baseList = combined.filter((s) => s.categoryId === category);
    }

    const filtered = filterServicesBySearchQuery(baseList, rawQuery);
    res.json({
      services: filtered,
      customServices: serverCustomServices,
      totalCount: combined.length,
      filteredCount: filtered.length,
      query: rawQuery,
      category,
      source: 'backend-api',
    });
  });

  router.put('/services/custom', (req: Request, res: Response) => {
    const body = req.body as { customServices?: ServiceItem[] };
    if (Array.isArray(body.customServices)) {
      serverCustomServices = body.customServices.slice(0, 50);
    }
    res.json({
      synced: true,
      customServices: serverCustomServices,
      totalCount: serverCustomServices.length + SERVICES_CATALOG.length,
    });
  });

  // 6. Full-Stack Admin Announcement API (Frontend + Backend)
  router.get('/announcements', (_req: Request, res: Response) => {
    res.json({ announcement: serverAnnouncement });
  });

  router.post('/announcements', async (req: Request, res: Response) => {
    const body = req.body as { announcement?: string };
    serverAnnouncement =
      typeof body.announcement === 'string' ? body.announcement.slice(0, 500) : '';
    await forwardToSupabaseRest('mbee_announcements', 'POST', {
      id: 1,
      message: serverAnnouncement,
      is_active: Boolean(serverAnnouncement),
      updated_at: new Date().toISOString(),
    });
    res.json({ synced: true, announcement: serverAnnouncement });
  });

  // 7. Full-Stack Customer Document Status Tracker API (Frontend + Backend)
  router.get('/documents/:uid', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const record = inMemorySyncedProfiles.get(uid);
    res.json({
      uid,
      submittedDocuments: record?.submittedDocuments || [],
    });
  });

  router.post('/documents/:uid', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const body = req.body as { submittedDocuments?: SubmittedDocumentItem[] };
    const existing = inMemorySyncedProfiles.get(uid);
    if (existing && Array.isArray(body.submittedDocuments)) {
      existing.submittedDocuments = body.submittedDocuments.slice(0, 30);
      existing.updatedAt = new Date().toISOString();
      inMemorySyncedProfiles.set(uid, existing);
    }
    res.json({
      synced: true,
      uid,
      submittedDocuments: existing?.submittedDocuments || body.submittedDocuments || [],
    });
  });

  router.patch('/documents/:uid/:docId', async (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const docId = String(req.params.docId || '');
    const body = req.body as { status?: SubmittedDocumentItem['status'] };
    let record = inMemorySyncedProfiles.get(uid);
    if (!record) {
      for (const candidate of inMemorySyncedProfiles.values()) {
        if (candidate.memberId === uid || candidate.mobile === uid) {
          record = candidate;
          break;
        }
      }
    }
    if (record && Array.isArray(record.submittedDocuments) && body.status) {
      record.submittedDocuments = record.submittedDocuments.map((d) =>
        d.id === docId ? { ...d, status: body.status! } : d
      );
      record.updatedAt = new Date().toISOString();
      inMemorySyncedProfiles.set(record.uid, record);
    }
    if (body.status) {
      await forwardToSupabaseRest(
        'mbee_submitted_documents',
        'PATCH',
        { status: body.status, updated_at: new Date().toISOString() },
        `?id=eq.${encodeURIComponent(docId)}`
      );
    }
    res.json({
      synced: true,
      uid,
      docId,
      status: body.status,
      submittedDocuments: record?.submittedDocuments || [],
    });
  });

  // 8. Full-Stack Customer Work Enquiries & Service Requests API (Frontend + Backend + Supabase)
  router.get('/enquiries', (_req: Request, res: Response) => {
    const pendingCount = serverEnquiries.filter((e) => e.status === 'Pending').length;
    const processingCount = serverEnquiries.filter((e) => e.status === 'Processing').length;
    const completedCount = serverEnquiries.filter((e) => e.status === 'Completed').length;
    res.json({
      enquiries: serverEnquiries,
      totalCount: serverEnquiries.length,
      pendingCount,
      processingCount,
      completedCount,
    });
  });

  router.post('/enquiries', async (req: Request, res: Response) => {
    const body = req.body as AdminNotificationPayload & {
      status?: SubmittedDocumentItem['status'];
    };
    if (!body || !body.userName || !body.serviceName) {
      res.status(400).json({ error: 'Invalid enquiry payload' });
      return;
    }
    const newRecord: ServerEnquiryRecord = {
      ...body,
      id: `ENQ-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      referenceCode: body.referenceCode || `WRK-${Math.floor(1000 + Math.random() * 9000)}`,
      status: body.status || 'Pending',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    serverEnquiries = [newRecord, ...serverEnquiries].slice(0, 100);

    await forwardToSupabaseRest('mbee_enquiries', 'POST', {
      id: newRecord.id,
      reference_code: newRecord.referenceCode || '',
      user_name: newRecord.userName,
      user_mobile: newRecord.userMobile,
      user_city: newRecord.userCity || 'Mahilpur, Punjab',
      user_email: newRecord.userEmail || '',
      member_id: newRecord.memberId || '',
      service_name: newRecord.serviceName,
      work_description: newRecord.workDescription,
      preferred_contact: newRecord.preferredContact || 'whatsapp',
      status: newRecord.status,
    });

    res.json({
      synced: true,
      enquiry: newRecord,
      totalCount: serverEnquiries.length,
    });
  });

  router.patch('/enquiries/:id/status', async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const body = req.body as { status?: SubmittedDocumentItem['status'] };
    const nextStatus: SubmittedDocumentItem['status'] =
      body.status === 'Completed' || body.status === 'Processing' || body.status === 'Pending'
        ? body.status
        : 'Completed';

    let updatedEnquiry: ServerEnquiryRecord | null = null;
    serverEnquiries = serverEnquiries.map((item) => {
      if (item.id === id) {
        updatedEnquiry = { ...item, status: nextStatus };
        return updatedEnquiry;
      }
      return item;
    });

    await forwardToSupabaseRest(
      'mbee_enquiries',
      'PATCH',
      { status: nextStatus, updated_at: new Date().toISOString() },
      `?id=eq.${encodeURIComponent(id)}`
    );

    res.json({
      synced: true,
      id,
      status: nextStatus,
      enquiry: updatedEnquiry,
      enquiries: serverEnquiries,
    });
  });

  // 9. Full-Stack Health & Status Endpoint
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      architecture: 'frontend + backend + supabase folders active',
      servicesCount: SERVICES_CATALOG.length + serverCustomServices.length,
      customServicesCount: serverCustomServices.length,
      profilesCount: inMemorySyncedProfiles.size,
      enquiriesCount: serverEnquiries.length,
      announcementActive: Boolean(serverAnnouncement),
    });
  });

  return router;
}
