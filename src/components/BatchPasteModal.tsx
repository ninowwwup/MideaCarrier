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
import { parsePastedTable, checkDefinitiveDamageOrigin, analyzeTransferRoute } from '../utils/sapFormatter';
import { BROWSER_CLIENT_ID } from '../services/storage';
import { DefinitiveDamageWarningModal } from './DefinitiveDamageWarningModal';
import { WMSBreakerWarningModal, BlockedTransferAttempt } from './WMSBreakerWarningModal';
import { lookupSerialInIQ09 } from '../services/iq09Service';
import { evaluateWMSBreakerForTransfer } from '../services/wmsBatimentoService';

interface BatchPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportItems: (items: TransferItem[]) => void;
  currentCount: number;
  defaultSolicitante?: string;
  currentRole?: string;
}

export const BatchPasteModal: React.FC<BatchPasteModalProps> = ({
  isOpen,
  onClose,
  onImportItems,
  currentCount,
  defaultSolicitante = 'Time Buiatte (Prod)',
  currentRole = 'buiatte',
}) => {
  const [pastedText, setPastedText] = useState('');
  const [solicitante, setSolicitante] = useState(defaultSolicitante);
  const [isDamageWarningOpen, setIsDamageWarningOpen] = useState(false);
  const [isWmsBreakerWarningOpen, setIsWmsBreakerWarningOpen] = useState(false);

  useEffect(() => {
    if (!solicitante || solicitante === 'Time Buiatte (Prod)') {
      setSolicitante(defaultSolicitante);
    }
  }, [defaultSolicitante]);

  const parsedRows = useMemo(() => {
    return parsePastedTable(pastedText);
  }, [pastedText]);

  // Identifica linhas que possuem B136, B149 ou B137 como Depósito de Origem
  const invalidOriginRows = useMemo(() => {
    return parsedRows
      .map((r) => {
        const check = checkDefinitiveDamageOrigin(r.depositoOrigem, r.depositoDestino);
        if (check.isInvalidOrigin && check.originInfo) {
          return {
            material: r.material.trim().toUpperCase(),
            centro: r.centro.trim().toUpperCase(),
            depositoOrigem: r.depositoOrigem.trim().toUpperCase(),
            depositoDestino: r.depositoDestino.trim().toUpperCase(),
            originInfo: check.originInfo,
          };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [parsedRows]);

  // Avaliação de cada linha contra a Base de Batimento Sênior WMS x SAP (Trava Breaker)
  const wmsEvaluation = useMemo(() => {
    const rowVerdicts = parsedRows.map((r) => {
      const iq09Match = lookupSerialInIQ09(r.serial);
      return evaluateWMSBreakerForTransfer({
        serial: r.serial,
        material: r.material,
        centro: r.centro,
        depositoOrigem: r.depositoOrigem,
        depositoDestino: r.depositoDestino,
        iq09Item: iq09Match,
      });
    });

    const blockedAttempts: BlockedTransferAttempt[] = [];
    const validRowIndices: number[] = [];

    parsedRows.forEach((r, idx) => {
      const verdict = rowVerdicts[idx];
      if (!verdict.allowed) {
        blockedAttempts.push({
          serial: r.serial.trim().toUpperCase(),
          material: r.material.trim().toUpperCase(),
          centro: r.centro.trim().toUpperCase(),
          depositoOrigem: r.depositoOrigem.trim().toUpperCase(),
          depositoDestino: r.depositoDestino.trim().toUpperCase(),
          verdict,
        });
      } else {
        validRowIndices.push(idx);
      }
    });

    return {
      rowVerdicts,
      blockedAttempts,
      validRowIndices,
    };
  }, [parsedRows]);

  if (!isOpen) return null;

  const executeImport = (rowsSubset?: typeof parsedRows, obsOverride?: string) => {
    const targetRows = rowsSubset || parsedRows;
    if (targetRows.length === 0) return;

    const finalSolicitante = solicitante.trim() || defaultSolicitante;
    const now = new Date().toISOString();
    const batchId = `BATCH-${Date.now().toString().slice(-4)}`;

    const newItems: TransferItem[] = targetRows.map((row, idx) => ({
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
      observacoes: obsOverride,
      originatorClientId: BROWSER_CLIENT_ID,
    }));

    onImportItems(newItems);
    setPastedText('');
    setIsDamageWarningOpen(false);
    setIsWmsBreakerWarningOpen(false);
    onClose();
  };

  const handleImport = () => {
    if (parsedRows.length === 0) return;

    if (invalidOriginRows.length > 0) {
      setIsDamageWarningOpen(true);
      return;
    }

    if (wmsEvaluation.blockedAttempts.length > 0) {
      setIsWmsBreakerWarningOpen(true);
      return;
    }

    executeImport();
  };

  const handleRemoveBlockedWmsRows = () => {
    const validRows = wmsEvaluation.validRowIndices.map((idx) => parsedRows[idx]);
    const nextText = validRows
      .map((r) => `${r.material}\t${r.serial}\t${r.centro}\t${r.depositoOrigem}\t${r.depositoDestino}`)
      .join('\n');
    setPastedText(nextText);
  };

  const handleLoadSample = () => {
    const sample = `Material\tSerial\tCentro\tDeposito de Origem\tDeposito de Destino
38TAVCB18M5\tS3026B22437213\tB124\tB111\tB110
42AFVCI09S5\tS2226B21902264\tB124\tB110\tB111
MDWTF08B1\t541760002ZGB4133400502\tB124\tB148\tB110
MDWTF08B1\t541760002ZGB4133400533\tB124\tB148\tB110
38TFCA22S5\tS0726B20996678\tB124\tB111\tB110
QCL108BB\tS1326B21294802\tB179\tB111\tB413`;
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
            <div className="space-y-3">
              {/* Banner de Alerta quando houver linhas com Origem B136, B149 ou B137 */}
              {invalidOriginRows.length > 0 && (
                <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3.5 flex items-start gap-3 animate-in fade-in">
                  <div className="text-xl leading-none">🚨</div>
                  <div className="text-xs text-red-900 space-y-1">
                    <div className="font-extrabold text-red-800">
                      Atenção: {invalidOriginRows.length}{' '}
                      {invalidOriginRows.length === 1
                        ? 'linha colada possui'
                        : 'linhas coladas possuem'}{' '}
                      Origem em Depósito de Avaria Definitiva (B136 / B149 / B137)!
                    </div>
                    <p className="leading-relaxed">
                      Produtos nos depósitos <strong>B136 (Sucata)</strong>, <strong>B149 (Outlet)</strong> e{' '}
                      <strong>B137 (Slow Movers)</strong> já tiveram avaria e{' '}
                      <strong>não devem ser disponibilizados para o estoque livre</strong>. Se você prosseguir, uma tela de alerta será exibida e essas linhas ficarão <strong>vermelhas</strong> no painel principal.
                    </p>
                  </div>
                </div>
              )}

              {/* Banner de Alerta da Trava Sênior WMS x SAP */}
              {wmsEvaluation.blockedAttempts.length > 0 && (
                <div className="bg-red-50 border-2 border-red-500 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5 text-xs text-red-950">
                    <span className="text-lg leading-none">🛑</span>
                    <div className="space-y-1">
                      <div className="font-extrabold text-red-900">
                        Trava Breaker Sênior WMS x SAP: {wmsEvaluation.blockedAttempts.length} de {parsedRows.length} linha(s) BLOQUEADA(S)!
                      </div>
                      <p className="text-red-800 leading-relaxed">
                        {wmsEvaluation.blockedAttempts[0].verdict.whyItIsInvalid}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {wmsEvaluation.validRowIndices.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRemoveBlockedWmsRows}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
                      >
                        Manter apenas {wmsEvaluation.validRowIndices.length} linha(s) apta(s)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsWmsBreakerWarningOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      Ver Diagnóstico & Ação Buiatte
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700">
                    {parsedRows.length} linhas reconhecidas prontas para validação
                  </span>
                  {invalidOriginRows.length > 0 ? (
                    <span className="text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full font-bold border border-red-300 flex items-center gap-1">
                      🚫 {invalidOriginRows.length} Solicitação(ões) com Origem de Avaria Definitiva
                    </span>
                  ) : wmsEvaluation.blockedAttempts.length > 0 ? (
                    <span className="text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full font-bold border border-red-300 flex items-center gap-1">
                      🛑 {wmsEvaluation.blockedAttempts.length} Bloqueada(s) no Batimento Sênior WMS
                    </span>
                  ) : (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Formato e Batimento WMS Válidos
                    </span>
                  )}
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
                        <th className="py-2 px-3">Validação SAP (IQ09) & Sênior WMS</th>
                        <th className="py-2 px-3">Solicitante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {parsedRows.map((r, i) => {
                        const rowCheck = checkDefinitiveDamageOrigin(r.depositoOrigem, r.depositoDestino);
                        const routeAnalysis = analyzeTransferRoute(r.centro, r.depositoOrigem, r.depositoDestino);
                        const iq09Match = lookupSerialInIQ09(r.serial);
                        const wmsVerdict = wmsEvaluation.rowVerdicts[i];
                        const isBlockedByWms = wmsVerdict && !wmsVerdict.allowed;
                        const isAlreadyInDestIQ09 =
                          iq09Match && iq09Match.deposito === r.depositoDestino.trim().toUpperCase();
                        const isOriginDiffInIQ09 =
                          iq09Match &&
                          !isAlreadyInDestIQ09 &&
                          iq09Match.deposito !== r.depositoOrigem.trim().toUpperCase();
                        const isRowInvalid = rowCheck.isInvalidOrigin || isBlockedByWms;
                        const hasWarning = !isRowInvalid && (routeAnalysis.hasCenterMismatch || routeAnalysis.hasApplicationMismatch);
                        const warningText = routeAnalysis.warnings.join(' ');
                        return (
                          <tr
                            key={i}
                            className={
                              isRowInvalid
                                ? 'bg-red-100 text-red-950 font-semibold hover:bg-red-200/70'
                                : isAlreadyInDestIQ09
                                ? 'bg-blue-50 text-blue-950 hover:bg-blue-100/70'
                                : hasWarning || isOriginDiffInIQ09
                                ? 'bg-amber-50/90 text-amber-950 hover:bg-amber-100/70'
                                : 'hover:bg-blue-50/40'
                            }
                          >
                            <td
                              className={`py-1.5 px-3 font-sans ${
                                isRowInvalid ? 'text-red-700 font-bold' : 'text-slate-400'
                              }`}
                            >
                              {i + 1}
                            </td>
                            <td
                              className={`py-1.5 px-3 font-semibold ${
                                isRowInvalid ? 'text-red-950 font-extrabold' : 'text-slate-800'
                              }`}
                            >
                              {r.material}
                            </td>
                            <td className={`py-1.5 px-3 ${isRowInvalid ? 'text-red-900' : 'text-slate-600'}`}>
                              {r.serial}
                            </td>
                            <td
                              className={`py-1.5 px-3 font-semibold ${
                                isRowInvalid ? 'text-red-900' : 'text-slate-700'
                              }`}
                            >
                              {r.centro}
                            </td>
                            <td className="py-1.5 px-3">
                              {isRowInvalid ? (
                                <span className="bg-red-600 text-white font-mono px-2 py-0.5 rounded font-extrabold">
                                  {r.depositoOrigem.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-amber-700" title={routeAnalysis.originDeposit?.classification}>
                                  {r.depositoOrigem}
                                  {routeAnalysis.originDeposit && (
                                    <span className="ml-1 text-[9px] text-slate-400 font-sans">
                                      ({routeAnalysis.originDeposit.shortTitle})
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td
                              className={`py-1.5 px-3 ${
                                isRowInvalid ? 'text-red-950 font-bold' : 'text-emerald-700'
                              }`}
                              title={routeAnalysis.destinationDeposit?.classification}
                            >
                              {r.depositoDestino}
                              {routeAnalysis.destinationDeposit && !isRowInvalid && (
                                <span className="ml-1 text-[9px] text-slate-400 font-sans">
                                  ({routeAnalysis.destinationDeposit.shortTitle})
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-3 font-sans">
                              {rowCheck.isInvalidOrigin && rowCheck.originInfo ? (
                                <span className="text-red-800 font-extrabold">
                                  🚫 ERRO: {rowCheck.originInfo.code} ({rowCheck.originInfo.shortTitle}) não pode ir para estoque livre!
                                </span>
                              ) : isBlockedByWms ? (
                                <div className="space-y-0.5">
                                  <div className="text-red-800 font-extrabold">
                                    {wmsVerdict.badgeLabel} — {wmsVerdict.title}
                                  </div>
                                  {wmsVerdict.wmsItem && (
                                    <div className="text-[10px] text-red-700">
                                      Sênior WMS: Dep. <strong>{wmsVerdict.wmsItem.depositoWms || 'S/ Saldo'}</strong> • Local{' '}
                                      <strong>{wmsVerdict.wmsItem.localWms || '—'}</strong> • Análise:{' '}
                                      <strong>{wmsVerdict.wmsItem.analise}</strong>
                                    </div>
                                  )}
                                </div>
                              ) : isAlreadyInDestIQ09 ? (
                                <span className="text-blue-800 font-extrabold">
                                  🔵 IQ09: Este UII já consta no depósito destino {iq09Match.deposito} no SAP!
                                </span>
                              ) : isOriginDiffInIQ09 ? (
                                <span className="text-amber-800 font-bold">
                                  ⚠️ IQ09: Na base SAP este UII está em {iq09Match.deposito} (Centro {iq09Match.centro}), não em {r.depositoOrigem}.
                                </span>
                              ) : hasWarning ? (
                                <span className="text-amber-800 font-bold" title={warningText}>
                                  ⚠️ {warningText}
                                </span>
                              ) : rowCheck.isValidDestination && rowCheck.destinationInfo ? (
                                <span className="text-emerald-700 font-semibold">
                                  ✅ OK (Destino Avaria é permitido)
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-medium">
                                  ✅ {wmsVerdict?.wmsItem ? `${wmsVerdict.badgeLabel} (${wmsVerdict.wmsItem.localWms || 'WMS'})` : routeAnalysis.routeExplanation || 'Rota SAP Válida'}
                                  {iq09Match && ' • Confirmado na IQ09'}
                                </span>
                              )}
                            </td>
                            <td
                              className={`py-1.5 px-3 font-sans truncate max-w-[140px] ${
                                isRowInvalid ? 'text-red-900 font-bold' : 'text-slate-700'
                              }`}
                            >
                              {solicitante.trim() || defaultSolicitante}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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

      {/* Modal Educativo de Solicitação Incorreta (Depósitos B136, B149, B137 como Origem) */}
      <DefinitiveDamageWarningModal
        isOpen={isDamageWarningOpen}
        invalidRoutes={invalidOriginRows}
        onCancelAndFix={() => setIsDamageWarningOpen(false)}
        onConfirmAnyway={() => executeImport()}
      />

      {/* Modal Hard-Breaker: Trava de Batimento Sênior WMS x SAP */}
      {wmsEvaluation.blockedAttempts.length > 0 && (
        <WMSBreakerWarningModal
          isOpen={isWmsBreakerWarningOpen}
          blockedAttempts={wmsEvaluation.blockedAttempts}
          totalSerialsCount={parsedRows.length}
          validSerialsCount={wmsEvaluation.validRowIndices.length}
          onCloseAndFix={() => setIsWmsBreakerWarningOpen(false)}
          onProceedOnlyWithValid={
            wmsEvaluation.validRowIndices.length > 0
              ? () => {
                  const validRows = wmsEvaluation.validRowIndices.map((idx) => parsedRows[idx]);
                  executeImport(validRows);
                }
              : undefined
          }
          onAdminForceOverride={
            currentRole === 'admin'
              ? () =>
                  executeImport(
                    undefined,
                    '[EXCEÇÃO GESTOR: Lote submetido com alerta no Batimento Sênior WMS]'
                  )
              : undefined
          }
        />
      )}
    </div>
  );
};
