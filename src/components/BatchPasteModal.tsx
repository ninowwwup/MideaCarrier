import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Check, 
  AlertCircle, 
  ArrowRight,
  ClipboardPaste,
  Sparkles,
  User
} from 'lucide-react';
import { TransferItem } from '../types/transfer';
import { parsePastedTable } from '../utils/sapFormatter';
import { BROWSER_CLIENT_ID } from '../services/storage';

interface BatchPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportItems: (items: TransferItem[]) => void;
  currentCount: number;
  defaultSolicitante?: string;
}

export const BatchPasteModal: React.FC<BatchPasteModalProps> = ({
  isOpen,
  onClose,
  onImportItems,
  currentCount,
  defaultSolicitante = 'Time Buiatte (Prod)',
}) => {
  const [pastedText, setPastedText] = useState('');
  const [solicitante, setSolicitante] = useState(defaultSolicitante);

  useEffect(() => {
    if (!solicitante || solicitante === 'Time Buiatte (Prod)') {
      setSolicitante(defaultSolicitante);
    }
  }, [defaultSolicitante]);

  const parsedRows = useMemo(() => {
    return parsePastedTable(pastedText);
  }, [pastedText]);

  if (!isOpen) return null;

  const handleImport = () => {
    if (parsedRows.length === 0) return;

    const finalSolicitante = solicitante.trim() || defaultSolicitante;
    const now = new Date().toISOString();
    const batchId = `BATCH-${Date.now().toString().slice(-4)}`;

    const newItems: TransferItem[] = parsedRows.map((row, idx) => ({
      id: `batch-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      solicitationCode: `SOL-${1000 + currentCount + idx + 1}`,
      material: row.material.trim().toUpperCase(),
      serial: row.serial.trim(),
      centro: row.centro.trim().toUpperCase(),
      depositoOrigem: row.depositoOrigem.trim().toUpperCase(),
      depositoDestino: row.depositoDestino.trim().toUpperCase(),
      status: 'pendente',
      criadoEm: now,
      criadoPor: finalSolicitante,
      atualizadoEm: now,
      prioridadeFifo: currentCount + idx + 1,
      slaStatus: 'no_prazo',
      batchId,
      originatorClientId: BROWSER_CLIENT_ID,
    }));

    onImportItems(newItems);
    setPastedText('');
    onClose();
  };

  const handleLoadSample = () => {
    const sample = `Material\tSerial\tCentro\tDeposito de Origem\tDeposito de Destino
MDWTF08B1\t541760002ZGB4133400502\tB124\tB148\tB110
MDWTF08B1\t541760002ZGB4133400533\tB124\tB148\tB110
TSM62\t541711001X9B6233500679\tB124\tB148\tB111
PP5MS1\tPS142600024\tB124\tB110\tB111
38TAVCB18M5\tS3226B22695419\tB123\tB110\tB111
QCL108BB\tS1326B21294802\tB179\tB111\tB413
QCL108BB\tS1326B21294807\tB158\tB111\tB114
QCL108BB\tS1326B21294814\tB158\tB111\tB114`;
    setPastedText(sample);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-[#C2DEEB]">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold">Importação Rápida por Colagem (Excel / Tabela)</h3>
              <p className="text-[11px] sm:text-xs text-[#C2DEEB]">
                Cole a planilha que o Time Buiatte enviou diretamente aqui para criar as movimentações
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 sm:space-y-4 overscroll-contain">
          {/* Campo Time / Solicitante para Rastreabilidade */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#00609C]" />
              <span>Time / Solicitante</span>
              <span className="text-[10px] font-normal text-slate-500">
                (Informe seu nome para rastreabilidade das solicitações)
              </span>
            </label>
            <input
              type="text"
              placeholder="Ex: João Silva - Time Buiatte (Prod)"
              value={solicitante}
              onChange={(e) => setSolicitante(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA] focus:border-transparent"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              Formato esperado (separado por TAB ou ponto-e-vírgula):
              <span className="font-mono font-bold text-slate-800 ml-1 block sm:inline">
                Material | Serial | Centro | Deposito Origem | Deposito Destino
              </span>
            </div>
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-xs text-[#00609C] hover:underline font-semibold flex items-center gap-1 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Carregar Exemplo Real
            </button>
          </div>

          {/* Area de colagem */}
          <textarea
            rows={4}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Copie as linhas da sua planilha no Excel e aperte Ctrl+V aqui..."
            className="w-full px-3 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0083CA] focus:border-transparent bg-slate-50 focus:bg-white"
          />

          {/* Pre-visualização */}
          {parsedRows.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  {parsedRows.length} linhas reconhecidas prontas para importação
                </span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Formato Válido
                </span>
              </div>
              <div className="max-h-48 sm:max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Material</th>
                      <th className="py-2 px-3">Serial</th>
                      <th className="py-2 px-3">Centro</th>
                      <th className="py-2 px-3">Dep. Origem</th>
                      <th className="py-2 px-3">Dep. Destino</th>
                      <th className="py-2 px-3">Solicitante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="hover:bg-blue-50/40">
                        <td className="py-1.5 px-3 text-slate-400 font-sans">{i + 1}</td>
                        <td className="py-1.5 px-3 font-semibold text-slate-800">{r.material}</td>
                        <td className="py-1.5 px-3 text-slate-600">{r.serial}</td>
                        <td className="py-1.5 px-3 text-slate-700 font-semibold">{r.centro}</td>
                        <td className="py-1.5 px-3 text-amber-700">{r.depositoOrigem}</td>
                        <td className="py-1.5 px-3 text-emerald-700">{r.depositoDestino}</td>
                        <td className="py-1.5 px-3 text-slate-700 font-sans truncate max-w-[140px]">
                          {solicitante.trim() || defaultSolicitante}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            pastedText.trim().length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Nenhuma linha válida identificada. Certifique-se de copiar as 5 colunas com valores preenchidos.
                </span>
              </div>
            )
          )}
        </div>

        {/* Modal Footer (Sticky, always visible) */}
        <div className="shrink-0 px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="text-xs text-slate-500 w-full sm:w-auto text-center sm:text-left">
            {parsedRows.length > 0 ? (
              <span>Entrarão na fila FIFO com status <strong>Pendente</strong>.</span>
            ) : (
              <span>Aguardando dados...</span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={parsedRows.length === 0}
              onClick={handleImport}
              className="flex-1 sm:flex-initial px-5 py-2 text-xs font-bold text-white bg-[#002664] hover:bg-[#002363] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
            >
              <ClipboardPaste className="w-4 h-4 text-[#C2DEEB]" />
              <span>Importar {parsedRows.length} Movimentações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
