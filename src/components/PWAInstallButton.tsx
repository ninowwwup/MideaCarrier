import React, { useState } from 'react';
import { Download, Smartphone, X, Check, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Se já estiver rodando instalado como app, não precisa exibir
  if (isInstalled) {
    return null;
  }

  // Fluxo Desktop / Chrome / Android
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="p-2 rounded-xl text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition-all shadow-2xs active:scale-95"
        title="Instalar aplicativo MIGOU (PWA)"
        aria-label="Instalar aplicativo MIGOU"
      >
        <Smartphone className="w-4 h-4 text-emerald-600" />
      </button>
    );
  }

  // Fluxo iOS Safari (iPhone / iPad)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="p-2 rounded-xl text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition-all shadow-2xs active:scale-95"
          title="Instalar aplicativo no iPhone ou iPad (PWA)"
          aria-label="Instalar no iOS"
        >
          <Smartphone className="w-4 h-4 text-emerald-600" />
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#0083CA]" />
                  Instalar no iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-600 space-y-2 mb-4">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#00609C] flex items-center justify-center font-bold shrink-0 text-[10px]">
                    1
                  </span>
                  <span>
                    Toque no botão <strong>Compartilhar</strong> (ícone com quadrado e seta para cima <Share className="w-3 h-3 inline text-blue-600" />) na barra do Safari.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#00609C] flex items-center justify-center font-bold shrink-0 text-[10px]">
                    2
                  </span>
                  <span>
                    Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-[#0083CA] py-2 text-xs font-bold text-white hover:bg-[#0070b0] transition"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
