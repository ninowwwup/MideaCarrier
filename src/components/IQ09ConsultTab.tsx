import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Layers,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Trash2,
  Download,
  ClipboardPaste,
  Check,
  Filter,
  Database,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  User,
  Info,
  X,
} from 'lucide-react';
import {
  IQ09Item,
  IQ09Snapshot,
  IQ09BatchValidationItem,
  IQ09CrossCheckStatus,
} from '../types/iq09';
import { TransferItem } from '../types/transfer';
import {
  parseIQ09File,
  parseRawIQ09Text,
  saveAndActivateIQ09Snapshot,
  clearIQ09Snapshot,
  validateSerialsBatchAgainstIQ09,
  getOfficialSampleIQ09Items,
} from '../services/iq09Service';
import {
  SAP_CENTROS_CATALOG,
  SAP_DEPOSITOS_CATALOG,
  DEFINITIVE_DAMAGE_DEPOSITS,
} from '../utils/sapFormatter';
import { CURRENT_SESSION_ID } from '../services/storage';

interface IQ09ConsultTabProps {
  snapshot: IQ09Snapshot | null;
  queueItems: TransferItem[];
  defaultSolicitante: string;
  currentRole: string;
  onImportBatchRequests: (newItems: TransferItem[]) => Promise<void> | void;
  onOpenNewRequestWithPreset: (preset: {
    material?: string;
    seriais?: string[];
    centro: string;
    depositoOrigem: string;
    depositoDestino: string;
  }) => void;
  onSwitchToQueueTab: () => void;
}

const PAGE_SIZE = 100;

