import React from 'react';
import { X, Download, ZoomIn, ExternalLink, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { TransferItem } from '../types/transfer';

interface LabelPhotoModalProps {
  item: TransferItem | null;
  onClose: () => void;
}

export const LabelPhotoModal: React.FC<LabelPhotoModalProps> = ({ item, onClose }) => {
  if (!item || !item.labelPhotoUrl) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = item.labelPhotoUrl!;
    link.download = `label-${item.material}-${item.serial}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-white/10 text-[#C2DEEB]">
              <ImageIcon className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>Comprovação da Etiqueta / Label</span>
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-white/20 text-[#C2DEEB]">
                  {item.material}
                </span>
              </h3>
              <p className="text-xs text-[#C2DEEB] font-mono">
                Serial: {item.serial} • Centro: {item.centro} ({item.depositoOrigem} ➔ {item.depositoDestino})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image Content */}
        <div className="p-4 bg-slate-900/5 flex flex-col items-center justify-center">
          <div className="relative max-h-[65vh] w-full flex items-center justify-center rounded-xl overflow-hidden bg-slate-950/10 border border-slate-200">
            <img
              src={item.labelPhotoUrl}
              alt={`Etiqueta do produto ${item.material}`}
              className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
            />
          </div>

          <div className="w-full mt-3 flex items-center justify-between text-xs text-slate-600 px-1">
            <div className="flex items-center gap-1.5 text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Evidência anexada pelo Time Buiatte / Time Midea para conferência de divergência</span>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#00609C]" />
              <span>Baixar Foto</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            Solicitação: {item.solicitationCode}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-white bg-[#002664] hover:bg-[#002363] rounded-lg transition-colors shadow-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
