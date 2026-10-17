import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Terminal, 
  Layers, 
  FileText, 
  ExternalLink,
  Info
} from 'lucide-react';
import { TransferItem } from '../types/transfer';
import { formatForSAPTable, formatSerialsForSAP } from '../utils/sapFormatter';

interface SAPCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TransferItem[];
}

export const SAPCopyModal: React.FC<SAPCopyModalProps> = ({
  isOpen,
  onClose,
  items,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!isOpen || items.length === 0) return null;

  const tableText = formatForSAPTable(items);
  const serialsText = formatSerialsForSAP(items);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-[#0083CA] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-white">
              <Terminal className="w-5 h-5 text-cyan-300" />
            </span>
            <div>
              <h3 className="text-base font-bold">Assistente de Colagem no SAP (MIGO 311)</h3>
              <p className="text-xs text-blue-100">
                Formatos otimizados para colar diretamente nas transações MIGO, MB1B ou LT01 do SAP GUI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Instruções Rápidas SAP */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#00609C] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[#00609C] mb-0.5">Dica para o Time Midea no SAP:</div>
              <p className="text-slate-600">
                Na transação <strong>MIGO</strong> (A08 Transferência / R10 Outros / Movimento <strong>311</strong>): 
                use o botão <strong>"Copiar Tabela para SAP"</strong> para preencher o grid de itens, ou clique na aba 
                <strong>"Seriais"</strong> e use <strong>"Copiar Seriais"</strong> para colar a lista de uma vez!
              </p>
            </div>
          </div>

          {/* Opção 1: Formato Tabela Grid SAP (Tab-Delimited) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">
                  Formato Tabela Tabulada ({items.length} itens)
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-700 font-mono px-1.5 py-0.5 rounded">
                  TAB Separated
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(tableText, 'table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                  copiedType === 'table'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#0083CA] hover:bg-[#0070b0] text-white'
                }`}
              >
                {copiedType === 'table' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copiado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Tabela para SAP</span>
                  </>
                )}
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto text-slate-700 max-h-32">
              {tableText}
            </pre>
          </div>

          {/* Opção 2: Apenas Lista de Seriais (1 por linha para tela de Seriais do SAP) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">
                  Apenas Lista de Seriais ({items.length} seriais)
                </span>
                <span className="text-[10px] bg-blue-100 text-[#00609C] font-mono px-1.5 py-0.5 rounded">
                  1 por linha
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(serialsText, 'serials')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                  copiedType === 'serials'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-900 text-white'
                }`}
              >
                {copiedType === 'serials' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Seriais Copiados!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Apenas Seriais</span>
                  </>
                )}
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto text-slate-700 max-h-28">
              {serialsText}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
