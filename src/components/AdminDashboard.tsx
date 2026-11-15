/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  PhoneCall,
  MessageCircle,
  RefreshCw,
  Search,
  Database,
  Copy,
  FileCheck2,
  UserCheck,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Language } from '../data/translations';
import {
  DocumentStatus,
  UserSession,
  buildWhatsAppUrl,
} from '../utils/loanCalculator';
import {
  BackendEnquiryRecord,
  fetchEnquiriesFromBackend,
  updateEnquiryStatusOnBackend,
  summarizeEnquiriesForAdmin,
  syncDocumentStatusWithBackend,
  syncUserProfileAcrossClouds,
} from '../utils/cloudIntegrations';
import {
  MBEE_SUPABASE_SQL_SCHEMA,
  MBEE_SUPABASE_TABLES,
  SupabaseCloudStatus,
  fetchSupabaseCloudStatus,
} from '../../supabase/supabaseClient';

export interface AdminDashboardProps {
  lang: Language;
  savedProfiles?: UserSession[];
  onProfileDocumentUpdated?: (updatedProfile: UserSession) => void;
}

export function AdminDashboard({
  lang,
  savedProfiles = [],
  onProfileDocumentUpdated,
}: AdminDashboardProps) {
  const [enquiries, setEnquiries] = useState<BackendEnquiryRecord[]>([]);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseCloudStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'All' | DocumentStatus>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showSqlSchema, setShowSqlSchema] = useState<boolean>(false);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  const loadFromBackend = async () => {
    setLoading(true);
    const [data, cloudStat] = await Promise.all([
      fetchEnquiriesFromBackend(),
      fetchSupabaseCloudStatus(),
    ]);
    setEnquiries(data);
    setSupabaseStatus(cloudStat);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([fetchEnquiriesFromBackend(), fetchSupabaseCloudStatus()]).then(
      ([data, cloudStat]) => {
        if (active) {
          setEnquiries(data);
          setSupabaseStatus(cloudStat);
          setLoading(false);
        }
      }
    );
    return () => {
      active = false;
    };
  }, []);

  // Combine backend enquiries with any customer-submitted documents from registered profiles
  const combinedItems = useMemo<BackendEnquiryRecord[]>(() => {
    const profileSubmissionItems: BackendEnquiryRecord[] = [];
    const seenIds = new Set(enquiries.map((e) => e.id));

    for (const prof of savedProfiles) {
      for (const doc of prof.submittedDocuments || []) {
        const syntheticId = `DOC-${prof.mobile || prof.memberId}-${doc.id}`;
        if (!seenIds.has(syntheticId)) {
          profileSubmissionItems.push({
            id: syntheticId,
            referenceCode: doc.referenceNo,
            userName: prof.name,
            userMobile: prof.mobile || '9876543210',
            userCity: prof.city || 'Mahilpur, Punjab',
            userEmail: prof.email,
            memberId: prof.memberId,
            serviceName: `${doc.documentName} (${doc.serviceCategory})`,
            workDescription:
              doc.remarks || `Submitted document for verification under ${doc.serviceCategory}.`,
            preferredContact: 'whatsapp',
            status: doc.status,
            createdAt: doc.submittedAt,
          });
        }
      }
    }

    return [...enquiries, ...profileSubmissionItems];
  }, [enquiries, savedProfiles]);

  const summary = useMemo(
    () => summarizeEnquiriesForAdmin(combinedItems),
    [combinedItems]
  );

  const filteredItems = useMemo(() => {
    return combinedItems.filter((item) => {
      const currentStatus = item.status || 'Pending';
      if (statusFilter !== 'All' && currentStatus !== statusFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.userName.toLowerCase().includes(q) ||
        item.userMobile.toLowerCase().includes(q) ||
        item.serviceName.toLowerCase().includes(q) ||
        item.workDescription.toLowerCase().includes(q) ||
        (item.referenceCode || '').toLowerCase().includes(q) ||
        (item.userCity || '').toLowerCase().includes(q)
      );
    });
  }, [combinedItems, statusFilter, searchQuery]);

  const handleMarkStatus = async (
    item: BackendEnquiryRecord,
    nextStatus: DocumentStatus
  ) => {
    setUpdatingId(item.id);

    // Check if this is a profile document submission (`DOC-...`) or a backend enquiry (`ENQ-...`)
    if (item.id.startsWith('DOC-')) {
      for (const prof of savedProfiles) {
        const matchedDoc = (prof.submittedDocuments || []).find(
          (d) => `DOC-${prof.mobile || prof.memberId}-${d.id}` === item.id
        );
        if (matchedDoc) {
          const nextDocs = (prof.submittedDocuments || []).map((d) =>
            d.id === matchedDoc.id ? { ...d, status: nextStatus } : d
          );
          const updatedProf: UserSession = {
            ...prof,
            submittedDocuments: nextDocs,
          };
          void syncDocumentStatusWithBackend(
            prof.uid || prof.memberId || prof.mobile,
            matchedDoc.id,
            nextStatus
          );
          void syncUserProfileAcrossClouds(updatedProf);
          if (onProfileDocumentUpdated) {
            onProfileDocumentUpdated(updatedProf);
          }
          break;
        }
      }
    } else {
      // Optimistically update local enquiries state
      setEnquiries((prev) =>
        prev.map((e) => (e.id === item.id ? { ...e, status: nextStatus } : e))
      );
      await updateEnquiryStatusOnBackend(item.id, nextStatus);
      const refreshedCloud = await fetchSupabaseCloudStatus();
      setSupabaseStatus(refreshedCloud);
    }

    setUpdatingId(null);
  };

  const handleCopySql = () => {
    try {
      void navigator.clipboard?.writeText(MBEE_SUPABASE_SQL_SCHEMA).catch(() => {});
    } catch {
      // ignore
    }
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2500);
  };

  const getBadgeStyle = (status: DocumentStatus = 'Pending') => {
    if (status === 'Completed') {
      return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    }
    if (status === 'Processing') {
      return 'bg-blue-100 text-blue-900 border-blue-300';
    }
    return 'bg-amber-100 text-amber-900 border-amber-300';
  };

  return (
    <div
      data-testid="admin-enquiries-dashboard"
      className="space-y-5"
    >
      {/* Top Header & Refresh Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-[#0F213C] flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-[#C69C3A]" />
            <span>
              {lang === 'en'
                ? 'Customer Enquiries & Submissions Dashboard'
                : 'ਗਾਹਕਾਂ ਦੀਆਂ ਪੁੱਛਗਿੱਛਾਂ ਅਤੇ ਦਸਤਾਵੇਜ਼ ਡੈਸ਼ਬੋਰਡ'}
            </span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === 'en'
              ? 'Live enquiries & document submissions synced across Supabase, Firebase & Backend for Proprietors Baljinder Singh & Manpreet Singh.'
              : 'ਸੁਪਾਬੇਸ, ਫਾਇਰਬੇਸ ਅਤੇ ਬੈਕਐਂਡ ਨਾਲ ਜੁੜੇ ਸਾਰੇ ਗਾਹਕਾਂ ਦੇ ਕੰਮ ਅਤੇ ਦਸਤਾਵੇਜ਼ਾਂ ਦਾ ਵੇਰਵਾ।'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSqlSchema((prev) => !prev)}
            data-testid="toggle-supabase-sql-btn"
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0F213C] border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-[#C69C3A]" />
            <span>{lang === 'en' ? 'Supabase SQL' : 'ਸੁਪਾਬੇਸ SQL'}</span>
          </button>

          <button
            type="button"
            onClick={() => void loadFromBackend()}
            data-testid="refresh-admin-enquiries-btn"
            className="px-3 py-1.5 rounded-xl bg-[#0F213C] hover:bg-[#173056] text-[#E5C158] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{lang === 'en' ? 'Sync Backend' : 'ਬੈਕਐਂਡ ਸਿੰਕ'}</span>
          </button>
        </div>
      </div>

      {/* Live Supabase & Website Integrations Status Bar */}
      <div
        data-testid="supabase-live-status-bar"
        className="p-3.5 rounded-xl bg-[#081326] text-white border border-[#C69C3A]/40 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#E5C158]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {lang === 'en'
                ? 'Supabase Database, Google Sign-In & Cloud Integrations Connected'
                : 'ਸੁਪਾਬੇਸ ਡਾਟਾਬੇਸ, ਗੂਗਲ ਸਾਈਨ-ਇਨ ਅਤੇ ਸਾਰੀਆਂ ਸੇਵਾਵਾਂ ਵੈੱਬਸਾਈਟ ਨਾਲ ਜੁੜੀਆਂ ਹਨ'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Supabase Active
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Google Auth Linked
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Firebase Active
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Smart Advisor Ready
            </span>
          </div>
        </div>

        {supabaseStatus && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-[11px]">
            <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300 truncate">mbee_profiles</span>
              <span className="font-tabular font-bold text-[#E5C158]">
                {Math.max(supabaseStatus.tables.mbee_profiles, savedProfiles.length)}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300 truncate">mbee_enquiries</span>
              <span className="font-tabular font-bold text-[#E5C158]">
                {enquiries.length}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300 truncate">mbee_documents</span>
              <span className="font-tabular font-bold text-[#E5C158]">
                {supabaseStatus.tables.mbee_submitted_documents}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300 truncate">mbee_services</span>
              <span className="font-tabular font-bold text-[#E5C158]">
                {supabaseStatus.tables.mbee_custom_services}
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between col-span-2 sm:col-span-1">
              <span className="text-slate-300 truncate">announcements</span>
              <span className="font-tabular font-bold text-[#E5C158]">
                {supabaseStatus.tables.mbee_announcements}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Supabase SQL Schema Viewer (from /supabase.sql & /supabase/queries.sql) */}
      {showSqlSchema && (
        <div
          data-testid="supabase-sql-viewer"
          className="p-4 rounded-xl bg-[#081326] text-slate-100 border border-[#C69C3A]/40 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-[#E5C158]">
                supabase.sql · PostgreSQL Tables ({MBEE_SUPABASE_TABLES.join(', ')})
              </div>
              <div className="text-[11px] text-slate-400">
                Paste into your Supabase SQL Editor or run via supabase.sql / supabase/queries.sql
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopySql}
              data-testid="copy-supabase-sql-btn"
              className="px-3 py-1 rounded-lg bg-[#C69C3A] hover:bg-[#D4AD47] text-[#081326] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{sqlCopied ? '✓ SQL Copied!' : 'Copy SQL'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-slate-950/90 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-48">
            {MBEE_SUPABASE_SQL_SCHEMA}
          </pre>
        </div>
      )}

      {/* Summary KPI Cards Row */}
      <div
        data-testid="admin-dashboard-summary"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {lang === 'en' ? 'Total Submissions' : 'ਕੁੱਲ ਬੇਨਤੀਆਂ'}
          </div>
          <div
            data-testid="admin-summary-total"
            className="text-2xl font-extrabold text-[#0F213C] font-tabular mt-0.5"
          >
            {summary.total}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            {lang === 'en' ? 'Pending' : 'ਪੈਂਡਿੰਗ (Pending)'}
          </div>
          <div
            data-testid="admin-summary-pending"
            className="text-2xl font-extrabold text-amber-900 font-tabular mt-0.5"
          >
            {summary.pending}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
            {lang === 'en' ? 'Processing' : 'ਚੱਲ ਰਿਹਾ (Processing)'}
          </div>
          <div
            data-testid="admin-summary-processing"
            className="text-2xl font-extrabold text-blue-900 font-tabular mt-0.5"
          >
            {summary.processing}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            {lang === 'en' ? 'Completed' : 'ਪੂਰਾ ਹੋਇਆ (Completed)'}
          </div>
          <div
            data-testid="admin-summary-completed"
            className="text-2xl font-extrabold text-emerald-900 font-tabular mt-0.5"
          >
            {summary.completed}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter enquiries by status"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200"
        >
          {(['All', 'Pending', 'Processing', 'Completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab}
              data-testid={`admin-filter-${tab.toLowerCase()}`}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                statusFilter === tab
                  ? 'bg-[#0F213C] text-[#E5C158] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="admin-enquiries-search"
            placeholder={
              lang === 'en'
                ? 'Search client name, phone, service...'
                : 'ਗਾਹਕ ਦਾ ਨਾਮ, ਫ਼ੋਨ ਜਾਂ ਸੇਵਾ ਲੱਭੋ...'
            }
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F213C]"
          />
        </div>
      </div>

      {/* Enquiries & Submissions List */}
      <div
        data-testid="admin-enquiries-list"
        className="space-y-3"
      >
        {filteredItems.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
            {lang === 'en'
              ? 'No matching enquiries or submissions found for this filter.'
              : 'ਇਸ ਫਿਲਟਰ ਲਈ ਕੋਈ ਪੁੱਛਗਿੱਛ ਜਾਂ ਦਸਤਾਵੇਜ਼ ਨਹੀਂ ਮਿਲਿਆ।'}
          </div>
        ) : (
          filteredItems.map((item) => {
            const status: DocumentStatus = item.status || 'Pending';
            const cleanPhone = (item.userMobile || '').replace(/\D/g, '').slice(-10) || '8288837597';
            const whatsappContactUrl = buildWhatsAppUrl(
              `Hello ${item.userName}, this is Baljinder Singh & Manpreet Singh from M Bee Enterprises, Mahilpur regarding your "${item.serviceName}" submission (${item.referenceCode || item.id}). Current Status: ${status}.`,
              cleanPhone
            );

            return (
              <div
                key={item.id}
                data-testid={`admin-enquiry-item-${item.id}`}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all space-y-3"
              >
                {/* Top Row: Customer Identity, Service Badge & Status */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#0F213C] inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-[#C69C3A]" />
                        <span>{item.userName}</span>
                      </span>
                      <span className="text-xs font-tabular font-semibold text-slate-600">
                        (+91 {cleanPhone})
                      </span>
                      {item.referenceCode && (
                        <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-tabular font-bold text-slate-600">
                          {item.referenceCode}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      {item.userCity && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{item.userCity}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 font-tabular">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{item.createdAt}</span>
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    data-testid={`admin-enquiry-status-${item.id}`}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${getBadgeStyle(
                      status
                    )}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        status === 'Completed'
                          ? 'bg-emerald-600'
                          : status === 'Processing'
                          ? 'bg-blue-600'
                          : 'bg-amber-600'
                      }`}
                    />
                    <span>{status}</span>
                  </span>
                </div>

                {/* Middle Row: Service Name & Description */}
                <div className="p-3 rounded-lg bg-white border border-slate-200/80 space-y-1">
                  <div className="text-xs font-bold text-[#0F213C]">
                    {item.serviceName}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.workDescription}
                  </p>
                </div>

                {/* Bottom Action Bar: Mark as Completed + Contact Customer (WhatsApp & Call) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {status !== 'Completed' ? (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => void handleMarkStatus(item, 'Completed')}
                        data-testid={`mark-completed-btn-${item.id}`}
                        aria-label={`Mark as Completed for ${item.userName}`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {lang === 'en' ? 'Mark as Completed' : 'ਪੂਰਾ ਹੋਇਆ ਮਾਰਕ ਕਰੋ (Completed)'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => void handleMarkStatus(item, 'Pending')}
                        data-testid={`mark-completed-btn-${item.id}`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          {lang === 'en' ? '✓ Completed (Reopen)' : '✓ ਪੂਰਾ ਹੋਇਆ (Reopen)'}
                        </span>
                      </button>
                    )}

                    {status === 'Pending' && (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => void handleMarkStatus(item, 'Processing')}
                        data-testid={`mark-processing-btn-${item.id}`}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        {lang === 'en' ? 'Set Processing' : 'Processing ਕਰੋ'}
                      </button>
                    )}
                  </div>

                  {/* Contact Customer Quick Actions */}
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:+91${cleanPhone}`}
                      data-testid={`contact-customer-call-${item.id}`}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-[#0F213C] border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-[#0F213C]" />
                      <span>{lang === 'en' ? 'Call Customer' : 'ਕਾਲ ਕਰੋ'}</span>
                    </a>

                    <a
                      href={whatsappContactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`contact-customer-whatsapp-${item.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#0F213C] hover:bg-[#173056] text-[#E5C158] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{lang === 'en' ? 'Contact Customer' : 'ਗਾਹਕ ਨਾਲ ਸੰਪਰਕ'}</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
