'use client';

import React from 'react';

export interface VisionFilterState {
  search: string;
  outcome: string;
  failureCategory: string;
  split: string;
  quality: string;
  ruler: string;
}

interface MisclassificationFilterProps {
  filters: VisionFilterState;
  onFilterChange: (filters: VisionFilterState) => void;
  availableSplits: string[];
  totalCount: number;
  filteredCount: number;
}

export function MisclassificationFilter({
  filters,
  onFilterChange,
  availableSplits,
  totalCount,
  filteredCount,
}: MisclassificationFilterProps) {
  const update = (key: keyof VisionFilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasActiveFilters =
    filters.search !== '' ||
    filters.outcome !== 'ALL' ||
    filters.failureCategory !== 'ALL' ||
    filters.split !== 'ALL' ||
    filters.quality !== 'ALL' ||
    filters.ruler !== 'ALL';

  const resetFilters = () => {
    onFilterChange({
      search: '',
      outcome: 'ALL',
      failureCategory: 'ALL',
      split: 'ALL',
      quality: 'ALL',
      ruler: 'ALL',
    });
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6 backdrop-blur">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search image ID (e.g. derm_val_004)..."
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Outcome Filter */}
          <select
            value={filters.outcome}
            onChange={(e) => update('outcome', e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Outcomes</option>
            <option value="CORRECT">Correct Predictions</option>
            <option value="INCORRECT">Misclassifications</option>
            <option value="TRUE_POSITIVE">True Positives</option>
            <option value="FALSE_POSITIVE">False Positives</option>
            <option value="FALSE_NEGATIVE">False Negatives</option>
          </select>

          {/* Failure Category Filter */}
          <select
            value={filters.failureCategory}
            onChange={(e) => update('failureCategory', e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Error Modes</option>
            <option value="INCORRECT_HIGH_CONF">Overconfident Errors (&gt;70%)</option>
            <option value="INCORRECT_LOW_CONF">Low Confidence Errors</option>
            <option value="CORRECT_LOW_CONF">Uncertain Correct (&lt;70%)</option>
            <option value="CORRECT_HIGH_CONF">Confident Correct</option>
          </select>

          {/* Split Filter */}
          <select
            value={filters.split}
            onChange={(e) => update('split', e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Splits</option>
            {availableSplits.map((s) => (
              <option key={s} value={s}>
                Split: {s}
              </option>
            ))}
          </select>

          {/* Image Quality Filter */}
          <select
            value={filters.quality}
            onChange={(e) => update('quality', e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Sharpness</option>
            <option value="BLURRY">Blurry (&lt; 150)</option>
            <option value="SHARP">Sharp (&gt;= 150)</option>
          </select>

          {/* Confounder Filter */}
          <select
            value={filters.ruler}
            onChange={(e) => update('ruler', e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Artifacts</option>
            <option value="HAS_RULER">Has Scale Ruler Artifact</option>
            <option value="NO_RULER">No Ruler Artifact</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
        <span>
          Showing <strong className="text-white">{filteredCount}</strong> of{' '}
          <strong className="text-white">{totalCount}</strong> images
        </span>
      </div>
    </div>
  );
}
