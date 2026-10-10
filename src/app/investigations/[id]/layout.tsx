'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import Breadcrumbs from '@/ui/components/shell/breadcrumbs';
import {
  Activity,
  ArrowLeft,
  FileText,
  GitBranch,
  ShieldCheck,
  Sliders,
} from 'lucide-react';

export default function InvestigationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : (rawId ?? 'inv_active');

  const tabs = [
    { href: `/investigations/${id}`, label: 'Overview', icon: Activity, exact: true },
    { href: `/investigations/${id}/evidence`, label: 'Evidence & Diagnostics', icon: FileText },
    { href: `/investigations/${id}/hypotheses`, label: 'Hypotheses & Falsification', icon: GitBranch },
    { href: `/investigations/${id}/repair`, label: 'Repair Lab', icon: Sliders },
    { href: `/investigations/${id}/report`, label: 'Incident Report', icon: ShieldCheck },
  ];

  return (
    <div style={{ paddingBottom: 'var(--space-16)' }}>
      <Breadcrumbs
        items={[
          { label: 'workspace', href: '/workspace' },
          { label: 'investigations', href: '/workspace' },
          { label: id },
        ]}
      />

      <div className="container-wide" style={{ paddingTop: 'var(--space-6)' }}>
        {/* Investigation Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
              <Link href="/workspace" className="btn btn-secondary btn-sm" title="Back to Workspace">
                <ArrowLeft size={13} />
                Workspace
              </Link>
              <h1
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                Investigation Deep-Dive
              </h1>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {id}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="badge badge-success">
              <span className="status-dot status-dot-success"></span>
              Deterministic Verification: Passed
            </span>
            <Link href="/investigate" className="btn btn-secondary btn-sm">
              New Studio Session
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            borderBottom: '1px solid var(--border-default)',
            marginBottom: 'var(--space-6)',
            overflowX: 'auto',
          }}
          aria-label="Investigation Sub-pages"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: '-1px',
                  textDecoration: 'none',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={14} />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Main Routed Content */}
        <main>{children}</main>
      </div>
    </div>
  );
}
