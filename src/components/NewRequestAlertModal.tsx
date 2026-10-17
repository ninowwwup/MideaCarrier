import React from 'react';
import { 
  BellRing, 
  X, 
  Terminal, 
  CheckCircle2, 
  Layers, 
  ArrowRight, 
  Clock, 
  Sparkles,
  ExternalLink,
  Volume2
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

interface NewRequestAlertModalProps {
  alert: AlertNotification | null;
  onClose: () => void;
  onOpenSAPModal: (items: TransferItem[]) => void;
  onFocusMideaView: (items: TransferItem[]) => void;
}

export const NewRequestAlertModal: React.FC<NewRequestAlertModalProps> = ({
  alert,
  onClose,
  onOpenSAPModal,
  onFocusMideaView,
}) => {
  const [copiedQuick, setCopiedQuick] = React.useState(false);

  if (!alert) return null;

  const handleCopyQuickSAP = () => {
    const text = formatForSAPTable(alert.items);
    navigator.clipboard.writeText(text);
    setCopiedQuick(true);
    setTimeout(() => setCopiedQuick(false), 2000);
  };

  const handleGoToMidea = () => {
    onFocusMideaView(alert.items);
    onClose();
  };

  const handleOpenSAPAssistant = () => {
    onOpenSAPModal(alert.items);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border-2 border-amber-400 overflow-hidden ring-4 ring-amber-400/20">
        {/* Top Alert Bar */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-amber-500 via-amber-600 to-[#0083CA] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl animate-bounce">
              <BellRing className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-wide uppercase">
                  Alerta para o Time Midea
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-white text-amber-900 font-bold">
                  NOVA SOLICITAÇÃO
                </span>
              </div>
              <p className="text-xs text-blue-50">
                O Time Buiatte (WMS) acabou de inputar nova solicitação de movimentação
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            title="Fechar alerta"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Details */}
        <div className="p-5 space-y-4">
          {/* Card Resumo do Material */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Horário: <strong>{new Date(alert.timestamp).toLocaleTimeString('pt-BR')}</strong></span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-[#00609C] font-bold">
                {alert.totalSeriais} {alert.totalSeriais === 1 ? 'Serial' : 'Seriais'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Material SAP:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {alert.resumoMaterial}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Centro:</span>
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {alert.centro}
                </span>
              </div>
            </div>

            {/* Rota Depósito Origem -> Destino */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Movimentação Solicitada:</span>
              <div className="flex items-center gap-2 font-mono font-bold text-xs">
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                  Dep. {alert.depOrigem}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                  Dep. {alert.depDestino}
                </span>
              </div>
            </div>

            {/* Solicitante */}
            <div className="text-[11px] text-slate-500 pt-1">
              Solicitado por: <strong className="text-slate-700">{alert.solicitante}</strong>
            </div>
          </div>

          {/* Lista de Seriais */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                Seriais a Movimentar no SAP:
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {alert.items.length} linha(s)
              </span>
            </div>

            <div className="max-h-28 overflow-y-auto bg-slate-100/70 p-2 rounded-lg border border-slate-200 flex flex-wrap gap-1">
              {alert.items.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-800"
                >
                  {item.serial}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Dispensar Alerta
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyQuickSAP}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors shadow-2xs ${
                copiedQuick
                  ? 'bg-emerald-600 text-white border border-emerald-600'
                  : 'text-slate-800 bg-white border border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Terminal className={`w-3.5 h-3.5 ${copiedQuick ? 'text-white' : 'text-[#00609C]'}`} />
              <span>{copiedQuick ? 'Copiado para o SAP!' : 'Copiar p/ SAP'}</span>
            </button>

            <button
              type="button"
              onClick={handleGoToMidea}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0083CA] hover:bg-[#0070b0] rounded-lg transition-colors shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Tratar no SAP Agora</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
