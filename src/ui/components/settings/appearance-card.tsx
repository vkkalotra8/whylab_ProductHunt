'use client';

import React from 'react';
import { useTheme } from '@/ui/context/theme-context';
import { Moon, Sun, Palette } from 'lucide-react';

export default function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="card card-elevated" style={{ marginBottom: 'var(--space-8)' }}>
      <div className="card-header">
        <div className="card-title">
          <Palette size={16} />
          Appearance &amp; Color Theme
        </div>
        <span className="badge badge-accent">
          {theme === 'dark' ? 'Dark Grid Active' : 'Light Technical Active'}
        </span>
      </div>

      <div className="card-body">
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
          Customize your visual workbench environment. All typography, contrast ratios, graphs, and indicators adapt instantly with zero visibility loss.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          {/* Dark Mode Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setTheme('dark')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTheme('dark')}
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: theme === 'dark' ? '2px solid var(--primary)' : '1px solid var(--border-default)',
              backgroundColor: '#090d16',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Moon size={16} style={{ color: '#6366f1' }} />
                <strong style={{ fontSize: 'var(--text-sm)', color: '#f8fafc' }}>Dark Theme</strong>
              </div>
              {theme === 'dark' && <span className="badge badge-success">Active</span>}
            </div>
            <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: 0 }}>
              Developer-First Dark Grid. Calibrated for extended diagnostic and engineering sessions.
            </p>
          </div>

          {/* Light Mode Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setTheme('light')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTheme('light')}
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: theme === 'light' ? '2px solid var(--primary)' : '1px solid var(--border-default)',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Sun size={16} style={{ color: '#f59e0b' }} />
                <strong style={{ fontSize: 'var(--text-sm)', color: '#0f172a' }}>Light Theme</strong>
              </div>
              {theme === 'light' && <span className="badge badge-success">Active</span>}
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>
              Clean Technical White Theme. Crisp, high-contrast typography and clear daytime visibility.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
