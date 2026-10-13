'use client';

import React, { useState } from 'react';
import type { VisionRecord } from '@/core/domain/vision-types';
import { ImageDetailModal } from './image-detail-modal';

interface ImageGalleryProps {
  records: VisionRecord[];
}

export function ImageGallery({ records }: ImageGalleryProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [selectedRecord, setSelectedRecord] = useState<VisionRecord | null>(null);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const pageRecords = records.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-4">
      {/* Gallery Grid */}
      {records.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <p className="text-sm">No images match the active filter criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {pageRecords.map((record) => {
            const isCorrect = String(record.yTrue) === String(record.yPred);
            const isOverconfident = record.failureCategory === 'INCORRECT_HIGH_CONF';
            const hasRuler = (record.metadata?.has_ruler as number) === 1;
            const sharpness = record.qualityProfile?.sharpness;
            const isBlurry = sharpness !== undefined && sharpness < 150;

            return (
              <div
                key={record.imageId}
                onClick={() => setSelectedRecord(record)}
                className={`group cursor-pointer rounded-xl border p-2.5 transition-all duration-150 hover:shadow-lg ${
                  isOverconfident
                    ? 'bg-rose-950/20 border-rose-800/80 hover:border-rose-500 hover:bg-rose-950/40'
                    : !isCorrect
                    ? 'bg-amber-950/10 border-amber-800/60 hover:border-amber-500 hover:bg-amber-950/30'
                    : 'bg-slate-900/60 border-slate-800 hover:border-indigo-500 hover:bg-slate-900'
                }`}
              >
                {/* Thumbnail Image */}
                <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-800/80 mb-2 flex items-center justify-center">
                  {record.thumbnailDataUrl ? (
                    <img
                      src={record.thumbnailDataUrl}
                      alt={record.imageId}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-[10px] text-slate-600 font-mono">No Image</div>
                  )}

                  {/* Overconfident Flag Overlay */}
                  {isOverconfident && (
                    <div className="absolute top-1 right-1 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                      OVERCONFIDENT
                    </div>
                  )}

                  {/* Ruler Badge Overlay */}
                  {hasRuler && (
                    <div className="absolute bottom-1 left-1 bg-amber-500/90 text-slate-950 text-[9px] font-bold px-1 py-0.2 rounded shadow">
                      RULER
                    </div>
                  )}
                </div>

                {/* Card Meta */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-300 font-medium truncate max-w-[85px]">
                      {record.imageId}
                    </span>
                    {record.split && (
                      <span className="text-[9px] px-1 rounded uppercase bg-slate-800 text-slate-400">
                        {record.split.slice(0, 4)}
                      </span>
                    )}
                  </div>

                  {/* Predictions Tag Bar */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">
                      T: <strong className="text-slate-200">{String(record.yTrue)}</strong>
                    </span>
                    <span className="text-slate-400">
                      P:{' '}
                      <strong className={isCorrect ? 'text-emerald-400' : 'text-rose-400'}>
                        {String(record.yPred)}
                      </strong>
                    </span>
                  </div>

                  {/* Sharpness indicator */}
                  {sharpness !== undefined && (
                    <div className="flex items-center justify-between text-[9px] font-mono pt-1 border-t border-slate-800/60">
                      <span className="text-slate-500">Sharpness:</span>
                      <span className={isBlurry ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                        {sharpness.toFixed(0)} {isBlurry && '⚠'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {records.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={48}>48</option>
            </select>
            <span>
              Showing {startIndex + 1}–{Math.min(startIndex + pageSize, records.length)} of {records.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validPage <= 1}
              className="px-3 py-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200"
            >
              Previous
            </button>
            <span className="px-2 font-mono">
              Page {validPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validPage >= totalPages}
              className="px-3 py-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <ImageDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      )}
    </div>
  );
}
