import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['Ctrl', 'Z'], label: 'Undo last edit' },
  { keys: ['Ctrl', 'Y'], label: 'Redo last edit' },
  { keys: ['Ctrl', 'Shift', 'Z'], label: 'Redo last edit (alternate)' },
  { keys: ['Ctrl', 'F'], label: 'Open Find & Replace' },
  { keys: ['Ctrl', '+'], label: 'Zoom in' },
  { keys: ['Ctrl', '-'], label: 'Zoom out' },
  { keys: ['Ctrl', '0'], label: 'Fit to Width (Best Editing Ratio)' },
  { keys: ['Ctrl', '9'], label: 'Balanced View (Comfortable Overview)' },
  { keys: ['← / →'], label: 'Previous / Next page' },
  { keys: ['Ctrl', 'Shift', 'L'], label: 'Toggle Light / Dark theme' },
  { keys: ['Enter'], label: 'Apply inline edit' },
  { keys: ['Esc'], label: 'Cancel inline edit / close panel' },
];

export const ShortcutsPanel: React.FC<ShortcutsPanelProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()} id="shortcuts-panel">
        <div className="shortcuts-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={15} />
            <span className="shortcuts-title">Keyboard Shortcuts</span>
          </div>
          <button className="fr-close-btn" onClick={onClose} id="btn-shortcuts-close">
            <X size={14} />
          </button>
        </div>
        <div className="shortcuts-list">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="shortcut-row">
              <span className="shortcut-label">{s.label}</span>
              <div className="shortcut-keys">
                {s.keys.map((k, ki) => (
                  <React.Fragment key={ki}>
                    <kbd className="kbd">{k}</kbd>
                    {ki < s.keys.length - 1 && <span className="kbd-plus">+</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
