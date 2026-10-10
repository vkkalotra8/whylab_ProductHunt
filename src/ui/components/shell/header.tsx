'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BookOpen, Database, Menu, Settings, ShieldCheck, X } from 'lucide-react';
import ThemeToggle from './theme-toggle';

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route transition
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    { href: '/', label: 'Overview', fullLabel: 'Overview', icon: ShieldCheck },
    { href: '/workspace', label: 'Workspace', fullLabel: 'Workspace', icon: Database },
    { href: '/investigate', label: 'Studio', fullLabel: 'Investigation Studio', icon: Activity },
    { href: '/learn', label: 'Knowledge', fullLabel: 'Knowledge Center', icon: BookOpen },
    { href: '/settings', label: 'Settings', fullLabel: 'Settings', icon: Settings },
  ];

  return (
    <header className="top-header" role="banner">
      <div className="container-wide header-inner">
        {/* Brand Section */}
        <div className="header-left">
          <Link href="/" className="brand-section" aria-label="WhyLab Home">
            <div className="brand-logo-mark" aria-hidden="true">
              λ
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="brand-title">WhyLab</span>
                <span className="brand-badge">2.0</span>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Links — Single Concise Label (No Concatenation) */}
          <nav className="header-nav" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-1px', flexShrink: 0 }} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* System Status Indicators & Actions */}
        <div className="header-actions">
          <div className="badge badge-success badge-math-engine" title="Local Deterministic Engine is initialized and validated">
            <span className="status-dot status-dot-success"></span>
            <span className="badge-text-full">Deterministic Engine: Ready</span>
            <span className="badge-text-compact">Engine: Ready</span>
          </div>

          {/* Color Theme Toggle */}
          <ThemeToggle />

          <Link href="/investigate" className="btn btn-primary btn-sm btn-new-investigation">
            <Activity size={13} />
            <span className="btn-text-full">New Investigation</span>
            <span className="btn-text-compact">New</span>
          </Link>

          {/* Mobile Hamburger Menu Toggle */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer" role="menu" aria-label="Mobile Navigation">
          <div className="container" style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                    role="menuitem"
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={16} style={{ color: isActive ? 'var(--primary)' : 'var(--text-muted)' }} />
                    <span>{item.fullLabel || item.label}</span>
                    {isActive && (
                      <span className="badge badge-accent" style={{ marginLeft: 'auto', fontSize: '11px', padding: '1px 6px' }}>
                        Active
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div
              style={{
                marginTop: 'var(--space-3)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <ThemeToggle showLabel />
              </div>
              <Link
                href="/investigate"
                onClick={() => setMobileMenuOpen(false)}
                className="btn btn-primary btn-sm"
              >
                <Activity size={13} />
                Launch Studio
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
