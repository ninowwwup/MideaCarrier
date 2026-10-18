import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertOctagon, 
  FileCheck, 
  AlertTriangle,
  RefreshCw,
  Hash
} from 'lucide-react';
import { TransferItem } from '../types/transfer';

interface ResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TransferItem[];
  mode: 'concluir' | 'divergencia';
  onSubmit: (data: {
    sapDocNumber?: string;
    observacoes: string;
    responsavel: string;
  }) => Promise<void> | void;
}

const COMMON_DIVERGENCE_REASONS = [
  'Saldo insuficiente no depósito de origem no SAP (MMBE)',
  'Serial não localizado ou já baixado no estoque',
  'Material bloqueado para movimentação / Controle de Qualidade',
  'Depósito de destino incorreto para a categoria do material',
  'Erro de integração entre WMS Sênior e SAP',
];

export const ResolutionModal: React.FC<ResolutionModalProps> = ({
  isOpen,
  onClose,
  items,
  mode,
  onSubmit,
}) => {
  const [sapDocNumber, setSapDocNumber] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [responsavel, setResponsavel] = useState('Time Midea (SAP)');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || items.length === 0) return null;

  const isBatch = items.length > 1;

  const handleGenerateTempDoc = () => {
    const doc = `MIGO-${Date.now().toString().slice(-6)}`;
    setSapDocNumber(doc);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const docTrimmed = sapDocNumber.trim();
    const obsTrimmed = observacoes.trim();

    if (mode === 'concluir' && !docTrimmed) {
      setValidationError('Por favor informe o Número do Documento gerado no SAP (ou clique em "Gerar Provisório").');
      return;
    }

    if (mode === 'divergencia' && !obsTrimmed) {
      setValidationError('Por favor descreva o motivo da divergência ou selecione um dos motivos acima.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        sapDocNumber: docTrimmed || undefined,
        observacoes: obsTrimmed,
        responsavel: responsavel.trim() || 'Time Midea (SAP)',
      });
      setSapDocNumber('');
      setObservacoes('');
      setValidationError(null);
      onClose();
    } catch (err: any) {
      setValidationError('Erro ao salvar alteração: ' + (err?.message || 'Falha na conexão'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div
          className={`shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 text-white flex items-center justify-between ${
            mode === 'concluir'
              ? 'bg-gradient-to-r from-emerald-800 to-emerald-600'
              : 'bg-gradient-to-r from-rose-900 to-rose-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-white/10 text-white">
              {mode === 'concluir' ? <CheckCircle2 className="w-5 h-5" /> : <AlertOctagon className="w-5 h-5" />}
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                {mode === 'concluir' ? 'Concluir Movimentação no SAP' : 'Apontar Divergência / Erro'}
              </h3>
              <p className="text-[11px] sm:text-xs text-white/80">
                {isBatch
                  ? `Aplicar em ${items.length} itens selecionados`
                  : `Item: ${items[0].material} • Serial: ${items[0].serial}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 sm:space-y-4 overscroll-contain">
            {/* Mensagem de Erro Inline (Sem alert) */}
            {validationError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Resumo dos Itens Selecionados */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="font-semibold text-slate-700 flex items-center justify-between">
                <span>{isBatch ? `${items.length} Itens em Tratativa Simultânea` : 'Dados da Solicitação:'}</span>
                <span className="font-mono text-slate-500">
                  {items[0].centro} ({items[0].depositoOrigem} ➔ {items[0].depositoDestino})
                </span>
              </div>
              {!isBatch && (
                <div className="font-mono text-[11px] text-slate-600">
                  Material: <strong className="text-slate-800">{items[0].material}</strong> | Serial: {items[0].serial}
                </div>
              )}
              {!isBatch && items[0].labelPhotoUrl && (
                <div className="pt-2 border-t border-slate-200 mt-2 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-700">Comprovação da Label:</span>
                  <a
                    href={items[0].labelPhotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#00609C] hover:underline font-medium"
                  >
                    <img
                      src={items[0].labelPhotoUrl}
                      alt="Foto da Label"
                      className="w-6 h-6 object-cover rounded border border-slate-300 shadow-2xs"
                    />
                    <span>Ver foto da etiqueta</span>
                  </a>
                </div>
              )}
            </div>

            {/* Se for Concluir: Nº Doc SAP */}
            {mode === 'concluir' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Nº Documento de Material SAP (MIGO) *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateTempDoc}
                    className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1 hover:underline"
                  >
                    <Hash className="w-3 h-3" />
                    <span>Gerar Provisório</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ex: 4900188921"
                    value={sapDocNumber}
                    onChange={(e) => {
                      setSapDocNumber(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent uppercase"
                  />
                  <FileCheck className="w-4 h-4 text-emerald-600 absolute right-3 top-2.5" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  O Time Buiatte visualizará este número imediatamente no Sênior WMS.
                </p>
              </div>
            )}

            {/* Se for Divergência: Motivos Rápidos */}
            {mode === 'divergencia' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Selecione um Motivo Frequente:
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-1">
                  {COMMON_DIVERGENCE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        setObservacoes(reason);
                        if (validationError) setValidationError(null);
                      }}
                      className="w-full text-left text-xs p-2 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 text-slate-700 transition-colors"
                    >
                      • {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Observações / Descrição detalhada */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {mode === 'concluir' ? 'Observações Adicionais (Opcional)' : 'Detalhamento da Divergência *'}
              </label>
              <textarea
                rows={3}
                placeholder={
                  mode === 'concluir'
                    ? 'Ex: Movimentação 311 efetuada. Material já disponível no depósito destino.'
                    : 'Descreva detalhadamente o erro para o Time Buiatte entender e ajustar a base...'
                }
                value={observacoes}
                onChange={(e) => {
                  setObservacoes(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Responsável */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Operador SAP Responsável
              </label>
              <input
                type="text"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50 ${
                mode === 'concluir'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submetendo no Banco...</span>
                </>
              ) : mode === 'concluir' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Movimentação SAP</span>
                </>
              ) : (
                <>
                  <AlertOctagon className="w-4 h-4" />
                  <span>Registrar Divergência</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
