import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Replace,
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import type { EditableText } from '../types/pdf';

export interface IndividualMatch {
  key: string;
  objectId: string;
  occurrenceIndex: number;
  obj: EditableText;
  startIndex: number;
  length: number;
  matchedText: string;
  pageNumber: number;
}

interface FindReplacePanelProps {
  isOpen: boolean;
  onClose: () => void;
  editableObjects: EditableText[];
  currentPage?: number;
  totalPages?: number;
  onReplaceOne: (obj: EditableText, newText: string) => Promise<void>;
  onReplaceAll: (matches: IndividualMatch[], replaceText: string) => Promise<void>;
  onMatchChange?: (activeMatchId: string | null, allMatchIds: string[], query: string, targetPage?: number) => void;
}

export const FindReplacePanel: React.FC<FindReplacePanelProps> = ({
  isOpen,
  onClose,
  editableObjects,
  onReplaceOne,
  onReplaceAll,
  onMatchChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [isReplacing, setIsReplacing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on open
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

  // Stably sort objects by page number, then vertical reading order (top to bottom), then horizontal (left to right)
  const sortedObjects = useMemo(() => {
    return [...editableObjects].sort((a, b) => {
      const pA = a.pageNumber || 1;
      const pB = b.pageNumber || 1;
      if (pA !== pB) return pA - pB;
      const yA = a.boundingBox?.y || 0;
      const yB = b.boundingBox?.y || 0;
      if (Math.abs(yA - yB) > 2) return yA - yB;
      const xA = a.boundingBox?.x || 0;
      const xB = b.boundingBox?.x || 0;
      return xA - xB;
    });
  }, [editableObjects]);

  // Compute matches naturally (case-insensitive, stable keys)
  const matches = useMemo(() => {
    const list: IndividualMatch[] = [];
    const trimmed = searchQuery.trim();
    if (!trimmed) return list;

    let regex: RegExp;
    try {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, 'gi');
    } catch {
      return list;
    }

    for (const obj of sortedObjects) {
      if (!obj.text) continue;
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      let occ = 0;
      while ((match = regex.exec(obj.text)) !== null) {
        list.push({
          key: `${obj.id}__occ_${occ}`,
          objectId: obj.id,
          occurrenceIndex: occ,
          obj,
          startIndex: match.index,
          length: match[0].length,
          matchedText: match[0],
          pageNumber: obj.pageNumber || 1,
        });
        occ++;
        if (regex.lastIndex === match.index) {
          regex.lastIndex++;
        }
      }
    }
    return list;
  }, [searchQuery, sortedObjects]);

  const safeIndex = matches.length > 0 ? ((matchIndex % matches.length) + matches.length) % matches.length : 0;
  const currentMatch = matches[safeIndex] ?? null;

  // Keep onMatchChange in a ref to avoid infinite dependency loops
  const onMatchChangeRef = useRef(onMatchChange);
  useEffect(() => {
    onMatchChangeRef.current = onMatchChange;
  });

  const lastActiveKeyRef = useRef<string | null>(null);
  const lastQueryRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen || !searchQuery.trim() || matches.length === 0) {
      if (lastActiveKeyRef.current !== null || lastQueryRef.current !== '') {
        lastActiveKeyRef.current = null;
        lastQueryRef.current = '';
        onMatchChangeRef.current?.(null, [], '');
      }
    } else {
      const activeKey = currentMatch?.key ?? null;
      const query = searchQuery.trim();
      const matchPage = currentMatch?.pageNumber;
      if (lastActiveKeyRef.current !== activeKey || lastQueryRef.current !== query) {
        lastActiveKeyRef.current = activeKey;
        lastQueryRef.current = query;
        const allObjectIds = Array.from(new Set(matches.map((m) => m.objectId)));
        onMatchChangeRef.current?.(activeKey, allObjectIds, query, matchPage);
      }
    }
  }, [isOpen, searchQuery, currentMatch?.key, currentMatch?.pageNumber, matches.length]);

  const goNext = () => setMatchIndex((i) => (matches.length ? (i + 1) % matches.length : 0));
  const goPrev = () => setMatchIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));

  const handleReplaceOne = async () => {
    if (!currentMatch || isReplacing) return;
    setIsReplacing(true);
    try {
      const { obj, startIndex, length } = currentMatch;
      const before = obj.text.substring(0, startIndex);
      const after = obj.text.substring(startIndex + length);
      const newFullText = before + replaceText + after;
      await onReplaceOne(obj, newFullText);
    } catch (err) {
      console.error('Replace one failed:', err);
    } finally {
      setIsReplacing(false);
    }
  };

  const handleReplaceAll = async () => {
    if (!matches.length || isReplacing) return;
    setIsReplacing(true);
    try {
      await onReplaceAll(matches, replaceText);
    } catch (err) {
      console.error('Replace all failed:', err);
    } finally {
      setIsReplacing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="find-replace-panel" id="find-replace-panel" role="dialog" aria-label="Find and Replace">
      {/* Row 1: Find Input & Stepper */}
      <div className="fr-row fr-find-row">
        <Search size={14} className="fr-row-icon" />
        <input
          ref={searchInputRef}
          type="search"
          className="fr-input"
          placeholder="Find in document…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setMatchIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) goPrev();
              else goNext();
            }
          }}
          autoComplete="off"
          spellCheck={false}
          id="fr-search-input"
        />

        {searchQuery.trim() && (
          <span className={`fr-count ${matches.length > 0 ? 'has-results' : 'no-results'}`}>
            {matches.length > 0 ? `${safeIndex + 1}/${matches.length}` : '0'}
          </span>
        )}

        {currentMatch && matches.length > 0 && (
          <span className="fr-page-pill" title={`Match is on Page ${currentMatch.pageNumber}`}>
            p.{currentMatch.pageNumber}
          </span>
        )}

        <div className="fr-stepper">
          <button
            type="button"
            className="fr-icon-btn"
            onClick={goPrev}
            disabled={matches.length === 0}
            title="Previous (Shift+Enter)"
            aria-label="Previous match"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className="fr-icon-btn"
            onClick={goNext}
            disabled={matches.length === 0}
            title="Next (Enter)"
            aria-label="Next match"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="fr-divider" />

        <button
          type="button"
          className="fr-icon-btn fr-close-btn"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
          id="btn-fr-close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Row 2: Replace Input & Action Buttons */}
      <div className="fr-row fr-replace-row">
        <Replace size={14} className="fr-row-icon" />
        <input
          type="text"
          className="fr-input"
          placeholder="Replace with…"
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleReplaceOne();
            }
          }}
          autoComplete="off"
          spellCheck={false}
          id="fr-replace-input"
        />

        <div className="fr-action-buttons">
          <button
            type="button"
            className="fr-action-btn"
            onClick={handleReplaceOne}
            disabled={!currentMatch || isReplacing}
            title="Replace current match"
            id="btn-fr-replace-one"
          >
            {isReplacing ? <Loader2 size={11} className="spin-icon" /> : null}
            <span>Replace</span>
          </button>

          <button
            type="button"
            className="fr-action-btn fr-action-btn-primary"
            onClick={handleReplaceAll}
            disabled={matches.length === 0 || isReplacing}
            title={`Replace all ${matches.length} occurrences`}
            id="btn-fr-replace-all"
          >
            {isReplacing ? <Loader2 size={11} className="spin-icon" /> : null}
            <span>All{matches.length > 0 ? ` (${matches.length})` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
