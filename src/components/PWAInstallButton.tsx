import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--accent-border)] text-xs font-medium text-[var(--accent-text)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        title="Install [ P.U.R MUSiCLiGHT ] App"
      >
        <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="hidden sm:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm bg-[#141821] border border-white/10 rounded-2xl p-5 space-y-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-bold text-white">
                  Install [ P.U.R MUSiCLiGHT ]
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari&apos;s toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[40px] rounded-xl bg-[var(--accent)] text-slate-950 text-xs font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