export const IQ09ConsultTab: React.FC<IQ09ConsultTabProps> = ({
  snapshot,
  queueItems,
  defaultSolicitante,
  currentRole,
  onImportBatchRequests,
  onOpenNewRequestWithPreset,
  onSwitchToQueueTab,
}) => {
  // Sub-aba ativa: 'validador' (De-Para Mastigado p/ Buiatte) | 'explorador' (Consulta Geral IQ09)
  const [subTab, setSubTab] = useState<'validador' | 'explorador'>('validador');

  // Estados do Modal/Painel de Upload da IQ09
  const [isImporterOpen, setIsImporterOpen] = useState<boolean>(!snapshot);
  const [importMode, setImportMode] = useState<'file' | 'paste'>('file');
  const [rawPasteText, setRawPasteText] = useState<string>('');
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estados do Validador e De-Para em Lote (Sub-aba 1)
  const [batchSerialsInput, setBatchSerialsInput] = useState<string>('');
  const [targetDepositOption, setTargetDepositOption] = useState<string>('AUTO_LIVRE');
  const [solicitante, setSolicitante] = useState<string>(defaultSolicitante);
  const [validationFilter, setValidationFilter] = useState<'todos' | IQ09CrossCheckStatus>('todos');
  const [isSubmittingAptos, setIsSubmittingAptos] = useState<boolean>(false);

  // Estados do Explorador de Consulta Geral da IQ09 (Sub-aba 2)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [centroFilter, setCentroFilter] = useState<string>('todos');
  const [depositoFilter, setDepositoFilter] = useState<string>('todos');
  const [catFilter, setCatFilter] = useState<'todos' | 'livre' | 'triagem_falta' | 'avaria'>('todos');
  const [statusSapFilter, setStatusSapFilter] = useState<string>('todos');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedExplorerSerials, setSelectedExplorerSerials] = useState<Set<string>>(new Set());

  const iq09Items = snapshot?.items || [];
  const metadata = snapshot?.metadata || null;

  // Cálculo de frescor da base IQ09 (verde até 3h, amarelo > 3h)
  const snapshotFreshness = useMemo(() => {
    if (!metadata) return { isStale: false, ageText: 'Sem base carregada', minutes: 0 };
    const diffMs = Math.max(0, Date.now() - new Date(metadata.updatedAt).getTime());
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const ageText =
      mins < 1
        ? 'agora mesmo'
        : hours > 0
        ? `há ${hours}h ${remMins}min`
        : `há ${mins} min`;
    return {
      isStale: mins > 180,
      ageText,
      minutes: mins,
    };
  }, [metadata]);

  // Indicadores estratégicos da base IQ09 carregada
  const iq09Stats = useMemo(() => {
    let livreCount = 0;
    let triagemOuFaltaCount = 0;
    let avariaCount = 0;
    let outrosStatusCount = 0;

    for (const item of iq09Items) {
      const depInfo = SAP_DEPOSITOS_CATALOG[item.deposito];
      if (DEFINITIVE_DAMAGE_DEPOSITS[item.deposito]) {
        avariaCount++;
      } else if (
        depInfo?.category === 'estoque_livre' ||
        depInfo?.category === 'blue_service'
      ) {
        livreCount++;
      } else if (
        item.deposito === 'B148' ||
        depInfo?.category === 'inventario_falta_definitivo'
      ) {
        triagemOuFaltaCount++;
      }

      if (item.statusSistema && item.statusSistema !== 'DEPS') {
        outrosStatusCount++;
      }
    }

    return {
      total: iq09Items.length,
      uniqueMaterials: metadata?.uniqueMaterials || 0,
      livreCount,
      triagemOuFaltaCount,
      avariaCount,
      outrosStatusCount,
    };
  }, [iq09Items, metadata]);

  // Mapa rápido dos itens ativos na fila do MIGOU para exibir na tabela de consulta geral
  const activeQueueMap = useMemo(() => {
    const map = new Map<string, TransferItem>();
    for (const q of queueItems) {
      if (q.status === 'pendente' || q.status === 'em_analise') {
        map.set(q.serial.trim().toUpperCase(), q);
      }
    }
    return map;
  }, [queueItems]);

  // Resultado do Validador & De-Para em Lote
  const batchValidationResults: IQ09BatchValidationItem[] = useMemo(() => {
    if (!batchSerialsInput.trim()) return [];
    return validateSerialsBatchAgainstIQ09(batchSerialsInput, targetDepositOption, queueItems);
  }, [batchSerialsInput, targetDepositOption, queueItems, snapshot]);

  // Contadores das 4 categorias do Validador em Lote
  const validationCounts = useMemo(() => {
    let aptos = 0;
    let jaNoDestino = 0;
    let jaNaFila = 0;
    let impedidos = 0;

    for (const r of batchValidationResults) {
      if (r.status === 'apto_transferir' || r.status === 'divergencia_rota_centro') {
        aptos++;
      } else if (r.status === 'ja_no_destino') {
        jaNoDestino++;
      } else if (r.status === 'ja_na_fila_migou') {
        jaNaFila++;
      } else {
        impedidos++;
      }
    }

    return {
      total: batchValidationResults.length,
      aptos,
      jaNoDestino,
      jaNaFila,
      impedidos,
    };
  }, [batchValidationResults]);

  const filteredValidationResults = useMemo(() => {
    if (validationFilter === 'todos') return batchValidationResults;
    if (validationFilter === 'apto_transferir') {
      return batchValidationResults.filter(
        (r) => r.status === 'apto_transferir' || r.status === 'divergencia_rota_centro'
      );
    }
    if (validationFilter === 'nao_encontrado_iq09') {
      return batchValidationResults.filter(
        (r) =>
          r.status === 'nao_encontrado_iq09' ||
          r.status === 'bloqueado_avaria_origem' ||
          r.status === 'bloqueado_status_sap'
      );
    }
    return batchValidationResults.filter((r) => r.status === validationFilter);
  }, [batchValidationResults, validationFilter]);

  // Listas dinâmicas de filtros do Explorador IQ09
  const allIQ09Centros = useMemo(() => {
    return Array.from(new Set(iq09Items.map((i) => i.centro).filter(Boolean))).sort();
  }, [iq09Items]);

  const allIQ09Depositos = useMemo(() => {
    return Array.from(new Set(iq09Items.map((i) => i.deposito).filter(Boolean))).sort();
  }, [iq09Items]);

  // Filtragem de alta performance do Explorador da IQ09
  const filteredExplorerItems = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();

    return iq09Items.filter((item) => {
      if (centroFilter !== 'todos' && item.centro !== centroFilter) return false;
      if (depositoFilter !== 'todos' && item.deposito !== depositoFilter) return false;
      if (statusSapFilter !== 'todos') {
        if (statusSapFilter === 'DEPS' && item.statusSistema !== 'DEPS') return false;
        if (statusSapFilter === 'OUTROS' && item.statusSistema === 'DEPS') return false;
      }

      if (catFilter !== 'todos') {
        const depInfo = SAP_DEPOSITOS_CATALOG[item.deposito];
        const isAvaria = Boolean(DEFINITIVE_DAMAGE_DEPOSITS[item.deposito]);
        const isLivre =
          depInfo?.category === 'estoque_livre' || depInfo?.category === 'blue_service';
        const isTriagemOuFalta =
          item.deposito === 'B148' || depInfo?.category === 'inventario_falta_definitivo';

        if (catFilter === 'livre' && !isLivre) return false;
        if (catFilter === 'triagem_falta' && !isTriagemOuFalta) return false;
        if (catFilter === 'avaria' && !isAvaria) return false;
      }

      if (q) {
        const match =
          item.serial.includes(q) ||
          item.material.includes(q) ||
          item.centro.includes(q) ||
          item.deposito.includes(q) ||
          (item.equipamento && item.equipamento.includes(q)) ||
          (item.modificadoPor && item.modificadoPor.includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [iq09Items, searchQuery, centroFilter, depositoFilter, catFilter, statusSapFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredExplorerItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedExplorerItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredExplorerItems.slice(start, start + PAGE_SIZE);
  }, [filteredExplorerItems, safePage]);

  // ============================================================================
  // HANDLERS DE IMPORTAÇÃO DO SNAPSHOT IQ09
  // ============================================================================

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsParsingFile(true);
    setImportError(null);
    setImportSuccessMsg(null);

    try {
      const parsed = await parseIQ09File(file);
      if (parsed.length === 0) {
        setImportError(
          'Nenhum registro válido (Material + UII/Serial) foi encontrado neste arquivo. Verifique se a planilha contém as colunas Material, UII, Centro e Depósito.'
        );
        return;
      }

      const snap = await saveAndActivateIQ09Snapshot(parsed, {
        updatedBy: defaultSolicitante || 'Time Midea (SAP)',
        fileName: file.name,
        sourceType: file.name.toLowerCase().endsWith('.xlsx') ? 'xlsx_upload' : 'csv_upload',
      });

      setImportSuccessMsg(
        `Fotografia IQ09 atualizada com sucesso! ${snap.metadata.totalItems.toLocaleString('pt-BR')} UIIs (Seriais) e ${snap.metadata.uniqueMaterials} materiais mapeados.`
      );
      setIsImporterOpen(false);
    } catch (err: any) {
      setImportError(String(err?.message || 'Erro ao ler o arquivo da IQ09.'));
    } finally {
      setIsParsingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteImport = async () => {
    if (!rawPasteText.trim()) return;
    setIsParsingFile(true);
    setImportError(null);
    setImportSuccessMsg(null);

    try {
      const parsed = parseRawIQ09Text(rawPasteText);
      if (parsed.length === 0) {
        setImportError(
          'Nenhuma linha válida identificada. Copie as colunas direto do Excel da IQ09 (Material, UII, Centro, Depósito...).'
        );
        return;
      }

      const snap = await saveAndActivateIQ09Snapshot(parsed, {
        updatedBy: defaultSolicitante || 'Time Midea (SAP)',
        fileName: 'Colagem_Direta_IQ09.xlsx',
        sourceType: 'clipboard_paste',
      });

      setRawPasteText('');
      setImportSuccessMsg(
        `Base colada com sucesso! ${snap.metadata.totalItems.toLocaleString('pt-BR')} seriais (UII) ativos para consulta.`
      );
      setIsImporterOpen(false);
    } catch (err: any) {
      setImportError(String(err?.message || 'Erro ao processar texto colado.'));
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleLoadOfficialSample = async () => {
    setIsParsingFile(true);
    setImportError(null);
    try {
      const sampleItems = getOfficialSampleIQ09Items();
      const snap = await saveAndActivateIQ09Snapshot(sampleItems, {
        updatedBy: defaultSolicitante || 'Time Midea (SAP)',
        fileName: 'Amostra_Real_IQ09_Midea.xlsx',
        sourceType: 'sample',
      });

      // Já preenche exemplos reais no validador para o usuário ver o cruzamento funcionando na hora
      setBatchSerialsInput(
        [
          '541760002ZGB4133400502', // Apto (em B148 -> vai p/ B110 no B124)
          '541760002ZGB4133400533', // Apto (em B148 -> vai p/ B110 no B124)
          'S1326B21294802', // Apto (em B111 -> vai p/ B413 no B179)
          'S1326B21294807', // Apto (em B111 -> vai p/ B114 no B158)
          'S4221B10960628', // Já está no destino B413 (do print!)
          'S4621B11175122', // Já está no destino B413 (do print!)
          '541711001X9B6233500679', // Bloqueado em Avaria Definitiva B136
        ].join('\n')
      );

      setImportSuccessMsg(
        `Amostra oficial da IQ09 carregada (${snap.metadata.totalItems} seriais mapeados)! Confira o cruzamento automático abaixo.`
      );
      setIsImporterOpen(false);
    } finally {
      setIsParsingFile(false);
    }
  };

  // ============================================================================
  // GERAR SOLICITAÇÕES COM 1 CLIQUE A PARTIR DOS SERIAIS APTOS NA IQ09
  // ============================================================================

  const handleCreateRequestsForAptos = async () => {
    const aptosList = batchValidationResults.filter(
      (r) => r.canCreateRequest && r.iq09Item && r.suggestedOrigem !== r.suggestedDestino
    );
    if (aptosList.length === 0) return;

    setIsSubmittingAptos(true);
    try {
      const now = new Date().toISOString();
      const batchId = `BATCH-IQ09-${Date.now().toString().slice(-4)}`;
      const finalSolicitante = solicitante.trim() || defaultSolicitante || 'Time Buiatte (WMS)';

      const newTransferItems: TransferItem[] = aptosList.map((row, idx) => ({
        id: `iq09req-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        solicitationCode: `SOL-${1000 + queueItems.length + idx + 1}`,
        material: row.suggestedMaterial,
        serial: row.inputSerial,
        centro: row.suggestedCentro,
        depositoOrigem: row.suggestedOrigem,
        depositoDestino: row.suggestedDestino,
        status: 'pendente',
        criadoEm: now,
        criadoPor: finalSolicitante,
        atualizadoEm: now,
        prioridadeFifo: queueItems.length + idx + 1,
        slaStatus: 'no_prazo',
        batchId,
        observacoes: `Validado automaticamente via Base IQ09 (Status SAP: ${row.iq09Item?.statusSistema || 'DEPS'})`,
        originatorClientId: CURRENT_SESSION_ID,
      }));

      await onImportBatchRequests(newTransferItems);

      // Remove do campo apenas os seriais que já foram enviados, ou limpa tudo
      setBatchSerialsInput('');
      onSwitchToQueueTab();
    } finally {
      setIsSubmittingAptos(false);
    }
  };

  // Exportar consulta filtrada da IQ09 para CSV
  const handleExportFilteredIQ09 = () => {
    if (filteredExplorerItems.length === 0) return;
    const headers = [
      'Material',
      'UII',
      'Centro',
      'Depósito',
      'Tipo de estoque',
      'Status sistema',
      'Modificado em',
      'Modificado por',
      'Equipamento',
    ];
    const rows = filteredExplorerItems.map((it) =>
      [
        `"${it.material}"`,
        `"${it.serial}"`,
        `"${it.centro}"`,
        `"${it.deposito}"`,
        `"${it.tipoEstoque}"`,
        `"${it.statusSistema}"`,
        `"${it.modificadoEm || ''}"`,
        `"${it.modificadoPor || ''}"`,
        `"${it.equipamento || ''}"`,
      ].join(';')
    );
    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consulta_iq09_migou_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Enviar seriais selecionados no Explorador para o Modal de Nova Solicitação ou Validador
  const handleRequestFromExplorerSelection = () => {
    if (selectedExplorerSerials.size === 0) return;
    const selectedItems = iq09Items.filter((i) => selectedExplorerSerials.has(i.serial));
    if (selectedItems.length === 0) return;

    const first = selectedItems[0];
    const sameMaterialAndRoute = selectedItems.every(
      (i) => i.material === first.material && i.centro === first.centro && i.deposito === first.deposito
    );

    if (sameMaterialAndRoute) {
      const cInfo = SAP_CENTROS_CATALOG[first.centro];
      const recommendedDest = cInfo?.freeStockProductDeposit || 'B110';
      onOpenNewRequestWithPreset({
        material: first.material,
        seriais: selectedItems.map((i) => i.serial),
        centro: first.centro,
        depositoOrigem: first.deposito,
        depositoDestino: first.deposito === recommendedDest ? 'B111' : recommendedDest,
      });
    } else {
      // Se selecionou múltiplos materiais ou centros diferentes, joga para o Validador em Lote!
      setBatchSerialsInput(selectedItems.map((i) => i.serial).join('\n'));
      setSubTab('validador');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. CABEÇALHO DA FOTOGRAFIA ATUAL DO ESTOQUE SAP (SNAPSHOT IQ09) */}
      <div className="bg-white/95 backdrop-blur-2xl rounded-2xl border border-white/70 shadow-[0_18px_50px_rgba(0,0,0,0.14)] p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#002664] text-white text-xs font-extrabold tracking-wide">
                <Database className="w-3.5 h-3.5 text-cyan-300" />
                <span>CENTRAL SAP IQ09 • SNAPSHOT EM TEMPO REAL</span>
              </span>

              {metadata ? (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
                    snapshotFreshness.isStale
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      snapshotFreshness.isStale ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-pulse'
                    }`}
                  />
                  <span>
                    {snapshotFreshness.isStale ? '🟡 Atenção: Base com +3h' : '🟢 Base IQ09 Ativa'} ({snapshotFreshness.ageText})
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold">
                  ⚪ Aguardando Importação da Base IQ09
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              Consulta & Validador Inteligente de Seriais (`UII`) — Base `IQ09` SAP
            </h2>

            {metadata ? (
              <p className="text-xs text-slate-600">
                Última carga em{' '}
                <strong className="text-slate-900">
                  {new Date(metadata.updatedAt).toLocaleString('pt-BR')}
                </strong>{' '}
                por <strong className="text-[#00609C]">{metadata.updatedBy}</strong> • Arquivo:{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]">
                  {metadata.fileName}
                </code>{' '}
                • Substituição limpa (sem acúmulo de bases antigas).
              </p>
            ) : (
              <p className="text-xs text-slate-600">
                Suba o arquivo <strong className="text-slate-800">.xlsx</strong> ou <strong className="text-slate-800">.csv</strong> baixado direto da transação <strong>IQ09 do SAP</strong> (sem precisar tratar colunas). A coluna <strong>UII</strong> é reconhecida nativamente como o Serial!
              </p>
            )}
          </div>

          {/* Botões de Ação do Snapshot */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsImporterOpen((prev) => !prev)}
              className="px-4 py-2.5 rounded-xl bg-[#002664] hover:bg-[#003380] text-white font-extrabold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <UploadCloud className="w-4 h-4 text-cyan-300" />
              <span>{metadata ? 'Atualizar Base IQ09 (.xlsx / Colar)' : 'Importar Base IQ09 (.xlsx / Colar)'}</span>
            </button>

            {!metadata && (
              <button
                type="button"
                onClick={handleLoadOfficialSample}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>Carregar Amostra da IQ09</span>
              </button>
            )}

            {metadata && currentRole !== 'buiatte' && (
              <button
                type="button"
                onClick={async () => {
                  if (
                    window.confirm(
                      'Deseja remover a fotografia atual da IQ09 da memória e da nuvem?'
                    )
                  ) {
                    await clearIQ09Snapshot();
                    setIsImporterOpen(true);
                  }
                }}
                className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
                title="Limpar base IQ09 atual"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Notificação de sucesso pós-importação */}
        {importSuccessMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{importSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-950 px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Cards Resumo da Fotografia IQ09 (Quando houver base ativa) */}
        {metadata && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-4 pt-4 border-t border-slate-200/80">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                Total UIIs (Seriais)
              </div>
              <div className="text-xl font-black text-slate-900 tabular-nums mt-0.5">
                {iq09Stats.total.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-slate-500">
                em {Object.keys(metadata.centrosCount).length} centro(s) SAP
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#00609C]">
                Materiais Únicos
              </div>
              <div className="text-xl font-black text-[#002664] tabular-nums mt-0.5">
                {iq09Stats.uniqueMaterials.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-slate-600">SKUs mapeados na base</div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/90">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                🟢 Já em Estoque Livre
              </div>
              <div className="text-xl font-black text-emerald-700 tabular-nums mt-0.5">
                {iq09Stats.livreCount.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-emerald-800/80">
                B413, B110, B114, B130, B412, B416
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/90">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
                🟡 Triagem (B148) & Falta (B111/B152)
              </div>
              <div className="text-xl font-black text-amber-700 tabular-nums mt-0.5">
                {iq09Stats.triagemOuFaltaCount.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-amber-900/80">
                Elegíveis p/ liberação ao Livre
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200/90 col-span-2 sm:col-span-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                🛑 Avaria Definitiva (B136/B149/B137)
              </div>
              <div className="text-xl font-black text-rose-700 tabular-nums mt-0.5">
                {iq09Stats.avariaCount.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-rose-800/80">
                Saída bloqueada p/ Estoque Livre
              </div>
            </div>
          </div>
        )}

        {/* PAINEL EXPANSÍVEL DE UPLOAD / COLAGEM DA PLANILHA IQ09 */}
        {isImporterOpen && (
          <div className="mt-4 pt-4 border-t-2 border-dashed border-blue-200 bg-blue-50/40 rounded-2xl p-4 space-y-4 animate-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#002664] flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#0083CA]" />
                  <span>Importar Planilha Oficial `IQ09` do SAP (Substituição Limpa de Snapshot)</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Reconhece automaticamente o layout padrão Midea Carrier:{' '}
                  <span className="font-mono font-bold text-slate-800">
                    Material | UII (Serial) | Centro | Depósito | Tipo de estoque | Status sistema | Modificado em | Modificado por | Equipamento
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setImportMode('file')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    importMode === 'file'
                      ? 'bg-[#002664] text-white'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  📁 Subir Arquivo (.xlsx / .csv)
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('paste')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    importMode === 'paste'
                      ? 'bg-[#002664] text-white'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  📋 Colar do Excel (Ctrl+V)
                </button>
                {metadata && (
                  <button
                    type="button"
                    onClick={() => setIsImporterOpen(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white"
                    title="Fechar importador"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {importError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importMode === 'file' ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className="border-2 border-dashed border-[#0083CA]/60 hover:border-[#002664] bg-white rounded-2xl p-6 text-center transition-all"
              >
                {isParsingFile ? (
                  <div className="py-4 flex flex-col items-center justify-center gap-2 text-[#002664]">
                    <RefreshCw className="w-7 h-7 animate-spin text-[#0083CA]" />
                    <span className="text-sm font-extrabold">
                      Lendo e indexando base IQ09 do SAP...
                    </span>
                    <span className="text-xs text-slate-500">
                      Extraindo colunas Material, UII (Serial), Centro, Depósito, Status Sistema e Equipamento.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#00609C] flex items-center justify-center mx-auto shadow-2xs">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-slate-800">
                        Arraste a planilha da <span className="text-[#00609C]">IQ09 (.xlsx ou .csv)</span> aqui ou clique abaixo
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Não precisa apagar colunas nem tratar o arquivo baixado do SAP! O MIGOU filtra tudo sozinho.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      <label className="cursor-pointer px-5 py-2.5 rounded-xl bg-[#002664] hover:bg-[#003380] text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-sm transition-all active:scale-95">
                        <FileSpreadsheet className="w-4 h-4 text-cyan-300" />
                        <span>Selecionar Planilha IQ09 (.xlsx / .csv)</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.csv,.txt,.tsv,.xls"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f);
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handleLoadOfficialSample}
                        className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        <span>Testar com Amostra Real do Print IQ09</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
                <textarea
                  rows={5}
                  value={rawPasteText}
                  onChange={(e) => setRawPasteText(e.target.value)}
                  placeholder="Abra a planilha IQ09 no Excel, selecione as linhas (ou dê Ctrl+T / Ctrl+C) e cole (Ctrl+V) aqui..."
                  className="w-full p-3 text-xs font-mono border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0083CA]"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleLoadOfficialSample}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                  >
                    Carregar Amostra do Print
                  </button>
                  <button
                    type="button"
                    disabled={!rawPasteText.trim() || isParsingFile}
                    onClick={handlePasteImport}
                    className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-[#002664] hover:bg-[#003380] disabled:bg-slate-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ClipboardPaste className="w-4 h-4 text-cyan-300" />
                    <span>Processar e Substituir Base IQ09</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. SELETOR DE MODO OPERACIONAL DA IQ09 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white/90 backdrop-blur-xl p-1.5 rounded-2xl border border-white/70 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 flex-1">
          <button
            type="button"
            onClick={() => setSubTab('validador')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
              subTab === 'validador'
                ? 'bg-[#002664] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${subTab === 'validador' ? 'text-cyan-300' : 'text-[#00609C]'}`} />
            <span>1. Validador & De-Para em Lote (Time Buiatte ➔ MIGO 311)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('explorador')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
              subTab === 'explorador'
                ? 'bg-[#002664] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Search className={`w-4 h-4 ${subTab === 'explorador' ? 'text-cyan-300' : 'text-[#00609C]'}`} />
            <span>2. Consulta Geral de Estoque IQ09 ({iq09Items.length.toLocaleString('pt-BR')} UIIs)</span>
          </button>
        </div>
      </div>

      {/* ========================================================================== */}
      {/* SUB-ABA 1: VALIDADOR & DE-PARA EM LOTE (MASTIGADO PARA O TIME BUIATTE)     */}
      {/* ========================================================================== */}
      {subTab === 'validador' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Painel Esquerdo: Entrada de Seriais (UII) e Destino Desejado */}
          <div className="lg:col-span-4 bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-5 space-y-4 self-start">
            <div className="border-b border-slate-200 pb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#00609C]">
                De-Para Automático IQ09
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                Validar Seriais (`UII`) Antes de Solicitar
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cole os seriais (`UII`) que o WMS precisa transferir. O MIGOU cruza com a `IQ09`, descobre o Material, Centro e Depósito de Origem sozinho e separa o que realmente precisa de MIGO 311!
              </p>
            </div>

            {/* Solicitante */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#00609C]" />
                <span>Time / Solicitante</span>
              </label>
              <input
                type="text"
                value={solicitante}
                onChange={(e) => setSolicitante(e.target.value)}
                placeholder="Ex: Time Buiatte (Prod)"
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0083CA]"
              />
            </div>

            {/* Objetivo / Depósito Destino */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Para qual Depósito de Destino deseja transferir?
              </label>
              <select
                value={targetDepositOption}
                onChange={(e) => setTargetDepositOption(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold bg-blue-50/70 border border-blue-300 rounded-xl text-[#002664] focus:ring-2 focus:ring-[#0083CA]"
              >
                <option value="AUTO_LIVRE">
                  🟢 Estoque Livre do Centro (Automático: B413 / B114 / B110 / B130 / B412)
                </option>
                <option value="AUTO_FALTA">
                  🔴 Baixa p/ Falta de Inventário (Automático: B111 Produto / B152 Peças)
                </option>
                <optgroup label="Escolher Depósito de Destino Específico">
                  <option value="B413">B413 — Estoque Livre Pós-Venda Produto (B179/B180)</option>
                  <option value="B412">B412 — Estoque Livre Pós-Venda Peças (B179/B180)</option>
                  <option value="B114">B114 — Estoque Livre Lojas Produto (B158/B159)</option>
                  <option value="B130">B130 — Estoque Livre Lojas Peças (B158/B159)</option>
                  <option value="B416">B416 — Blue Service Garantia Peças (B158/B159)</option>
                  <option value="B110">B110 — Estoque Livre E-Commerce Produto (B123/B124)</option>
                  <option value="B111">B111 — Falta de Inventário Produto (Todos os Centros)</option>
                  <option value="B152">B152 — Falta de Inventário Peças (B158/B159/B179/B180)</option>
                  <option value="B136">B136 — Avaria Definitiva: Sucata</option>
                  <option value="B149">B149 — Avaria Definitiva: Outlet (Emb. Retrabalhada)</option>
                  <option value="B137">B137 — Avaria Definitiva: Slow Movers</option>
                </optgroup>
              </select>
            </div>

            {/* Textarea de Seriais (UII) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-800">
                  Cole os UIIs (Seriais) para cruzar com a IQ09:
                </label>
                {batchSerialsInput && (
                  <button
                    type="button"
                    onClick={() => setBatchSerialsInput('')}
                    className="text-[11px] text-rose-600 hover:underline font-semibold"
                  >
                    Limpar lista
                  </button>
                )}
              </div>
              <textarea
                rows={7}
                value={batchSerialsInput}
                onChange={(e) => setBatchSerialsInput(e.target.value)}
                placeholder={`Cole 1 ou vários UIIs (Seriais) por linha:\nS4221B10960628\nS4621B11175122\n541760002ZGB4133400502`}
                className="w-full p-3 text-xs font-mono border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0083CA] leading-relaxed"
              />
            </div>

            {iq09Items.length > 0 && !batchSerialsInput.trim() && (
              <button
                type="button"
                onClick={() => {
                  const sampleUIIs = iq09Items.slice(0, 8).map((i) => i.serial);
                  setBatchSerialsInput(sampleUIIs.join('\n'));
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#00609C]" />
                <span>Preencher com UIIs da Base Atual para Testar</span>
              </button>
            )}
          </div>

          {/* Painel Direito: Resultado "Mastigado" do Cruzamento com a IQ09 */}
          <div className="lg:col-span-8 bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                    Diagnóstico Automático SAP Key User
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Resultado do Cruzamento `WMS Buiatte ⟷ SAP IQ09`
                  </h3>
                </div>

                {/* Botão Mágico de 1 Clique para criar solicitações apenas dos Aptos */}
                {validationCounts.aptos > 0 && (
                  <button
                    type="button"
                    disabled={isSubmittingAptos}
                    onClick={handleCreateRequestsForAptos}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer active:scale-95"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>
                      {isSubmittingAptos
                        ? 'Gerando Solicitações...'
                        : `Solicitar Apenas os Aptos (${validationCounts.aptos}) com 1 Clique`}
                    </span>
                  </button>
                )}
              </div>

              {/* 4 Semáforos de Filtro do Cruzamento */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setValidationFilter(validationFilter === 'apto_transferir' ? 'todos' : 'apto_transferir')
                  }
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    validationFilter === 'apto_transferir'
                      ? 'bg-emerald-100 border-emerald-500 ring-2 ring-emerald-400/50'
                      : 'bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100/60'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-emerald-900">
                    🟢 1. Aptos p/ MIGO 311
                  </div>
                  <div className="text-2xl font-black text-emerald-700 tabular-nums mt-0.5">
                    {validationCounts.aptos}
                  </div>
                  <div className="text-[10px] text-emerald-800 font-medium">
                    Prontos para solicitar
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setValidationFilter(validationFilter === 'ja_no_destino' ? 'todos' : 'ja_no_destino')
                  }
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    validationFilter === 'ja_no_destino'
                      ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-400/50'
                      : 'bg-blue-50/70 border-blue-200 hover:bg-blue-100/60'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-blue-900">
                    🔵 2. Já no Destino (SAP)
                  </div>
                  <div className="text-2xl font-black text-blue-700 tabular-nums mt-0.5">
                    {validationCounts.jaNoDestino}
                  </div>
                  <div className="text-[10px] text-blue-800 font-medium">
                    Não precisa solicitar!
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setValidationFilter(validationFilter === 'ja_na_fila_migou' ? 'todos' : 'ja_na_fila_migou')
                  }
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    validationFilter === 'ja_na_fila_migou'
                      ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-400/50'
                      : 'bg-amber-50/70 border-amber-200 hover:bg-amber-100/60'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-amber-900">
                    🟡 3. Já na Fila MIGOU
                  </div>
                  <div className="text-2xl font-black text-amber-700 tabular-nums mt-0.5">
                    {validationCounts.jaNaFila}
                  </div>
                  <div className="text-[10px] text-amber-800 font-medium">
                    Evita pedido duplicado
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setValidationFilter(
                      validationFilter === 'nao_encontrado_iq09' ? 'todos' : 'nao_encontrado_iq09'
                    )
                  }
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    validationFilter === 'nao_encontrado_iq09'
                      ? 'bg-rose-100 border-rose-500 ring-2 ring-rose-400/50'
                      : 'bg-rose-50/70 border-rose-200 hover:bg-rose-100/60'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-rose-900">
                    🔴 4. Impedidos / S/ Saldo
                  </div>
                  <div className="text-2xl font-black text-rose-700 tabular-nums mt-0.5">
                    {validationCounts.impedidos}
                  </div>
                  <div className="text-[10px] text-rose-800 font-medium">
                    Avaria B136/149/137 ou S/ IQ09
                  </div>
                </button>
              </div>

              {/* Tabela de Resultados do Cruzamento */}
              {batchValidationResults.length === 0 ? (
                <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/60 space-y-2">
                  <Database className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-sm font-extrabold text-slate-700">
                    Cole os seriais (`UII`) no quadro ao lado para validar na `IQ09`
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    O MIGOU vai puxar automaticamente o <strong>Material</strong>, o <strong>Centro</strong>, o <strong>Depósito Atual</strong> e o <strong>Status Sistema (`DEPS`)</strong> de cada `UII` e liberar o botão de solicitação em 1 clique apenas para os seriais que realmente precisam de movimentação.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">UII (Serial)</th>
                          <th className="py-2.5 px-2.5">Material (IQ09)</th>
                          <th className="py-2.5 px-2">Centro</th>
                          <th className="py-2.5 px-3">Dep. IQ09 ➔ Destino</th>
                          <th className="py-2.5 px-2.5">Status SAP</th>
                          <th className="py-2.5 px-3">Diagnóstico Mastigado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80">
                        {filteredValidationResults.map((item, idx) => {
                          const isApto =
                            item.status === 'apto_transferir' || item.status === 'divergencia_rota_centro';
                          const isJaNoDestino = item.status === 'ja_no_destino';
                          const isJaNaFila = item.status === 'ja_na_fila_migou';

                          return (
                            <tr
                              key={`${item.inputSerial}-${idx}`}
                              className={
                                isApto
                                  ? 'bg-emerald-50/40 hover:bg-emerald-50/80'
                                  : isJaNoDestino
                                  ? 'bg-blue-50/40 hover:bg-blue-50/80'
                                  : isJaNaFila
                                  ? 'bg-amber-50/50 hover:bg-amber-50/90'
                                  : 'bg-rose-50/60 hover:bg-rose-100/60'
                              }
                            >
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                <div>{item.inputSerial}</div>
                                {item.iq09Item?.equipamento && (
                                  <div className="text-[10px] text-slate-400 font-normal">
                                    Eq: {item.iq09Item.equipamento}
                                  </div>
                                )}
                              </td>

                              <td className="py-2.5 px-2.5 font-mono font-extrabold text-[#002664]">
                                {item.suggestedMaterial || '—'}
                              </td>

                              <td className="py-2.5 px-2 font-mono font-bold text-slate-700">
                                {item.suggestedCentro || '—'}
                              </td>

                              <td className="py-2.5 px-3 font-mono">
                                {item.iq09Item ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-bold text-slate-800">
                                      {item.suggestedOrigem}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400" />
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-bold border ${
                                        isJaNoDestino
                                          ? 'bg-blue-100 text-blue-900 border-blue-300'
                                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                      }`}
                                    >
                                      {item.suggestedDestino}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td className="py-2.5 px-2.5">
                                {item.iq09Item ? (
                                  <div className="space-y-0.5">
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold ${
                                        item.iq09Item.statusSistema === 'DEPS'
                                          ? 'bg-emerald-100 text-emerald-900'
                                          : 'bg-rose-100 text-rose-900'
                                      }`}
                                    >
                                      {item.iq09Item.statusSistema} • Tp.{item.iq09Item.tipoEstoque}
                                    </span>
                                    {item.iq09Item.modificadoEm && (
                                      <div className="text-[10px] text-slate-500">
                                        {item.iq09Item.modificadoEm}{' '}
                                        {item.iq09Item.modificadoPor ? `(${item.iq09Item.modificadoPor})` : ''}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-rose-600 font-bold text-[10px]">S/ Registro</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                <div
                                  className={`font-extrabold text-[11px] ${
                                    isApto
                                      ? 'text-emerald-800'
                                      : isJaNoDestino
                                      ? 'text-blue-800'
                                      : isJaNaFila
                                      ? 'text-amber-900'
                                      : 'text-rose-800'
                                  }`}
                                >
                                  {isApto && '🟢 '}
                                  {isJaNoDestino && '🔵 '}
                                  {isJaNaFila && '🟡 '}
                                  {!isApto && !isJaNoDestino && !isJaNaFila && '🔴 '}
                                  {item.statusTitle}
                                </div>
                                <div className="text-[11px] text-slate-600 leading-snug mt-0.5">
                                  {item.statusDetail}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé Explicativo Key User */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 text-[11px] text-slate-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#00609C] shrink-0" />
                <span>
                  <strong>Inteligência anti-retrabalho:</strong> Seriais que já constam no depósito de destino na `IQ09` (azul) ou que já estão na fila do MIGOU (amarelo) são automaticamente filtrados para evitar pedidos duplicados ao Time Midea.
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================== */
        /* SUB-ABA 2: EXPLORADOR & CONSULTA GERAL DA BASE IQ09 (PARA TODAS AS ÁREAS)  */
        /* ========================================================================== */
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {/* Barra de Pesquisa e Filtros da IQ09 */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Campo de Busca Instantânea */}
              <div className="relative flex-1 max-w-lg">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Pesquisar na IQ09 por UII (Serial), Material (ex: QQI075BB), Equipamento ou Usuário SAP..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0083CA]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filtros Rápidos */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={centroFilter}
                  onChange={(e) => {
                    setCentroFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-700"
                >
                  <option value="todos">Centro: Todos ({allIQ09Centros.length})</option>
                  {allIQ09Centros.map((c) => (
                    <option key={c} value={c}>
                      Centro {c} ({metadata?.centrosCount[c] || 0})
                    </option>
                  ))}
                </select>

                <select
                  value={depositoFilter}
                  onChange={(e) => {
                    setDepositoFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-700"
                >
                  <option value="todos">Depósito: Todos ({allIQ09Depositos.length})</option>
                  {allIQ09Depositos.map((d) => {
                    const dInfo = SAP_DEPOSITOS_CATALOG[d];
                    return (
                      <option key={d} value={d}>
                        {d} {dInfo ? `— ${dInfo.shortTitle}` : ''} ({metadata?.depositosCount[d] || 0})
                      </option>
                    );
                  })}
                </select>

                <select
                  value={catFilter}
                  onChange={(e) => {
                    setCatFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-700"
                >
                  <option value="todos">Categoria: Todas</option>
                  <option value="livre">🟢 Em Estoque Livre / Blue Service</option>
                  <option value="triagem_falta">🟡 Em Triagem (B148) ou Falta (B111/B152)</option>
                  <option value="avaria">🛑 Em Avaria Definitiva (B136/B149/B137)</option>
                </select>

                <select
                  value={statusSapFilter}
                  onChange={(e) => {
                    setStatusSapFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-700"
                >
                  <option value="todos">Status Sistema: Todos</option>
                  <option value="DEPS">Apenas DEPS (Em Depósito)</option>
                  <option value="OUTROS">Outros Status (EDEL / Bloqueados)</option>
                </select>

                <button
                  type="button"
                  onClick={handleExportFilteredIQ09}
                  disabled={filteredExplorerItems.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Exportar resultado filtrado para Excel (CSV)"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Exportar Filtro</span>
                </button>
              </div>
            </div>

            {/* Barra de Seleção no Explorador IQ09 */}
            {selectedExplorerSerials.size > 0 && (
              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#00609C] text-white font-bold">
                    {selectedExplorerSerials.size} UII(s) selecionado(s) na IQ09
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedExplorerSerials(new Set())}
                    className="text-slate-600 hover:text-rose-600 font-semibold"
                  >
                    ✕ Desmarcar
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRequestFromExplorerSelection}
                    className="px-3.5 py-1.5 rounded-xl bg-[#002664] hover:bg-[#003380] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Solicitar Transferência para Selecionados</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tabela da IQ09 (Paginada para Performance 60fps mesmo com 50.000 linhas) */}
          {filteredExplorerItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Filter className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                {iq09Items.length === 0
                  ? 'Nenhuma base IQ09 importada no momento'
                  : 'Nenhum serial (UII) encontrado para os filtros aplicados'}
              </div>
              {iq09Items.length === 0 && (
                <button
                  type="button"
                  onClick={handleLoadOfficialSample}
                  className="mt-2 px-4 py-2 rounded-xl bg-[#002664] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Carregar Amostra Real da IQ09</span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-9 text-center">
                        <input
                          type="checkbox"
                          checked={
                            paginatedExplorerItems.length > 0 &&
                            paginatedExplorerItems.every((i) => selectedExplorerSerials.has(i.serial))
                          }
                          onChange={(e) => {
                            const next = new Set(selectedExplorerSerials);
                            if (e.target.checked) {
                              paginatedExplorerItems.forEach((i) => next.add(i.serial));
                            } else {
                              paginatedExplorerItems.forEach((i) => next.delete(i.serial));
                            }
                            setSelectedExplorerSerials(next);
                          }}
                          className="rounded text-[#0083CA] cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-3">Material</th>
                      <th className="py-2.5 px-3">UII (Serial)</th>
                      <th className="py-2.5 px-2.5">Centro</th>
                      <th className="py-2.5 px-3">Depósito Atual (SAP)</th>
                      <th className="py-2.5 px-2.5 text-center">Tp. Estoque</th>
                      <th className="py-2.5 px-2.5 text-center">Status Sistema</th>
                      <th className="py-2.5 px-3">Modificado em / por</th>
                      <th className="py-2.5 px-3">Equipamento</th>
                      <th className="py-2.5 px-3">Status Fila MIGOU</th>
                      <th className="py-2.5 px-3 text-right">Ação Rápida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 font-mono text-[11px]">
                    {paginatedExplorerItems.map((item) => {
                      const depInfo = SAP_DEPOSITOS_CATALOG[item.deposito];
                      const isAvaria = Boolean(DEFINITIVE_DAMAGE_DEPOSITS[item.deposito]);
                      const isLivre =
                        depInfo?.category === 'estoque_livre' || depInfo?.category === 'blue_service';
                      const queueReq = activeQueueMap.get(item.serial);
                      const isSelected = selectedExplorerSerials.has(item.serial);

                      return (
                        <tr
                          key={item.serial}
                          className={
                            isSelected
                              ? 'bg-blue-50/90'
                              : isAvaria
                              ? 'bg-rose-50/40 hover:bg-rose-50/80'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const next = new Set(selectedExplorerSerials);
                                if (next.has(item.serial)) next.delete(item.serial);
                                else next.add(item.serial);
                                setSelectedExplorerSerials(next);
                              }}
                              className="rounded text-[#0083CA] cursor-pointer"
                            />
                          </td>

                          <td className="py-2 px-3 font-extrabold text-[#002664] bg-amber-50/40">
                            {item.material}
                          </td>

                          <td className="py-2 px-3 font-bold text-slate-900">
                            {item.serial}
                          </td>

                          <td className="py-2 px-2.5 font-bold text-slate-700">
                            {item.centro}
                          </td>

                          <td className="py-2 px-3 font-sans">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-mono font-extrabold px-2 py-0.5 rounded text-[11px] border ${
                                  isAvaria
                                    ? 'bg-red-600 text-white border-red-700'
                                    : isLivre
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : 'bg-amber-100 text-amber-900 border-amber-300'
                                }`}
                              >
                                {item.deposito}
                              </span>
                              {depInfo && (
                                <span className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]">
                                  {depInfo.shortTitle}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2 px-2.5 text-center font-bold text-slate-700">
                            {item.tipoEstoque}
                          </td>

                          <td className="py-2 px-2.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${
                                item.statusSistema === 'DEPS'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {item.statusSistema}
                            </span>
                          </td>

                          <td className="py-2 px-3 font-sans text-[11px] text-slate-600">
                            {item.modificadoEm ? (
                              <span>
                                {item.modificadoEm}{' '}
                                {item.modificadoPor && (
                                  <strong className="font-mono text-slate-800">
                                    • {item.modificadoPor}
                                  </strong>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-slate-600">
                            {item.equipamento || '—'}
                          </td>

                          <td className="py-2 px-3 font-sans">
                            {queueReq ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                <Clock className="w-3 h-3" />
                                <span>
                                  {queueReq.solicitationCode} ({queueReq.depositoOrigem}➔{queueReq.depositoDestino})
                                </span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Sem solicitação</span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-right font-sans">
                            {isAvaria ? (
                              <span className="text-[10px] font-bold text-red-700">
                                🚫 Avaria Definitiva
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const cInfo = SAP_CENTROS_CATALOG[item.centro];
                                  const recFree = cInfo?.freeStockProductDeposit || 'B110';
                                  onOpenNewRequestWithPreset({
                                    material: item.material,
                                    seriais: [item.serial],
                                    centro: item.centro,
                                    depositoOrigem: item.deposito,
                                    depositoDestino: item.deposito === recFree ? 'B111' : recFree,
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-[#002664] text-[#002664] hover:text-white border border-blue-200 font-bold text-[10px] transition-colors cursor-pointer"
                              >
                                Solicitar MIGO
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação da Consulta Geral IQ09 */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
                <div>
                  Exibindo{' '}
                  <strong>
                    {(safePage - 1) * PAGE_SIZE + 1}–
                    {Math.min(safePage * PAGE_SIZE, filteredExplorerItems.length)}
                  </strong>{' '}
                  de <strong>{filteredExplorerItems.length.toLocaleString('pt-BR')}</strong> seriais (`UII`)
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 font-bold text-slate-800">
                    Página {safePage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
