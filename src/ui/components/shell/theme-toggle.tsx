'use client';

import React from 'react';
import { useTheme } from '@/ui/context/theme-context';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function ThemeToggle({ showLabel = false, className = '', style }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle-btn ${className}`}
      title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      style={style}
    >
      {isDark ? (
        <Sun size={15} className="theme-toggle-icon" style={{ color: '#fbbf24' }} />
      ) : (
        <Moon size={15} className="theme-toggle-icon" style={{ color: '#6366f1' }} />
      )}
      {showLabel && (
        <span style={{ fontSize: '12.5px', fontWeight: 500 }}>
          {isDark ? 'Light Theme' : 'Dark Theme'}
        </span>
      )}
    </button>
  );
}
