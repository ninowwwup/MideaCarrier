import React, { useState, useEffect } from 'react';
import { 
  X, 
  Terminal, 
  Sparkles, 
  ArrowRight, 
  Boxes, 
  Check, 
  BellRing,
  ExternalLink
} from 'lucide-react';
import { TransferItem } from '../types/transfer';
import { formatForSAPTable } from '../utils/sapFormatter';

export interface AlertNotification {
  id: string;
  timestamp: string;
  items: TransferItem[];
  solicitante: string;
  resumoMaterial: string;
  centro: string;
  depOrigem: string;
  depDestino: string;
  totalSeriais: number;
}

interface OutlookToastAlertProps {
  alert: AlertNotification | null;
  onClose: () => void;
  onOpenSAPModal: (items: TransferItem[]) => void;
  onFocusMideaView: (items: TransferItem[]) => void;
}

export const OutlookToastAlert: React.FC<OutlookToastAlertProps> = ({
  alert,
  onClose,
  onOpenSAPModal,
  onFocusMideaView,
}) => {
  const [copiedQuick, setCopiedQuick] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);

  // Auto-dispensar após 18 segundos se o usuário não passar o mouse por cima
  useEffect(() => {
    if (!alert) return;
    setProgress(100);

    const duration = 18000;
    const interval = 100;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      if (!isHovered) {
        setProgress((prev) => {
          if (prev <= step) {
            clearInterval(timer);
            onClose();
            return 0;
          }
          return prev - step;
        });
      }
    }, interval);

    return () => clearInterval(timer);
  }, [alert, isHovered, onClose]);

  if (!alert) return null;

  const handleCopyQuickSAP = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatForSAPTable(alert.items);
    navigator.clipboard.writeText(text);
    setCopiedQuick(true);
    setTimeout(() => setCopiedQuick(false), 2500);
  };

  const handleGoToMidea = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFocusMideaView(alert.items);
    onClose();
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed bottom-5 left-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] bg-white rounded-xl shadow-2xl border border-slate-200/90 overflow-hidden transform transition-all duration-300 ease-out animate-in slide-in-from-bottom-8 fade-in ring-1 ring-slate-900/10"
      style={{
        boxShadow: '0 20px 25px -5px rgba(0, 96, 156, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Top Outlook Brand Stripe (Azul Midea Carrier) */}
      <div className="h-1 bg-gradient-to-r from-[#00609C] via-[#0083CA] to-blue-400 w-full" />

      {/* Header Estilo Toast do Outlook / Windows */}
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#0083CA] flex items-center justify-center text-white shadow-2xs">
            <Boxes className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-bold text-slate-700 tracking-tight">
            Midea Transfer Hub
          </span>
          <span className="text-[10px] text-slate-400">• agora</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-200/60 transition-colors"
          title="Fechar notificação"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Corpo da Notificação (Estilo Mensagem de Correio / Solicitação do Outlook) */}
      <div className="p-3.5 space-y-2.5 cursor-pointer" onClick={handleGoToMidea}>
        {/* Solicitante & Título */}
        <div>
          <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
            <span className="truncate">{alert.solicitante}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-[#00609C] border border-blue-200 shrink-0">
              Centro {alert.centro}
            </span>
          </div>
          <div className="text-xs text-slate-600 font-medium mt-0.5 flex items-center gap-1.5">
            <BellRing className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
            <span className="truncate">Nova movimentação para processar no SAP</span>
          </div>
        </div>

        {/* Detalhes do Material e Rota */}
        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-xs space-y-1.5">
          <div className="flex items-center justify-between font-mono">
            <span className="font-bold text-slate-900 text-[13px]">{alert.resumoMaterial}</span>
            <span className="text-[11px] font-sans font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
              {alert.totalSeriais} {alert.totalSeriais === 1 ? 'serial' : 'seriais'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-700 pt-0.5">
            <span className="px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-900 font-semibold border border-amber-200">
              Origem {alert.depOrigem}
            </span>
            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="px-1.5 py-0.5 rounded bg-emerald-100/80 text-emerald-900 font-semibold border border-emerald-200">
              Destino {alert.depDestino}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Ações Rápidas */}
      <div className="px-3.5 pb-3 pt-1 flex items-center justify-between gap-2 bg-white">
        <button
          type="button"
          onClick={handleCopyQuickSAP}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-2xs ${
            copiedQuick
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
          }`}
          title="Copiar dados tabulados prontos para colar no SAP GUI"
        >
          {copiedQuick ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Copiado!</span>
            </>
          ) : (
            <>
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span>Copiar (TAB)</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleGoToMidea}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#0083CA] hover:bg-[#0070b0] rounded-lg transition-colors shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-200" />
          <span>Tratar no SAP</span>
        </button>
      </div>

      {/* Barra de Progresso Auto-Dismiss (Estilo Toast Outlook) */}
      <div className="w-full bg-slate-100 h-0.5">
        <div
          className="h-full bg-[#0083CA] transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
