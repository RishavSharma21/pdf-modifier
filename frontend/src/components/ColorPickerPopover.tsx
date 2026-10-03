import React, { useState, useEffect, useRef } from 'react';
import { Check, RotateCcw, Pipette } from 'lucide-react';

interface ColorPickerPopoverProps {
  currentColor: string;
  originalColor: string;
  onSelectColor: (hex: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface ColorOption {
  label: string;
  hex: string;
}

const COLOR_GROUPS: { title: string; colors: ColorOption[] }[] = [
  {
    title: 'Neutrals & Grayscale',
    colors: [
      { label: 'Deep Black', hex: '#000000' },
      { label: 'Charcoal', hex: '#1e293b' },
      { label: 'Dark Slate', hex: '#475569' },
      { label: 'Muted Gray', hex: '#94a3b8' },
      { label: 'Light Border', hex: '#e2e8f0' },
      { label: 'Pure White', hex: '#ffffff' },
    ],
  },
  {
    title: 'Professional Corporate',
    colors: [
      { label: 'Executive Navy', hex: '#1e3a8a' },
      { label: 'Modern Royal', hex: '#2563eb' },
      { label: 'Hyperlink Blue', hex: '#0b57d0' },
      { label: 'Teal Accent', hex: '#0d9488' },
      { label: 'Cyan Ocean', hex: '#0284c7' },
      { label: 'Deep Indigo', hex: '#4338ca' },
    ],
  },
  {
    title: 'Accents & Highlights',
    colors: [
      { label: 'Forest Green', hex: '#15803d' },
      { label: 'Emerald Green', hex: '#16a34a' },
      { label: 'Warm Amber', hex: '#d97706' },
      { label: 'Crimson Red', hex: '#dc2626' },
      { label: 'Wine Maroon', hex: '#991b1b' },
      { label: 'Royal Purple', hex: '#7e22ce' },
    ],
  },
];

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  currentColor,
  originalColor,
  onSelectColor,
  isOpen,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const [hexInput, setHexInput] = useState<string>(currentColor.toUpperCase());

  // Keep hexInput in sync when currentColor changes from outside
  useEffect(() => {
    setHexInput(currentColor.toUpperCase());
  }, [currentColor]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const normalizedCurrent = currentColor.toLowerCase();
  const normalizedOriginal = originalColor.toLowerCase();
  const isOriginal = normalizedCurrent === normalizedOriginal;

  const handleHexChange = (val: string) => {
    let clean = val.trim();
    if (!clean.startsWith('#')) {
      clean = '#' + clean;
    }
    setHexInput(clean.toUpperCase());

    // Validate 6-digit or 3-digit hex
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) {
      onSelectColor(clean.toLowerCase());
    }
  };

  return (
    <div
      ref={popoverRef}
      className="pro-color-popover"
      onClick={(e) => e.stopPropagation()}
      id="pro-color-picker-popover"
    >
      {/* Popover Header with Original Color Reset */}
      <div className="pro-color-header">
        <span className="pro-color-title">Text Color</span>
        <button
          type="button"
          className={`pro-color-reset-chip ${isOriginal ? 'active' : ''}`}
          onClick={() => onSelectColor(originalColor)}
          title={`Reset to original font color (${originalColor})`}
        >
          <span
            className="pro-color-chip-swatch"
            style={{ backgroundColor: originalColor }}
          />
          <span>Original</span>
          <RotateCcw size={11} className="pro-color-reset-icon" />
        </button>
      </div>

      {/* Live Preview & Hex Input Bar */}
      <div className="pro-color-input-row">
        <div
          className="pro-color-current-preview"
          style={{ backgroundColor: currentColor }}
          title={`Active: ${currentColor}`}
        />
        <div className="pro-color-hex-wrapper">
          <span className="pro-color-hex-prefix">HEX</span>
          <input
            type="text"
            className="pro-color-hex-input"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            maxLength={7}
            placeholder="#000000"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          className="pro-color-custom-btn"
          onClick={() => nativePickerRef.current?.click()}
          title="Open Custom Spectrum Picker"
        >
          <Pipette size={14} />
          <input
            ref={nativePickerRef}
            type="color"
            value={currentColor}
            onChange={(e) => {
              onSelectColor(e.target.value);
              setHexInput(e.target.value.toUpperCase());
            }}
            className="pro-color-hidden-native"
          />
        </button>
      </div>

      {/* Curated Color Palettes */}
      <div className="pro-color-palettes">
        {COLOR_GROUPS.map((group) => (
          <div key={group.title} className="pro-color-section">
            <div className="pro-color-section-label">{group.title}</div>
            <div className="pro-color-grid">
              {group.colors.map((c) => {
                const isSelected = normalizedCurrent === c.hex.toLowerCase();
                const isLight = c.hex === '#ffffff' || c.hex === '#e2e8f0';
                return (
                  <button
                    key={c.hex}
                    type="button"
                    className={`pro-color-swatch ${isSelected ? 'selected' : ''} ${isLight ? 'light-swatch' : ''}`}
                    style={{ backgroundColor: c.hex }}
                    onClick={() => {
                      onSelectColor(c.hex);
                      setHexInput(c.hex.toUpperCase());
                    }}
                    title={`${c.label} (${c.hex})`}
                    aria-label={c.label}
                  >
                    {isSelected && (
                      <Check
                        size={12}
                        strokeWidth={3}
                        className={isLight ? 'check-dark' : 'check-light'}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
