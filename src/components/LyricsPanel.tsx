import React, { useEffect, useRef } from 'react';
import { LyricLine } from '../types/studio';
import { getActiveLyricIndex } from '../utils/lyricsAndTags';

interface LyricsPanelProps {
  lyrics: LyricLine[];
  currentTime: number;
  enabled: boolean;
  onSeek: (time: number) => void;
  compact?: boolean;
  accentColor?: string;
}

export const LyricsPanel: React.FC<LyricsPanelProps> = ({
  lyrics,
  currentTime,
  enabled,
  onSeek,
  compact = false,
  accentColor = 'var(--accent)',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const activeIdx = getActiveLyricIndex(lyrics, currentTime);

  useEffect(() => {
    if (!enabled || activeIdx < 0) return;
    const container = containerRef.current;
    const activeEl = activeLineRef.current;
    if (!container || !activeEl) return;

    // Scroll smoothly inside the lyrics container only (never scroll the outer page)
    const targetTop =
      activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeIdx, enabled]);

  if (!enabled) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center px-3 select-none pointer-events-none">
        <span className="text-[11px] text-slate-400/75 tracking-wide">
          Lyrics hidden · Tap album cover to show
        </span>
      </div>
    );
  }

  if (!lyrics || lyrics.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center px-3 select-none">
        <span className="text-xs text-slate-400/80">
          No embedded lyrics · Hold album cover to edit lyrics
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-y-auto px-3 py-2 space-y-1.5 scroll-smooth"
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
      }}
    >
      <div className="h-3" />
      {lyrics.map((line, idx) => {
        const isActive = idx === activeIdx;
        const isPast = activeIdx >= 0 && idx < activeIdx;
        const clickable = line.time !== null;
        return (
          <button
            key={line.id}
            ref={isActive ? activeLineRef : undefined}
            type="button"
            disabled={!clickable}
            onClick={(e) => {
              e.stopPropagation();
              if (line.time !== null) onSeek(line.time);
            }}
            className={`w-full text-center block transition-all duration-200 rounded-md px-2 py-1 ${
              clickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'
            } ${compact ? 'text-xs leading-snug' : 'text-sm leading-relaxed'}`}
            style={{
              color: isActive ? '#FFFFFF' : isPast ? 'rgba(148,163,184,0.52)' : 'rgba(226,232,240,0.68)',
              fontWeight: isActive ? 700 : 400,
              transform: isActive ? 'scale(1.04)' : 'scale(1)',
              textShadow: isActive ? `0 0 18px ${accentColor}` : 'none',
            }}
          >
            {line.text}
          </button>
        );
      })}
      <div className="h-4" />
    </div>
  );
};
