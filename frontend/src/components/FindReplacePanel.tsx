import React, { useState, useEffect, useRef } from 'react';
import { Search, Replace, X, ChevronUp, ChevronDown, ArrowRight, FileText, Loader2 } from 'lucide-react';
import type { EditableText } from '../types/pdf';

interface FindReplacePanelProps {
  isOpen: boolean;
  onClose: () => void;
  editableObjects: EditableText[];
  currentPage?: number;
  onReplaceOne: (obj: EditableText, newText: string) => Promise<void>;
  onMatchChange?: (activeMatchId: string | null, allMatchIds: string[], query: string) => void;
}

export const FindReplacePanel: React.FC<FindReplacePanelProps> = ({
  isOpen,
  onClose,
  editableObjects,
  currentPage,
  onReplaceOne,
  onMatchChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [isReplacing, setIsReplacing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  interface IndividualMatch {
    key: string;
    objectId: string;
    occurrenceIndex: number;
    obj: EditableText;
    startIndex: number;
    length: number;
  }

  const matches: IndividualMatch[] = [];
  const trimmed = searchQuery.trim();
  if (trimmed) {
    const lowerQuery = trimmed.toLowerCase();
    const qLen = lowerQuery.length;
    for (const obj of editableObjects) {
      const lowerText = obj.text.toLowerCase();
      let pos = 0;
      let occ = 0;
      while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
        matches.push({
          key: `${obj.id}__occ_${occ}`,
          objectId: obj.id,
          occurrenceIndex: occ,
          obj,
          startIndex: pos,
          length: qLen,
        });
        occ++;
        pos += qLen;
      }
    }
  }

  const safeIndex = matches.length > 0 ? matchIndex % matches.length : 0;
  const currentMatch = matches[safeIndex] ?? null;

  // Guard against infinite re-render loops:
  // 1. Keep onMatchChange in a ref so changes to the prop function never trigger effect
  // 2. Only fire when the active match key or query actually changes
  const onMatchChangeRef = useRef(onMatchChange);
  useEffect(() => {
    onMatchChangeRef.current = onMatchChange;
  });

  const lastActiveKeyRef = useRef<string | null>(null);
  const lastQueryRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen || !trimmed || matches.length === 0) {
      if (lastActiveKeyRef.current !== null || lastQueryRef.current !== '') {
        lastActiveKeyRef.current = null;
        lastQueryRef.current = '';
        onMatchChangeRef.current?.(null, [], '');
      }
    } else {
      const activeKey = currentMatch?.key ?? null;
      if (lastActiveKeyRef.current !== activeKey || lastQueryRef.current !== trimmed) {
        lastActiveKeyRef.current = activeKey;
        lastQueryRef.current = trimmed;
        const allObjectIds = Array.from(new Set(matches.map((m) => m.objectId)));
        onMatchChangeRef.current?.(activeKey, allObjectIds, trimmed);
      }
    }
  }, [isOpen, trimmed, currentMatch?.key, matches.length]);

  const goNext = () => setMatchIndex((i) => (matches.length ? (i + 1) % matches.length : 0));
  const goPrev = () => setMatchIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));

  const handleReplaceOne = async () => {
    if (!currentMatch || !replaceText) return;
    setIsReplacing(true);
    try {
      const { obj, startIndex, length } = currentMatch;
      const before = obj.text.substring(0, startIndex);
      const after = obj.text.substring(startIndex + length);
      const newFullText = before + replaceText + after;
      await onReplaceOne(obj, newFullText);
      goNext();
    } finally {
      setIsReplacing(false);
    }
  };

  const handleReplaceAll = async () => {
    if (!matches.length || !replaceText) return;
    setIsReplacing(true);
    try {
      const uniqueObjects = Array.from(new Set(matches.map((m) => m.obj)));
      const escapedQuery = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'gi');
      for (const obj of uniqueObjects) {
        const newFullText = obj.text.replace(regex, replaceText);
        await onReplaceOne(obj, newFullText);
      }
    } finally {
      setIsReplacing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="find-replace-panel" id="find-replace-panel">
      {/* Sleek Modern Header */}
      <div className="fr-header">
        <div className="fr-title-group">
          <div className="fr-title-icon-badge">
            <Search size={13} />
          </div>
          <span className="fr-title">Find &amp; Replace</span>
          {currentPage !== undefined && (
            <span className="fr-scope-badge" title="Search is currently scoped to page">
              <FileText size={10} />
              <span>Page {currentPage}</span>
            </span>
          )}
        </div>
        <div className="fr-header-actions">
          <span className="fr-shortcut-hint">Esc</span>
          <button className="fr-close-btn" onClick={onClose} title="Close (Esc)" id="btn-fr-close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Hidden Empty Datalist — 100% suppresses browser autofill & history dropdown */}
      <datalist id="fr-empty-datalist" />

      <form className="fr-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        {/* Row 1: Search Field with Embedded Stepper & Match Badge */}
        <div className="fr-field-group">
          <div className="fr-input-container">
            <Search size={14} className="fr-input-leading-icon" />
            <input
              ref={searchInputRef}
              type="search"
              className="fr-text-input"
              placeholder="Search in document..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setMatchIndex(0); }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              list="fr-empty-datalist"
              aria-autocomplete="none"
              data-lpignore="true"
              data-form-type="other"
              name="pdf_search_query_no_history"
              id="fr-search-input-v2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    goPrev();
                  } else {
                    goNext();
                  }
                }
              }}
            />

            {/* Trailing accessories: Clear button, Match Counter, and Up/Down Stepper */}
            <div className="fr-input-trailing">
              {searchQuery && (
                <button
                  type="button"
                  className="fr-clear-btn"
                  onClick={() => { setSearchQuery(''); setMatchIndex(0); searchInputRef.current?.focus(); }}
                  title="Clear search"
                >
                  <X size={11} />
                </button>
              )}

              {trimmed && (
                <span className={`fr-count-badge ${matches.length > 0 ? 'has-matches' : 'no-matches'}`}>
                  {matches.length > 0 ? `${safeIndex + 1}/${matches.length}` : '0 found'}
                </span>
              )}

              <div className="fr-nav-stepper">
                <button
                  type="button"
                  className="fr-stepper-btn"
                  onClick={goPrev}
                  disabled={matches.length === 0}
                  title="Previous match (Shift+Enter)"
                  aria-label="Previous match"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  className="fr-stepper-btn"
                  onClick={goNext}
                  disabled={matches.length === 0}
                  title="Next match (Enter)"
                  aria-label="Next match"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Replace Field with Full-Width Alignment */}
        <div className="fr-field-group">
          <div className="fr-input-container">
            <Replace size={14} className="fr-input-leading-icon" />
            <input
              type="text"
              className="fr-text-input"
              placeholder="Replace with..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleReplaceOne();
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              list="fr-empty-datalist"
              aria-autocomplete="none"
              data-lpignore="true"
              data-form-type="other"
              name="pdf_replace_text_no_history"
              id="fr-replace-input-v2"
            />

            {replaceText && (
              <div className="fr-input-trailing">
                <button
                  type="button"
                  className="fr-clear-btn"
                  onClick={() => setReplaceText('')}
                  title="Clear replacement text"
                >
                  <X size={11} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Cohesive Actions Toolbar */}
        <div className="fr-actions-row">
          <div className="fr-shortcuts-hint">
            <span>Jump <kbd>↵</kbd> <kbd>⇧↵</kbd></span>
          </div>

          <div className="fr-btn-group">
            <button
              type="button"
              className="fr-btn fr-btn-secondary"
              onClick={handleReplaceOne}
              disabled={!currentMatch || !replaceText || isReplacing}
              title="Replace current highlighted match"
              id="btn-fr-replace-one"
            >
              <ArrowRight size={12} />
              <span>Replace</span>
            </button>

            <button
              type="button"
              className="fr-btn fr-btn-primary"
              onClick={handleReplaceAll}
              disabled={matches.length === 0 || !replaceText || isReplacing}
              title="Replace all occurrences on this page"
              id="btn-fr-replace-all"
            >
              {isReplacing ? (
                <>
                  <Loader2 size={13} className="spin-icon" />
                  <span>Replacing...</span>
                </>
              ) : (
                <>
                  <span>Replace All</span>
                  {matches.length > 0 && (
                    <span className="fr-btn-count-pill">{matches.length}</span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Row 4: Elegant Context Snippet when Active */}
      {currentMatch && searchQuery && (
        <div className="fr-preview-card">
          <div className="fr-preview-meta">
            <span className="fr-preview-dot" />
            <span className="fr-preview-title">Match {safeIndex + 1} of {matches.length}</span>
          </div>
          <div className="fr-preview-snippet" title={currentMatch.obj.text}>
            &ldquo;{currentMatch.obj.text}&rdquo;
          </div>
        </div>
      )}
    </div>
  );
};
