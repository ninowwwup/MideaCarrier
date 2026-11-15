import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  X,
  Copy,
  Check,
  Terminal,
  Layers,
  FileText,
  Database,
  Zap,
  ShieldCheck,
  Download,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Code2,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import { TransferItem } from '../types/transfer';
import { AuthUser } from '../types/auth';
import { formatForSAPTable, formatSerialsForSAP } from '../utils/sapFormatter';
import { auditTransferItemAgainstIQ09 } from '../services/iq09Service';
import { IQ09QueueItemAudit } from '../types/iq09';
import {
  MigoTextMode,
  MigoPostMode,
  MigoEngineOptions,
  SapBridgeStatusResponse,
  SapBatchExecutionResult,
  consolidateItemsForMigo311,
  formatGroupedMigoGridTSV,
  checkLocalSapBridgeStatus,
  executeMigo311ViaLocalBridge,
  downloadSapGuiVbsExecutor,
  downloadLocalSapBridgeLauncher,
  generateExcelVbaV2MacroCode,
} from '../utils/sapMigoEngine';

interface SAPCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TransferItem[];
  currentUser?: AuthUser | null;
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
  onCompleteBatchWithSapDoc?: (
    batchCompletions: Array<{
      itemIds: string[];
      sapDocNumber: string;
      centro: string;
    }>
  ) => void | Promise<void>;
}

