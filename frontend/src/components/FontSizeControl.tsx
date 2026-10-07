import React, { useState, useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';

interface FontSizeControlProps {
  fontSize: number;
  onFontSizeChange: (newSize: number) => void;
  min?: number;
  max?: number;
  step?: number;
  idPrefix?: string;
}

export const FontSizeControl: React.FC<FontSizeControlProps> = ({
  fontSize,
  onFontSizeChange,
  min = 6,
  max = 96,
  step = 1,
  idPrefix = 'subbar',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(Math.round(fontSize * 10) / 10));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(Math.round(fontSize * 10) / 10));
    }
  }, [fontSize, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitValue = () => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, Math.round(parsed * 10) / 10));
      onFontSizeChange(clamped);
      setInputValue(String(clamped));
    } else {
      setInputValue(String(Math.round(fontSize * 10) / 10));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      setInputValue(String(Math.round(fontSize * 10) / 10));
    }
  };

  const rounded = Math.round(fontSize * 10) / 10;

  return (
    <div className="insert-size-stepper" title="Font size (Click number to type directly)">
      <button
        type="button"
        className="size-step-btn"
        onClick={() => onFontSizeChange(Math.max(min, Math.round((fontSize - step) * 10) / 10))}
        disabled={fontSize <= min}
        aria-label="Decrease font size"
        id={`btn-${idPrefix}-decrease-font`}
      >
        <Minus size={11} />
      </button>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="size-display-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitValue}
          onKeyDown={handleKeyDown}
          aria-label="Font size in points"
          maxLength={4}
        />
      ) : (
        <button
          type="button"
          className="size-display-label is-clickable"
          onClick={() => setIsEditing(true)}
          aria-label="Edit font size"
        >
          {rounded} pt
        </button>
      )}

      <button
        type="button"
        className="size-step-btn"
        onClick={() => onFontSizeChange(Math.min(max, Math.round((fontSize + step) * 10) / 10))}
        disabled={fontSize >= max}
        aria-label="Increase font size"
        id={`btn-${idPrefix}-increase-font`}
      >
        <Plus size={11} />
      </button>
    </div>
  );
};
