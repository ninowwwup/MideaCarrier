import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Smartphone,
  X,
  Share,
  MoreVertical,
  BellRing,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { subscribeToPushNotifications, triggerPushTest } from '../services/pushNotification';
import { unlockAudioNow } from '../utils/audioAlert';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [notifStatusMsg, setNotifStatusMsg] = useState<string | null>(null);

  const handleClickInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  const handleActivateAndTestMobileNotifications = async () => {
    await unlockAudioNow();
    const sub = await subscribeToPushNotifications();
    if (sub.success) {
      await triggerPushTest();
      setNotifStatusMsg(
        'Notificações e alertas sonoros ativados neste aparelho! Você receberá alertas em tempo real.'
      );
    } else {
      setNotifStatusMsg(
        sub.error || 'Permita as notificações nas configurações do navegador/aparelho.'
      );
    }
  };

  const modalContent = showGuideModal ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in"
      onClick={() => setShowGuideModal(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#002664] to-[#00609C] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">
                MIGOU Mobile PWA & Notificações
              </h3>
              <p className="text-[11px] text-cyan-100">
                Use no celular/coletor como aplicativo nativo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuideModal(false)}
            className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Status de Instalação */}
          {isInstalled ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>O MIGOU já está rodando instalado no modo App (PWA)!</span>
            </div>
          ) : isInstallable ? (
            <button
              type="button"
              onClick={async () => {
                await install();
                setShowGuideModal(false);
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Instalar Aplicativo MIGOU Agora (1 Clique)</span>
            </button>
          ) : null}

          {/* Guia Android / Chrome */}
          {!isIOS && !isInstalled && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-extrabold text-[#002664] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#0083CA]" />
                <span>Como instalar no Android (Chrome / Edge / Samsung):</span>
              </div>
              <div className="text-xs text-slate-600 space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#00609C] flex items-center justify-center font-bold shrink-0 text-[10px]">
                    1
                  </span>
                  <span>
                    Toque no menu de <strong>3 pontinhos</strong> (
                    <MoreVertical className="w-3.5 h-3.5 inline text-slate-700" />) no canto superior do navegador.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#00609C] flex items-center justify-center font-bold shrink-0 text-[10px]">
                    2
                  </span>
                  <span>
                    Selecione <strong>"Instalar aplicativo"</strong> ou{' '}
                    <strong>"Adicionar à tela inicial"</strong>.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Guia iPhone / iOS Safari */}
          {!isInstalled && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-extrabold text-[#002664] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#0083CA]" />
                <span>Como instalar no iPhone / iPad (Safari):</span>
              </div>
              <div className="text-xs text-slate-600 space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#00609C] flex items-center justify-center font-bold shrink-0 text-[10px]">
                    1
                  </span>
                  <span>
                    Toque no botão <strong>Compartilhar</strong> (
                    <Share className="w-3.5 h-3.5 inline text-blue-600" />) na barra inferior do Safari.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#00609C] flex items-center justify-center font-bold shrink-0 text-[10px]">
                    2
                  </span>
                  <span>
                    Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Ativação de Notificações Nativas & Som no PWA */}
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2.5">
            <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
              <BellRing className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Notificações & Som em Tempo Real no Celular</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              Ative abaixo para receber alertas visuais, vibração e som no celular sempre que o Time Buiatte criar uma solicitação ou o Time Midea concluir uma MIGO no SAP:
            </p>
            <button
              type="button"
              onClick={handleActivateAndTestMobileNotifications}
              className="w-full py-2.5 px-3 rounded-xl bg-[#002664] hover:bg-[#003380] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95"
            >
              <BellRing className="w-4 h-4 text-amber-300" />
              <span>Ativar e Testar Notificações no Aparelho</span>
            </button>
            {notifStatusMsg && (
              <div className="p-2.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 text-[11px] font-semibold">
                {notifStatusMsg}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowGuideModal(false)}
            className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 py-2.5 text-xs font-extrabold text-slate-700 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClickInstall}
        className="px-2.5 py-1.5 rounded-xl text-emerald-100 bg-emerald-500/25 border border-emerald-400/50 hover:bg-emerald-500/35 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
        title="Instalar Aplicativo MIGOU no Celular / PC (PWA) e Configurar Notificações"
        aria-label="App Mobile PWA"
      >
        <Smartphone className="w-4 h-4 text-emerald-300 shrink-0" />
        <span className="hidden md:inline text-[11px]">App Mobile</span>
      </button>

      {modalContent && typeof document !== 'undefined'
        ? createPortal(modalContent, document.body)
        : modalContent}
    </>
  );
};
