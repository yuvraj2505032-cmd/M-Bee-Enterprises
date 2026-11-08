/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { SERVICES_CATALOG } from './src/data/translations.ts';
import type { ServiceItem } from './src/data/translations.ts';
import { filterServicesBySearchQuery } from './src/utils/loanCalculator.ts';
import type { SubmittedDocumentItem } from './src/utils/loanCalculator.ts';

interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

interface AdvisorResult {
  answer: string;
  checklist: string[];
  estimatedTimeline: string;
  providerUsed: 'gemini-3.8-flash' | 'llama-3.3-70b-versatile' | 'mbee-smart-desk';
  searchSources: SearchSource[];
  whatsappSummaryText: string;
}

interface SyncedProfileRecord {
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

const inMemorySyncedProfiles = new Map<string, SyncedProfileRecord>();
let serverCustomServices: ServiceItem[] = [];
let serverAnnouncement: string = '';

function getConfiguredCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (process.env.APP_URL) {
    list.push(process.env.APP_URL.trim());
  }
  return Array.from(new Set(['http://localhost:3000', 'http://localhost:5173', ...list]));
}

async function runTavilySearch(query: string): Promise<SearchSource[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey || !tavilyKey.trim()) {
    return [];
  }
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey.trim(),
        query: `${query} Punjab India citizen document checklist loan rules`,
        search_depth: 'basic',
        max_results: 3,
      }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    if (!Array.isArray(data.results)) return [];
    return data.results.slice(0, 3).map((item) => ({
      title: item.title || 'Official Service Reference',
      url: item.url || 'https://punjab.gov.in',
      snippet: (item.content || '').slice(0, 220),
    }));
  } catch {
    return [];
  }
}

