import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Terminal,
  Layers,
  FileText,
  Info,
  Database,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { TransferItem } from '../types/transfer';
import { formatForSAPTable, formatSerialsForSAP } from '../utils/sapFormatter';
import { auditTransferItemAgainstIQ09 } from '../services/iq09Service';
import { IQ09QueueItemAudit } from '../types/iq09';

interface SAPCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TransferItem[];
  iq09SnapshotVersion?: string | null;
  onApplyIQ09DePara?: (
    updates: Array<{
      id: string;
      material: string;
      centro: string;
      depositoOrigem: string;
      observacoes?: string;
    }>
  ) => void | Promise<void>;
}

export const SAPCopyModal: React.FC<SAPCopyModalProps> = ({
  isOpen,
  onClose,
  items,
  iq09SnapshotVersion = null,
  onApplyIQ09DePara,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [useIQ09DeParaValues, setUseIQ09DeParaValues] = useState<boolean>(true);
  const [onlyMacroSafeItems, setOnlyMacroSafeItems] = useState<boolean>(true);
  const [isApplyingDePara, setIsApplyingDePara] = useState<boolean>(false);

  // Audita todos os itens selecionados contra a Base IQ09
  const batchAudit = useMemo(() => {
    const entries = items.map((item) => ({
      item,
      audit: auditTransferItemAgainstIQ09(item),
    }));

    const hasBase = entries.some((e) => e.audit.hasIQ09Base);
    const prontos = entries.filter((e) => e.audit.macroStatus === 'pronto_macro_100');
    const corrigiveis = entries.filter((e) => e.audit.macroStatus === 'corrigivel_depara');
    const jaNoDestino = entries.filter((e) => e.audit.macroStatus === 'ja_no_destino_sap');
    const impedidos = entries.filter((e) => e.audit.macroStatus === 'erro_critico_macro');

    return {
      hasBase,
      entries,
      prontos,
      corrigiveis,
      jaNoDestino,
      impedidos,
    };
  }, [items, iq09SnapshotVersion]);

  // Prepara os itens efetivos que irão para o texto da Macro / SAP MIGO
  const effectiveMacroItems: TransferItem[] = useMemo(() => {
    if (!batchAudit.hasBase) return items;

    let filtered = batchAudit.entries;
    if (onlyMacroSafeItems) {
      const safeSubset = filtered.filter(
        (e) =>
          e.audit.macroStatus === 'pronto_macro_100' ||
          (useIQ09DeParaValues && e.audit.macroStatus === 'corrigivel_depara')
      );
      if (safeSubset.length > 0) {
        filtered = safeSubset;
      }
    }

    const mapped = filtered.map(({ item, audit }) => {
      if (useIQ09DeParaValues && audit.iq09Item && audit.canAutoFixDePara) {
        return {
          ...item,
          material: audit.iq09Item.material,
          centro: audit.iq09Item.centro,
          depositoOrigem: audit.iq09Item.deposito,
        };
      }
      return item;
    });

    // Ordena por Centro + Dep. Origem + Dep. Destino + Material (ordem ideal para Macro MIGO 311 em lote)
    return [...mapped].sort((a, b) => {
      const routeA = `${a.centro}|${a.depositoOrigem}|${a.depositoDestino}|${a.material}`;
      const routeB = `${b.centro}|${b.depositoOrigem}|${b.depositoDestino}|${b.material}`;
      return routeA.localeCompare(routeB, 'pt-BR', { numeric: true });
    });
  }, [items, batchAudit, onlyMacroSafeItems, useIQ09DeParaValues]);

  if (!isOpen || items.length === 0) return null;

  const tableText = formatForSAPTable(effectiveMacroItems);
  const serialsText = formatSerialsForSAP(effectiveMacroItems);

  // Formato completo p/ Macro Excel (Material | Serial/UII | Centro | Dep. Origem | Dep. Destino | Qtd=1)
  const macroExcelText = effectiveMacroItems
    .map(
      (i) =>
        `${i.material}\t${i.serial}\t${i.centro}\t${i.depositoOrigem}\t${i.depositoDestino}\t1`
    )
    .join('\n');

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleApplyDeParaInQueue = async () => {
    if (!onApplyIQ09DePara || batchAudit.corrigiveis.length === 0) return;
    setIsApplyingDePara(true);
    try {
      const updates = batchAudit.corrigiveis
        .filter((e) => Boolean(e.audit.iq09Item))
        .map(({ item, audit }: { item: TransferItem; audit: IQ09QueueItemAudit }) => {
          const iq = audit.iq09Item!;
          const diffNotes = audit.mismatchDetails.join(', ');
          const prefix = item.observacoes ? `${item.observacoes} | ` : '';
          return {
            id: item.id,
            material: iq.material,
            centro: iq.centro,
            depositoOrigem: iq.deposito,
            observacoes: `${prefix}[De-Para IQ09: ${diffNotes}]`,
          };
        });
      await onApplyIQ09DePara(updates);
    } finally {
      setIsApplyingDePara(false);
    }
  };

  const handleDownloadMacroCSV = () => {
    const headers = [
      'Material',
      'UII_Serial',
      'Centro',
      'Deposito_Origem',
      'Deposito_Destino',
      'Quantidade',
      'Codigo_Solicitacao',
    ];
    const rows = effectiveMacroItems.map((i) =>
      [
        `"${i.material}"`,
        `"${i.serial}"`,
        `"${i.centro}"`,
        `"${i.depositoOrigem}"`,
        `"${i.depositoDestino}"`,
        `"1"`,
        `"${i.solicitationCode}"`,
      ].join(';')
    );
    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lote_macro_migo311_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-[#C2DEEB]">
              <Terminal className="w-5 h-5 text-[#C2DEEB]" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                Assistente SAP & Preparação p/ Macro MIGO 311
              </h3>
              <p className="text-[11px] sm:text-xs text-[#C2DEEB]">
                Lote validado com De-Para automático da Base IQ09 para execução sem falhas na Macro Excel / SAP GUI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
          {/* PAINEL DE AUDITORIA PRÉ-MACRO CONTRA A BASE IQ09 */}
          {batchAudit.hasBase ? (
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white border border-cyan-400/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-cyan-300">
                  <Database className="w-4 h-4" />
                  <span>CHECKLIST PRÉ-MACRO SAP (BATIMENTO COM BASE IQ09)</span>
                </div>

                {batchAudit.corrigiveis.length > 0 && onApplyIQ09DePara && (
                  <button
                    type="button"
                    disabled={isApplyingDePara}
                    onClick={handleApplyDeParaInQueue}
                    className="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 fill-slate-950" />
                    <span>
                      {isApplyingDePara
                        ? 'Gravando...'
                        : `⚡ Gravar De-Para IQ09 na Fila (${batchAudit.corrigiveis.length})`}
                    </span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30">
                  <div className="text-[10px] text-emerald-200 font-bold uppercase">🟢 100% OK IQ09</div>
                  <div className="text-lg font-black font-mono text-emerald-300">
                    {batchAudit.prontos.length}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/30">
                  <div className="text-[10px] text-amber-200 font-bold uppercase">🟠 De-Para Auto</div>
                  <div className="text-lg font-black font-mono text-amber-300">
                    {batchAudit.corrigiveis.length}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-400/30">
                  <div className="text-[10px] text-sky-200 font-bold uppercase">🔵 Já no Destino</div>
                  <div className="text-lg font-black font-mono text-sky-300">
                    {batchAudit.jaNoDestino.length}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-400/30">
                  <div className="text-[10px] text-rose-200 font-bold uppercase">🔴 S/ Saldo / Bloq.</div>
                  <div className="text-lg font-black font-mono text-rose-300">
                    {batchAudit.impedidos.length}
                  </div>
                </div>
              </div>

              {/* Opções de Blindagem da Macro */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/15 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useIQ09DeParaValues}
                    onChange={(e) => setUseIQ09DeParaValues(e.target.checked)}
                    className="rounded text-emerald-500 cursor-pointer"
                  />
                  <span className="text-white/90 font-semibold">
                    ⚡ Usar <strong>Material, Centro e Dep. Origem reais da IQ09</strong> na cópia p/ Macro
                  </span>
                </label>

                {(batchAudit.jaNoDestino.length > 0 || batchAudit.impedidos.length > 0) && (
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyMacroSafeItems}
                      onChange={(e) => setOnlyMacroSafeItems(e.target.checked)}
                      className="rounded text-emerald-500 cursor-pointer"
                    />
                    <span className="text-amber-200 font-semibold">
                      🛡️ Omitir {batchAudit.jaNoDestino.length + batchAudit.impedidos.length} item(ns) sem saldo/já no destino
                    </span>
                  </label>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#00609C] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#00609C] mb-0.5">Dica para o Time Midea no SAP:</div>
                <p className="text-slate-600">
                  Na transação <strong>MIGO</strong> (A08 Transferência / R10 Outros / Movimento <strong>311</strong>):
                  use os botões abaixo para alimentar sua <strong>Macro do Excel</strong> ou colar diretamente no grid da MIGO!
                </p>
              </div>
            </div>
          )}

          {/* Opção 1: Formato Macro Excel / Grid MIGO Completo (Material | UII | Centro | Origem | Destino | Qtd=1) */}
          <div className="border-2 border-[#0083CA]/40 rounded-xl p-4 bg-blue-50/30">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#00609C]" />
                <span className="text-xs font-extrabold text-[#002664]">
                  1. Lote Higienizado p/ Macro Excel & MIGO 311 ({effectiveMacroItems.length} itens)
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-900 font-mono font-bold px-2 py-0.5 rounded">
                  Agrupado por Rota SAP
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadMacroCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition-all cursor-pointer"
                  title="Baixar planilha .CSV pronta para alimentar a Macro do Excel"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Baixar .CSV p/ Macro</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(macroExcelText, 'macro')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all shadow-xs cursor-pointer ${
                    copiedType === 'macro'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#002664] hover:bg-[#003380] text-white'
                  }`}
                >
                  {copiedType === 'macro' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copiado p/ Macro!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Copiar p/ Macro Excel (c/ Qtd 1)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <pre className="text-[11px] font-mono bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto text-slate-700 max-h-32">
              {macroExcelText}
            </pre>
          </div>

          {/* Opção 2: Formato Tabela Grid SAP (Tab-Delimited) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">
                  2. Formato Tabela Tabulada ({effectiveMacroItems.length} itens)
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-700 font-mono px-1.5 py-0.5 rounded">
                  TAB Separated
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(tableText, 'table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer ${
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
            <pre className="text-[11px] font-mono bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto text-slate-700 max-h-28">
              {tableText}
            </pre>
          </div>

          {/* Opção 3: Apenas Lista de Seriais (1 por linha para tela de Seriais do SAP) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">
                  3. Apenas Lista de Seriais UII ({effectiveMacroItems.length} seriais)
                </span>
                <span className="text-[10px] bg-blue-100 text-[#00609C] font-mono px-1.5 py-0.5 rounded">
                  1 por linha
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(serialsText, 'serials')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer ${
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
        <div className="shrink-0 px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