export const SAPCopyModal: React.FC<SAPCopyModalProps> = ({
  isOpen,
  onClose,
  items,
  currentUser = null,
  iq09SnapshotVersion = null,
  onApplyIQ09DePara,
  onCompleteBatchWithSapDoc,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [useIQ09DeParaValues, setUseIQ09DeParaValues] = useState<boolean>(true);
  const [onlyMacroSafeItems, setOnlyMacroSafeItems] = useState<boolean>(true);
  const [isApplyingDePara, setIsApplyingDePara] = useState<boolean>(false);

  // Opções do Motor MIGO 311 Agrupado
  const [textMode, setTextMode] = useState<MigoTextMode>('vazio');
  const [customText, setCustomText] = useState<string>('Contagem');
  const [splitByCentro, setSplitByCentro] = useState<boolean>(true);
  const [postMode, setPostMode] = useState<MigoPostMode>('registrar');

  // Status da Ponte Local SAP (127.0.0.1:18311)
  const [bridgeStatus, setBridgeStatus] = useState<SapBridgeStatusResponse>({
    bridgeOnline: false,
    sapRunning: false,
    sapLogged: false,
  });
  const [isCheckingBridge, setIsCheckingBridge] = useState<boolean>(false);
  const [isExecutingSap, setIsExecutingSap] = useState<boolean>(false);
  const [executionResults, setExecutionResults] = useState<SapBatchExecutionResult[]>([]);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Documentos SAP informados manualmente por Centro (caso use o .vbs direto)
  const [manualCentroDocs, setManualCentroDocs] = useState<Record<string, string>>({});
  const [isCompletingBatch, setIsCompletingBatch] = useState<string | null>(null);
  const [showVbaCode, setShowVbaCode] = useState<boolean>(false);
  const [showLegacyCopyFormats, setShowLegacyCopyFormats] = useState<boolean>(false);

  const isMideaAuthenticated = currentUser?.role === 'midea';

  // Verifica status do Conector SAP ao abrir o modal
  const refreshSapBridgeStatus = useCallback(async () => {
    if (!isMideaAuthenticated) return;
    setIsCheckingBridge(true);
    try {
      const status = await checkLocalSapBridgeStatus();
      setBridgeStatus(status);
    } finally {
      setIsCheckingBridge(false);
    }
  }, [isMideaAuthenticated]);

  useEffect(() => {
    if (isOpen && isMideaAuthenticated) {
      refreshSapBridgeStatus();
      setExecutionResults([]);
      setExecutionError(null);
    }
  }, [isOpen, isMideaAuthenticated, refreshSapBridgeStatus]);

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

  // Prepara os itens efetivos que irão para o Motor de Agrupamento MIGO 311
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

    return [...mapped].sort((a, b) => {
      const routeA = `${a.centro}|${a.material}|${a.depositoOrigem}|${a.depositoDestino}`;
      const routeB = `${b.centro}|${b.material}|${b.depositoOrigem}|${b.depositoDestino}`;
      return routeA.localeCompare(routeB, 'pt-BR', { numeric: true });
    });
  }, [items, batchAudit, onlyMacroSafeItems, useIQ09DeParaValues]);

  const migoOptions: MigoEngineOptions = useMemo(
    () => ({
      textMode,
      customText,
      splitByCentro,
      postMode,
    }),
    [textMode, customText, splitByCentro, postMode]
  );

  // Consolidação inteligente por Material + Centro + Origem + Destino
  const migoPlan = useMemo(
    () => consolidateItemsForMigo311(effectiveMacroItems, migoOptions),
    [effectiveMacroItems, migoOptions]
  );

  if (!isOpen || items.length === 0) return null;

  // Bloqueio estrito caso um usuário não-Midea tente acessar
  if (!isMideaAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-rose-200 overflow-hidden p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            Acesso Restrito ao Time Midea (Admin SAP)
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            A execução automatizada da <strong>MIGO 311 no SAP</strong> é exclusiva para usuários autenticados no perfil <strong>MIDEA</strong> com sessão ativa no SAP Logon.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#06193E] text-white text-xs font-bold hover:bg-[#0B2A63] cursor-pointer"
          >
            Entendi
          </button>
        </div>
      </div>
    );
  }

  const tableText = formatForSAPTable(effectiveMacroItems);
  const serialsText = formatSerialsForSAP(effectiveMacroItems);
  const groupedGridTSV = formatGroupedMigoGridTSV(
    migoPlan.allGroupedLines,
    textMode !== 'vazio'
  );
  const vbaV2Code = generateExcelVbaV2MacroCode(migoOptions);

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

  // Disparo 1-Click no SAP via Ponte Local (ou download imediato do executor .vbs caso a ponte não esteja ativa)
  const handleExecute1ClickSap = async () => {
    setExecutionError(null);
    setExecutionResults([]);

    // Revalida status da ponte local
    const latestStatus = await checkLocalSapBridgeStatus();
    setBridgeStatus(latestStatus);

    if (latestStatus.bridgeOnline) {
      if (!latestStatus.sapLogged) {
        setExecutionError(
          'O Conector MIGOU-SAP está ativo, porém o SAP Logon está fechado ou deslogado. Abra o SAP e faça login com seu usuário Midea antes de executar.'
        );
        return;
      }

      setIsExecutingSap(true);
      try {
        const res = await executeMigo311ViaLocalBridge(migoPlan.batches, migoOptions);
        if (!res.ok) {
          setExecutionError(res.errorMessage || 'Falha ao executar lote na MIGO 311.');
          return;
        }

        setExecutionResults(res.results);

        // Se gerou Documentos SAP 49xxxxxxxx com sucesso, conclui automaticamente na fila do MIGOU!
        const completedBatches = res.results
          .filter((r) => r.status === 'success' && r.docSap && r.itemIds.length > 0)
          .map((r) => ({
            itemIds: r.itemIds,
            sapDocNumber: r.docSap!,
            centro: r.centro,
          }));

        if (completedBatches.length > 0 && onCompleteBatchWithSapDoc) {
          await onCompleteBatchWithSapDoc(completedBatches);
        }
      } finally {
        setIsExecutingSap(false);
      }
    } else {
      // Se o conector em segundo plano não estiver aberto, dispara o Executor Direto .VBS nativo do Windows!
      downloadSapGuiVbsExecutor(migoPlan.batches, migoOptions);
    }
  };

  const handleManualCompleteCentroBatch = async (centro: string, itemIds: string[]) => {
    const docNum = (manualCentroDocs[centro] || '').trim();
    if (!docNum) return;
    if (!onCompleteBatchWithSapDoc) return;

    setIsCompletingBatch(centro);
    try {
      await onCompleteBatchWithSapDoc([
        {
          centro,
          sapDocNumber: docNum,
          itemIds,
        },
      ]);
    } finally {
      setIsCompletingBatch(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Safira MIGOU */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 migou-header-solid text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2 rounded-xl bg-[#0083CA]/25 border border-[#38BDF8]/30 text-[#38BDF8] shrink-0">
              <Cpu className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                  Automação SAP MIGO 311 (1-Click) • Agrupamento Inteligente
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-extrabold uppercase">
                  Exclusivo Time Midea ({currentUser?.username})
                </span>
              </div>
              <p className="text-[11px] text-[#BAE6FD] truncate">
                Consolida automaticamente por Material + Centro + Depósito, elimina travamentos de linhas e preenche os Nºs de Série na MIGO 311
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 overscroll-contain bg-slate-50/60">
          {/* 1. BARRA DE STATUS DO SAP LOGON + DISPARO 1-CLICK */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-[#06193E] via-[#092356] to-[#0E357A] text-white border border-[#38BDF8]/30 shadow-md space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Status da Sessão SAP */}
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    bridgeStatus.bridgeOnline && bridgeStatus.sapLogged
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                      : bridgeStatus.bridgeOnline && !bridgeStatus.sapLogged
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                      : 'bg-[#0083CA]/30 border-[#38BDF8]/40 text-[#38BDF8]'
                  }`}
                >
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#BAE6FD]">
                      Status da Integração SAP GUI:
                    </span>
                    {bridgeStatus.bridgeOnline && bridgeStatus.sapLogged ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-[11px] font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        SAP Logado ({bridgeStatus.sapUser} • {bridgeStatus.sapSystem}/{bridgeStatus.sapClient})
                      </span>
                    ) : bridgeStatus.bridgeOnline && !bridgeStatus.sapLogged ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/40 text-amber-200 text-[11px] font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        Conector Ativo • Faça Login no SAP GUI
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/25 border border-sky-400/40 text-sky-200 text-[11px] font-bold">
                        Modo Executor Direto SAP (.VBS) Pronto
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={refreshSapBridgeStatus}
                      disabled={isCheckingBridge}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-sky-200 transition-colors cursor-pointer"
                      title="Verificar novamente se o SAP está logado"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingBridge ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {bridgeStatus.bridgeOnline && bridgeStatus.sapLogged
                      ? 'Sessão SAP detectada! Clique em "Executar Agora na MIGO 311" para movimentar e baixar a fila automaticamente.'
                      : 'Execute direto pelo Script Nativo SAP (.vbs) com 1 clique ou ative o Conector Local (.bat) para retorno automático do Doc SAP.'}
                  </p>
                </div>
              </div>

              {/* Botões Principais de Execução 1-Click */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!bridgeStatus.bridgeOnline && (
                  <button
                    type="button"
                    onClick={downloadLocalSapBridgeLauncher}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Baixa o Conector Local leve (.bat) para que o navegador converse direto com o SAP e capture o Doc 49xxxxxxxx sozinho"
                  >
                    <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Conector Auto (.bat)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => downloadSapGuiVbsExecutor(migoPlan.batches, migoOptions)}
                  className="px-3.5 py-2 rounded-xl bg-[#0083CA] hover:bg-[#00609C] border border-[#38BDF8]/40 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Gera e baixa o executor direto .VBS com todas as linhas agrupadas. Basta clicar no arquivo baixado para preencher a MIGO 311 no SAP aberto!"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Disparar Script Direto SAP (.vbs)</span>
                </button>

                {bridgeStatus.bridgeOnline && (
                  <button
                    type="button"
                    disabled={isExecutingSap || !bridgeStatus.sapLogged}
                    onClick={handleExecute1ClickSap}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95 ${
                      bridgeStatus.sapLogged
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>
                      {isExecutingSap
                        ? 'Processando na MIGO 311...'
                        : '⚡ Executar na MIGO 311 Agora (1-Click)'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Feedback de Erro ou Resultados da Execução 1-Click */}
            {executionError && (
              <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold text-white">Aviso do Robô SAP: </span>
                  {executionError}
                </div>
              </div>
            )}

            {executionResults.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/40 space-y-2">
                <div className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Relatório de Execução no SAP MIGO 311:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {executionResults.map((res, idx) => (
                    <div
                      key={`${res.centro}-${idx}`}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                        res.status === 'success'
                          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                          : res.status === 'verified'
                          ? 'bg-sky-950/60 border-sky-500/40 text-sky-200'
                          : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold">
                          Centro {res.centro} ({res.serialCount} seriais)
                        </div>
                        <div className="text-[11px] opacity-90">{res.message}</div>
                      </div>
                      {res.docSap && (
                        <span className="px-2 py-1 rounded bg-emerald-500 text-slate-950 font-mono font-black text-xs shrink-0">
                          Doc: {res.docSap}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. CONFIGURAÇÕES DE AGRUPAMENTO E PREENCHIMENTO DA MIGO 311 */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#0083CA]" />
                <span className="text-xs font-extrabold text-[#06193E] uppercase tracking-wide">
                  Parâmetros da Tela MIGO 311 (Transferência • Outros/as • Mov. 311)
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-bold">
                  {migoPlan.totalUniqueSerials} seriais consolidados em {migoPlan.allGroupedLines.length} linha(s) na MIGO
                </span>
                {migoPlan.compressionRatioPct > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#E0F2FE] text-[#002664] font-extrabold">
                    -{migoPlan.compressionRatioPct}% linhas repetidas
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Controle 1: Coluna Texto */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <label className="font-extrabold text-slate-700 block text-[11px] uppercase">
                  Coluna &quot;Texto&quot; (GOITEM-SGTXT):
                </label>
                <select
                  value={textMode}
                  onChange={(e) => setTextMode(e.target.value as MigoTextMode)}
                  className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <option value="vazio">Em branco (Mais rápido • Não obrigatório)</option>
                  <option value="contagem">Preencher &quot;Contagem&quot;</option>
                  <option value="custom">Texto Personalizado...</option>
                </select>
                {textMode === 'custom' && (
                  <input
                    type="text"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Ex: Contagem / MIGOU"
                    className="w-full h-7 px-2 rounded border border-slate-300 bg-white text-xs"
                  />
                )}
              </div>

              {/* Controle 2: Divisão de Documentos por Centro */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <label className="font-extrabold text-slate-700 block text-[11px] uppercase">
                  Agrupamento por Centro (Cen.):
                </label>
                <select
                  value={splitByCentro ? 'por_centro' : 'unico'}
                  onChange={(e) => setSplitByCentro(e.target.value === 'por_centro')}
                  className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <option value="por_centro">1 Documento MIGO por Centro (Recomendado)</option>
                  <option value="unico">Todos os Centros no mesmo Documento MIGO</option>
                </select>
                <p className="text-[10px] text-slate-500">
                  Separar por Centro garante que um bloqueio no B158 não impeça gravar o B124.
                </p>
              </div>

              {/* Controle 3: Modo de Finalização no SAP */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <label className="font-extrabold text-slate-700 block text-[11px] uppercase">
                  Ação Final na MIGO 311:
                </label>
                <select
                  value={postMode}
                  onChange={(e) => setPostMode(e.target.value as MigoPostMode)}
                  className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <option value="registrar">Verificar e Registrar (Gravar Doc 49xxxxxxxx)</option>
                  <option value="verificar">Apenas Preencher e Verificar na Tela</option>
                </select>
                <p className="text-[10px] text-slate-500">
                  O robô sempre clica em &quot;Verificar&quot; antes para validar os seriais.
                </p>
              </div>
            </div>

            {/* Opções de Blindagem IQ09 */}
            {batchAudit.hasBase && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useIQ09DeParaValues}
                      onChange={(e) => setUseIQ09DeParaValues(e.target.checked)}
                      className="rounded text-[#0083CA] cursor-pointer"
                    />
                    <span className="text-slate-700 font-semibold">
                      Usar <strong>Material, Centro e Dep. Origem reais da IQ09</strong> ({batchAudit.corrigiveis.length} De-Para)
                    </span>
                  </label>

                  {(batchAudit.jaNoDestino.length > 0 || batchAudit.impedidos.length > 0) && (
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyMacroSafeItems}
                        onChange={(e) => setOnlyMacroSafeItems(e.target.checked)}
                        className="rounded text-[#0083CA] cursor-pointer"
                      />
                      <span className="text-rose-700 font-semibold">
                        Omitir {batchAudit.jaNoDestino.length + batchAudit.impedidos.length} serial(is) já no destino ou sem saldo
                      </span>
                    </label>
                  )}
                </div>

                {batchAudit.corrigiveis.length > 0 && onApplyIQ09DePara && (
                  <button
                    type="button"
                    disabled={isApplyingDePara}
                    onClick={handleApplyDeParaInQueue}
                    className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Zap className="w-3 h-3 fill-slate-950" />
                    <span>
                      {isApplyingDePara
                        ? 'Gravando...'
                        : `Gravar De-Para IQ09 na Fila (${batchAudit.corrigiveis.length})`}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 3. ESPELHO DA GRADE MIGO 311 AGRUPADA (EXATAMENTE NAS COLUNAS DO SAP DO USUÁRIO) */}
          <div className="space-y-3">
            {migoPlan.batches.map((batch) => (
              <div
                key={`batch-${batch.centro}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Cabeçalho do Lote (Documento MIGO por Centro) */}
                <div className="px-4 py-2.5 bg-[#F0F7FF] border-b border-[#BAE6FD]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#06193E] text-white font-mono font-extrabold text-xs">
                      Centro {batch.centro}
                    </span>
                    <span className="text-xs font-extrabold text-[#002664]">
                      {batch.totalLines} Linha(s) na Grade MIGO • Total Qtd.em UMR = {batch.totalSerials} seriais
                    </span>
                  </div>

                  {/* Ações Rápidas do Centro: Baixar .VBS deste Centro ou Concluir informando Doc SAP */}
                  <div className="flex flex-wrap items-center gap-2">
                    {onCompleteBatchWithSapDoc && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={manualCentroDocs[batch.centro] || ''}
                          onChange={(e) =>
                            setManualCentroDocs((prev) => ({
                              ...prev,
                              [batch.centro]: e.target.value,
                            }))
                          }
                          placeholder="Doc SAP (ex: 4907901553)"
                          className="h-7 w-40 px-2 rounded-lg border border-slate-300 bg-white text-[11px] font-mono text-slate-800 focus:outline-none focus:border-[#0083CA]"
                        />
                        <button
                          type="button"
                          disabled={
                            !manualCentroDocs[batch.centro]?.trim() ||
                            isCompletingBatch === batch.centro
                          }
                          onClick={() =>
                            handleManualCompleteCentroBatch(batch.centro, batch.itemIds)
                          }
                          className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors"
                          title="Grava este Documento SAP e marca todos os seriais deste Centro como Concluído"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>
                            {isCompletingBatch === batch.centro
                              ? 'Salvando...'
                              : `Concluir (${batch.totalSerials})`}
                          </span>
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => downloadSapGuiVbsExecutor([batch], migoOptions)}
                      className="h-7 px-2.5 rounded-lg bg-[#002664] hover:bg-[#00488E] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      title={`Executar apenas o Centro ${batch.centro} na MIGO 311`}
                    >
                      <Play className="w-3 h-3 fill-current text-[#38BDF8]" />
                      <span>Rodar {batch.centro} (.vbs)</span>
                    </button>
                  </div>
                </div>

                {/* Tabela imitando exatamente o Grid da MIGO 311 do print */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-extrabold text-slate-700">
                        <th className="py-2 px-3 border-r border-slate-200 w-14 text-center">
                          Linha
                        </th>
                        <th className="py-2 px-3 border-r border-slate-200">
                          Txt.brv.material
                        </th>
                        <th className="py-2 px-3 border-r border-slate-200 w-20 text-center">
                          Cen.
                        </th>
                        <th className="py-2 px-3 border-r border-slate-200 w-24 text-center">
                          Depósito
                        </th>
                        <th className="py-2 px-3 border-r border-slate-200 w-36 text-center">
                          Depósito RegTran.
                        </th>
                        <th className="py-2 px-3 border-r border-slate-200 w-28 text-center">
                          Qtd.em UMR
                        </th>
                        <th className="py-2 px-3 border-r border-slate-200 w-28">
                          Texto
                        </th>
                        <th className="py-2 px-3">
                          Aba Dados det. → Nº de Série (UIIs Agrupados)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {batch.lines.map((line) => {
                        const copySerialsKey = `ser-${batch.centro}-${line.lineNumber}`;
                        return (
                          <tr
                            key={line.groupKey}
                            className="hover:bg-sky-50/40 transition-colors"
                          >
                            <td className="py-2 px-3 border-r border-slate-200 text-center font-mono font-bold text-slate-500 bg-slate-50">
                              {line.lineNumber}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-extrabold text-[#06193E]">
                              {line.material}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-center font-mono font-bold text-slate-800">
                              {line.centro}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-center">
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-bold text-[11px]">
                                {line.depositoOrigem}
                              </span>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-center">
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold text-[11px]">
                                {line.depositoDestino}
                              </span>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-center">
                              <span className="px-2.5 py-0.5 rounded-full bg-[#002664] text-white font-mono font-black text-xs">
                                {line.quantidade}
                              </span>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono text-[11px] text-slate-500">
                              {line.texto ? (
                                <span className="text-slate-800 font-semibold">{line.texto}</span>
                              ) : (
                                <span className="italic text-slate-400">(vazio)</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto">
                                  {line.serials.map((s) => (
                                    <span
                                      key={s}
                                      className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-700"
                                    >
                                      {s}
                                    </span>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopy(line.serials.join('\r\n'), copySerialsKey)
                                  }
                                  className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                    copiedType === copySerialsKey
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                  }`}
                                  title="Copiar apenas os seriais desta linha para colar na aba Nº de Série da MIGO"
                                >
                                  {copiedType === copySerialsKey ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      <span>Copiado</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copiar ({line.quantidade})</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* 4. SEÇÃO EXPANSÍVEL: CÓDIGO MACRO VBA V2 AGRUPADA (PARA QUEM QUISER ATUALIZAR A PLANILHA .XLSM) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowVbaCode(!showVbaCode)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#0083CA]" />
                <span className="text-xs font-extrabold text-slate-800">
                  Macro VBA V2 com Agrupamento Automático (Para atualizar sua planilha Excel .xlsm)
                </span>
              </div>
              {showVbaCode ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showVbaCode && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-600">
                    Caso ainda utilize a planilha <code>.xlsm</code> em paralelo, substitua o módulo antigo por este código VBA V2 que agrupa por Material e Centro automaticamente:
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopy(vbaV2Code, 'vba_v2')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      copiedType === 'vba_v2'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#06193E] hover:bg-[#0B2A63] text-white'
                    }`}
                  >
                    {copiedType === 'vba_v2' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Código VBA Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>Copiar Macro VBA V2</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-[11px] font-mono bg-slate-900 text-sky-200 p-3 rounded-xl overflow-x-auto max-h-56">
                  {vbaV2Code}
                </pre>
              </div>
            )}
          </div>

          {/* 5. SEÇÃO EXPANSÍVEL: CÓPIA MANUAL TABULADA (CONTINGÊNCIA) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLegacyCopyFormats(!showLegacyCopyFormats)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-extrabold text-slate-700">
                  Opções de Cópia Manual (Grade MIGO Tabulada e Lista Geral de Seriais)
                </span>
              </div>
              {showLegacyCopyFormats ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showLegacyCopyFormats && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Grade MIGO Consolidada ({migoPlan.allGroupedLines.length} linhas)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(groupedGridTSV, 'grouped_tsv')}
                      className="px-2.5 py-1 rounded-lg bg-[#0083CA] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedType === 'grouped_tsv' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedType === 'grouped_tsv' ? 'Copiado!' : 'Copiar Grade'}</span>
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto max-h-24">
                    {groupedGridTSV}
                  </pre>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Todos os Seriais ({effectiveMacroItems.length}) • Sem Agrupamento
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopy(tableText, 'table')}
                        className="px-2 py-1 rounded-lg bg-slate-200 text-slate-800 text-[11px] font-bold cursor-pointer"
                      >
                        {copiedType === 'table' ? 'TAB Copiado!' : 'Copiar TAB'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(serialsText, 'serials')}
                        className="px-2 py-1 rounded-lg bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                      >
                        {copiedType === 'serials' ? 'Seriais Copiados!' : 'Só Seriais'}
                      </button>
                    </div>
                  </div>
                  <pre className="text-[10px] font-mono bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto max-h-24">
                    {serialsText}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#0083CA]" />
            <span>
              Ordem das Colunas MIGO: <strong>Txt.brv.material → Cen. → Depósito → Depósito RegTran. → Qtd.em UMR → Texto</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