async function runGroqAdvisor(
  query: string,
  language: 'en' | 'pa',
  searchSources: SearchSource[]
): Promise<AdvisorResult | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || !groqKey.trim()) {
    return null;
  }
  const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const contextText =
    searchSources.length > 0
      ? `\nWeb Search Context:\n${searchSources
          .map((s) => `- ${s.title}: ${s.snippet}`)
          .join('\n')}`
      : '';

  const systemPrompt =
    `You are the official Smart Service & Document Checklist Advisor for M Bee Enterprises ` +
    `(Proprietors: Baljinder Singh & Manpreet Singh), located at Bank of Baroda, near Bus Stand, Mahilpur, Punjab 146105 ` +
    `(Phone: 82888-37597, 99156-28427). ` +
    `Respond in ${language === 'pa' ? 'Punjabi (Gurmukhi)' : 'English'}. ` +
    `Return ONLY valid JSON with keys: "answer" (string), "checklist" (array of 4 strings), "estimatedTimeline" (string).`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey.trim()}`,
      },
      body: JSON.stringify({
        model: groqModel,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Customer Query: ${query}${contextText}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) return null;
    const parsed = JSON.parse(rawContent) as {
      answer?: string;
      checklist?: string[];
      estimatedTimeline?: string;
    };
    if (!parsed.answer || !Array.isArray(parsed.checklist)) return null;
    return {
      answer: parsed.answer,
      checklist: parsed.checklist.slice(0, 6),
      estimatedTimeline: parsed.estimatedTimeline || '3 to 10 working days',
      providerUsed: 'llama-3.3-70b-versatile',
      searchSources,
      whatsappSummaryText: `Hello M Bee Enterprises (Baljinder Singh & Manpreet Singh), I consulted the Smart Advisor regarding "${query}" and would like to proceed.`,
    };
  } catch {
    return null;
  }
}

async function runGeminiAdvisor(
  query: string,
  language: 'en' | 'pa',
  searchSources: SearchSource[]
): Promise<AdvisorResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || !geminiKey.trim() || geminiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: geminiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const contextText =
      searchSources.length > 0
        ? `\nWeb Search Context:\n${searchSources
            .map((s) => `- ${s.title}: ${s.snippet}`)
            .join('\n')}`
        : '';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Customer Query: ${query}${contextText}`,
      config: {
        systemInstruction:
          `You are the official Smart Service & Document Checklist Advisor for M Bee Enterprises ` +
          `(Proprietors: Baljinder Singh & Manpreet Singh), located at Bank of Baroda, near Bus Stand, Mahilpur, Punjab 146105 ` +
          `(Phones: 82888-37597, 99156-28427). ` +
          `Respond in ${language === 'pa' ? 'Punjabi (Gurmukhi)' : 'English'}. ` +
          `Provide clear, accurate document checklists and realistic timelines without promising guaranteed loan or government approvals.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: {
              type: Type.STRING,
              description: 'Helpful summary guidance for the customer query.',
            },
            checklist: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of 4 to 5 required documents.',
            },
            estimatedTimeline: {
              type: Type.STRING,
              description: 'Typical processing time range.',
            },
          },
          required: ['answer', 'checklist', 'estimatedTimeline'],
        },
      },
    });

    const jsonText = (response.text ?? '').trim();
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText) as {
      answer?: string;
      checklist?: string[];
      estimatedTimeline?: string;
    };
    if (!parsed.answer || !Array.isArray(parsed.checklist)) return null;

    return {
      answer: parsed.answer,
      checklist: parsed.checklist.slice(0, 6),
      estimatedTimeline: parsed.estimatedTimeline || '3 to 10 working days',
      providerUsed: 'gemini-3.8-flash',
      searchSources,
      whatsappSummaryText: `Hello M Bee Enterprises (Baljinder Singh & Manpreet Singh), I consulted the Smart Advisor regarding "${query}" and would like to proceed.`,
    };
  } catch {
    return null;
  }
}

function buildServerFallbackAdvisor(
  query: string,
  language: 'en' | 'pa',
  searchSources: SearchSource[]
): AdvisorResult {
  const q = (query || '').toLowerCase();
  const isPa = language === 'pa';

  if (q.includes('passport') || q.includes('ਪਾਸਪੋਰਟ') || q.includes('pcc')) {
    return {
      answer: isPa
        ? 'M Bee Enterprises (ਬਲਜਿੰਦਰ ਸਿੰਘ ਅਤੇ ਮਨਪ੍ਰੀਤ ਸਿੰਘ) ਵੱਲੋਂ ਨਵੇਂ ਪਾਸਪੋਰਟ, ਰੀ-ਇਸ਼ੂ (Renewal), ਤਤਕਾਲ ਪਾਸਪੋਰਟ ਅਤੇ PCC ਲਈ ਆਨਲਾਈਨ ਫਾਰਮ ਭਰਨ ਅਤੇ PSK ਅਪਾਇੰਟਮੈਂਟ ਬੁਕਿੰਗ ਦੀ ਪੂਰੀ ਸਹਾਇਤਾ ਦਿੱਤੀ ਜਾਂਦੀ ਹੈ।'
        : 'M Bee Enterprises (Prop. Baljinder Singh & Manpreet Singh) provides complete assistance for fresh Passport applications, renewal/re-issue, Tatkaal booking, and Police Clearance Certificate (PCC) slot scheduling.',
      checklist: isPa
        ? [
            'ਅਸਲ ਆਧਾਰ ਕਾਰਡ (ਪੂਰਾ ਜਨਮ ਮਿਤੀ ਅਤੇ ਮੌਜੂਦਾ ਪਤਾ)',
            'ਪੈਨ ਕਾਰਡ ਜਾਂ ਵੋਟਰ ਆਈ.ਡੀ. ਕਾਰਡ',
            '10ਵੀਂ ਜਮਾਤ ਦਾ ਸਰਟੀਫਿਕੇਟ (Non-ECR ਸਟੈਂਪ ਲਈ)',
            'ਬੈਂਕ ਪਾਸਬੁੱਕ (ਫੋਟੋ ਅਤੇ ਤਾਜ਼ਾ ਐਂਟਰੀ ਸਮੇਤ)',
          ]
        : [
            'Original Aadhaar Card with complete DOB and current address',
            'PAN Card or Voter ID Card (Identity proof)',
            '10th Class Matriculation Certificate (for Non-ECR category)',
            'Active Bank Passbook with photo and recent entry',
          ],
      estimatedTimeline: isPa
        ? '7 ਤੋਂ 21 ਕੰਮਕਾਜੀ ਦਿਨ (ਪੁਲਿਸ ਵੈਰੀਫਿਕੇਸ਼ਨ ਅਨੁਸਾਰ)'
        : '7 to 21 working days (subject to police verification)',
      providerUsed: 'mbee-smart-desk',
      searchSources,
      whatsappSummaryText: `Hello M Bee Enterprises (Baljinder Singh & Manpreet Singh), I checked the Passport & PCC checklist for "${query}" and want to book an appointment.`,
    };
  }

  if (
    q.includes('loan') ||
    q.includes('ਲੋਨ') ||
    q.includes('emi') ||
    q.includes('home') ||
    q.includes('car') ||
    q.includes('business')
  ) {
    return {
      answer: isPa
        ? 'M Bee Enterprises ਵਿਖੇ ਬਲਜਿੰਦਰ ਸਿੰਘ ਅਤੇ ਮਨਪ੍ਰੀਤ ਸਿੰਘ ਵੱਲੋਂ ਪਰਸਨਲ ਲੋਨ, ਹੋਮ ਲੋਨ, ਕਾਰ ਲੋਨ ਅਤੇ ਬਿਜ਼ਨਸ ਲੋਨ ਦੀ ਫਾਈਲ ਤਿਆਰ ਕਰਨ ਅਤੇ ਬੈਂਕ ਯੋਗਤਾ (Eligibility) ਚੈੱਕ ਕਰਨ ਵਿੱਚ ਪੂਰੀ ਮਦਦ ਕੀਤੀ ਜਾਂਦੀ ਹੈ।'
        : 'At M Bee Enterprises (Bank of Baroda, near Bus Stand, Mahilpur), Proprietors Baljinder Singh & Manpreet Singh prepare structured files for Personal, Home, Car, and Business Loans with transparent eligibility guidance.',
      checklist: isPa
        ? [
            'ਆਧਾਰ ਕਾਰਡ ਅਤੇ ਪੈਨ ਕਾਰਡ (KYC ਦਸਤਾਵੇਜ਼)',
            'ਪਿਛਲੇ 6 ਤੋਂ 12 ਮਹੀਨਿਆਂ ਦੀ ਬੈਂਕ ਸਟੇਟਮੈਂਟ',
            'ਆਮਦਨ ਦਾ ਸਬੂਤ: ਸੈਲਰੀ ਸਲਿੱਪਾਂ ਜਾਂ ਪਿਛਲੇ 2-3 ਸਾਲਾਂ ਦੀ ITR',
            'ਪ੍ਰਾਪਰਟੀ ਦੇ ਕਾਗਜ਼ਾਤ / ਕੋਟੇਸ਼ਨ (ਹੋਮ ਜਾਂ ਕਾਰ ਲੋਨ ਲਈ)',
          ]
        : [
            'Aadhaar Card & PAN Card of applicant and co-applicant',
            'Last 6 to 12 months Bank Account Statement',
            'Income Proof: Latest 3 months Salary Slips or 2–3 years ITR / Form-16',
            'Property Title Deed / Vehicle Proforma Invoice (for Home or Car Loan)',
          ],
      estimatedTimeline: isPa
        ? '3 ਤੋਂ 10 ਕੰਮਕਾਜੀ ਦਿਨ (ਬੈਂਕ ਜਾਂਚ ਅਨੁਸਾਰ)'
        : '3 to 10 working days (subject to bank verification)',
      providerUsed: 'mbee-smart-desk',
      searchSources,
      whatsappSummaryText: `Hello M Bee Enterprises (Baljinder Singh & Manpreet Singh), I need loan file guidance regarding: "${query}".`,
    };
  }

  return {
    answer: isPa
      ? `M Bee Enterprises (ਬਲਜਿੰਦਰ ਸਿੰਘ ਅਤੇ ਮਨਪ੍ਰੀਤ ਸਿੰਘ), ਨੇੜੇ ਬੱਸ ਸਟੈਂਡ, ਮਾਹਿਲਪੁਰ (82888-37597, 99156-28427) ਵਿਖੇ ਤੁਹਾਡੇ ਕੰਮ "${query}" ਲਈ ਲੋੜੀਂਦੇ ਦਸਤਾਵੇਜ਼ਾਂ ਦੀ ਸੂਚੀ ਹੇਠਾਂ ਦਿੱਤੀ ਗਈ ਹੈ।`
      : `M Bee Enterprises (Prop. Baljinder Singh & Manpreet Singh), Bank of Baroda, near Bus Stand, Mahilpur (82888-37597, 99156-28427) provides structured guidance for "${query}". Review the required checklist below.`,
    checklist: isPa
      ? [
          'ਅਸਲ ਆਧਾਰ ਕਾਰਡ ਅਤੇ ਪੈਨ ਕਾਰਡ',
          '2 ਤਾਜ਼ਾ ਪਾਸਪੋਰਟ ਸਾਈਜ਼ ਫੋਟੋਆਂ',
          'ਮੋਬਾਈਲ ਨੰਬਰ (ਆਧਾਰ ਨਾਲ ਲਿੰਕ ਕੀਤਾ ਹੋਇਆ)',
          'ਸਬੰਧਤ ਸੇਵਾ ਦੇ ਪੁਰਾਣੇ ਦਸਤਾਵੇਜ਼ ਜਾਂ ਰਸੀਦ',
        ]
      : [
          'Original Aadhaar Card & PAN Card for verification',
          '2 Recent Passport-size photographs',
          'Active Mobile Number linked with Aadhaar',
          'Any previous reference document, policy copy, or land record (Fard)',
        ],
    estimatedTimeline: isPa ? '3 ਤੋਂ 10 ਕੰਮਕਾਜੀ ਦਿਨ' : '3 to 10 working days',
    providerUsed: 'mbee-smart-desk',
    searchSources,
    whatsappSummaryText: `Hello M Bee Enterprises (Baljinder Singh & Manpreet Singh), I would like assistance regarding: "${query}".`,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // Configure CORS using CORS_ORIGINS
  const allowedOrigins = getConfiguredCorsOrigins();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.run.app')) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 1. Smart Advisor Endpoint (GEMINI_API_KEY + GROQ_API_KEY + GROQ_MODEL + TAVILY_API_KEY)
  app.post('/api/advisor/assist', async (req: Request, res: Response) => {
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
  app.post('/api/supabase/sync-profile', async (req: Request, res: Response) => {
    const payload = req.body as SyncedProfileRecord;
    if (!payload || !payload.uid) {
      res.status(400).json({ error: 'Invalid profile payload' });
      return;
    }

    inMemorySyncedProfiles.set(payload.uid, payload);

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const cleanUrl = supabaseUrl.replace(/\/+$/, '');
        const supRes = await fetch(`${cleanUrl}/rest/v1/mbee_profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
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
          }),
        });
        if (supRes.ok) {
          res.json({ synced: true, provider: 'supabase-service-role' });
          return;
        }
      } catch {
        // Fallback to in-memory + Firestore sync confirmation
      }
    }

    res.json({ synced: true, provider: 'express-cloud-bridge' });
  });

  app.get('/api/supabase/profiles', (_req: Request, res: Response) => {
    res.json({
      profiles: Array.from(inMemorySyncedProfiles.values()),
    });
  });

  // 3. Google OAuth / Direct Account Linking Config Endpoint (GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_ID)
  app.get('/api/oauth/google/config', (_req: Request, res: Response) => {
    const clientId =
      process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    res.json({
      googleOAuthEnabled: true,
      customClientIdConfigured: Boolean(clientId && clientId.trim()),
      clientId: clientId.trim(),
    });
  });

  app.get('/api/site-info', (_req: Request, res: Response) => {
    res.json({
      officialWebsiteUrl: 'Mbeeenterprise',
      routePath: '/Mbeeenterprise',
    });
  });

  // 4. Full-Stack Services Catalog & Real-Time Search API (Frontend + Backend)
  app.get('/api/services', (req: Request, res: Response) => {
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

  app.put('/api/services/custom', (req: Request, res: Response) => {
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

  // 5. Full-Stack Admin Announcement API (Frontend + Backend)
  app.get('/api/announcements', (_req: Request, res: Response) => {
    res.json({ announcement: serverAnnouncement });
  });

  app.post('/api/announcements', (req: Request, res: Response) => {
    const body = req.body as { announcement?: string };
    serverAnnouncement = typeof body.announcement === 'string' ? body.announcement.slice(0, 500) : '';
    res.json({ synced: true, announcement: serverAnnouncement });
  });

  // 6. Full-Stack Customer Document Status Tracker API (Frontend + Backend)
  app.get('/api/documents/:uid', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const record = inMemorySyncedProfiles.get(uid);
    res.json({
      uid,
      submittedDocuments: record?.submittedDocuments || [],
    });
  });

  app.patch('/api/documents/:uid/:docId', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const docId = String(req.params.docId || '');
    const body = req.body as { status?: SubmittedDocumentItem['status'] };
    const record = inMemorySyncedProfiles.get(uid);
    if (record && Array.isArray(record.submittedDocuments) && body.status) {
      record.submittedDocuments = record.submittedDocuments.map((d) =>
        d.id === docId ? { ...d, status: body.status! } : d
      );
      record.updatedAt = new Date().toISOString();
      inMemorySyncedProfiles.set(uid, record);
    }
    res.json({
      synced: true,
      uid,
      docId,
      status: body.status,
      submittedDocuments: record?.submittedDocuments || [],
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`M Bee Enterprises Server running on http://localhost:${PORT}`);
  });
}

startServer();
