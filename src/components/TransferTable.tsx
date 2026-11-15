import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  Filter, 
  Copy, 
  Check, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertOctagon, 
  RefreshCw, 
  Terminal, 
  FileCheck, 
  Layers, 
  Sparkles, 
  MessageSquare,
  Camera,
  Image as ImageIcon,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Database,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { TransferItem, TransferStatus, TeamRole, FilterOptions } from '../types/transfer';
import { formatForSAPTable, formatSerialsForSAP, checkDefinitiveDamageOrigin, analyzeTransferRoute, SAP_DEPOSITOS_CATALOG } from '../utils/sapFormatter';
import { LabelPhotoModal } from './LabelPhotoModal';
import { WMSBreakerWarningModal, BlockedTransferAttempt } from './WMSBreakerWarningModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { compressImageFile } from '../utils/imageCompressor';
import { IQ09MacroReadinessStatus, IQ09QueueItemAudit } from '../types/iq09';
import { auditTransferItemAgainstIQ09 } from '../services/iq09Service';

export type SortField = 'fifo' | 'material' | 'serial' | 'centro' | 'rota' | 'status' | 'docSap';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface TransferTableProps {
  items: TransferItem[];
  currentRole: TeamRole;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onOpenSAPModal: (items: TransferItem[]) => void;
  onOpenResolutionModal: (items: TransferItem[], mode: 'concluir' | 'divergencia') => void;
  onUpdateStatusSingle: (id: string, newStatus: TransferStatus) => void;
  onBatchUpdateStatus?: (ids: string[], newStatus: TransferStatus) => void;
  selectionResetKey?: number;
  onAttachLabelPhoto?: (itemId: string, photoUrl: string) => void;
  onOpenNewModal?: () => void;
  onOpenBatchPaste?: () => void;
  onDeleteSelected?: (ids: string[]) => void | Promise<void>;
  iq09SnapshotVersion?: string | null;
  iq09TotalItems?: number;
  wmsSnapshotVersion?: string | null;
  onApplyIQ09DePara?: (
    updates: Array<{
      id: string;
      material: string;
      centro: string;
      depositoOrigem: string;
      observacoes?: string;
    }>
  ) => void | Promise<void>;
  onOpenIQ09Tab?: () => void;
}

export type ColumnKey =
  | 'select'
  | 'fifo'
  | 'material'
  | 'serial'
  | 'centro'
  | 'rota'
  | 'status'
  | 'foto'
  | 'docSap'
  | 'solicitante'
  | 'acoes';

const COLUMN_ORDER: ColumnKey[] = [
  'select',
  'fifo',
  'material',
  'serial',
  'centro',
  'rota',
  'status',
  'foto',
  'docSap',
  'solicitante',
  'acoes',
];

// Pesos percentuais que somam exatamente 100% para caber 100% dentro da grid sem cortar nada
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  select: 2.8,
  fifo: 3.8,
  material: 10.5,
  serial: 15.0,
  centro: 5.0,
  rota: 11.2,
  status: 9.2,
  foto: 6.0,
  docSap: 13.0,
  solicitante: 12.0,
  acoes: 11.5,
};

const MIN_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  select: 2.2,
  fifo: 3.0,
  material: 6.0,
  serial: 8.0,
  centro: 4.0,
  rota: 7.0,
  status: 6.5,
  foto: 4.5,
  docSap: 7.0,
  solicitante: 6.5,
  acoes: 7.5,
};

const STORAGE_WIDTHS_KEY = 'migou_column_weights_v4';

export const TransferTable: React.FC<TransferTableProps> = ({
  items,
  currentRole,
  filters,
  onFilterChange,
  onOpenSAPModal,
  onOpenResolutionModal,
  onUpdateStatusSingle,
  onBatchUpdateStatus,
  selectionResetKey,
  onAttachLabelPhoto,
  onOpenNewModal,
  onOpenBatchPaste,
  onDeleteSelected,
  iq09SnapshotVersion = null,
  iq09TotalItems = 0,
  wmsSnapshotVersion = null,
  onApplyIQ09DePara,
  onOpenIQ09Tab,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedBatchNotice, setCopiedBatchNotice] = useState(false);
  const [viewingPhotoItem, setViewingPhotoItem] = useState<TransferItem | null>(null);
  const [cameraCaptureTargetItem, setCameraCaptureTargetItem] = useState<TransferItem | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [selectedBlockedWmsAttempt, setSelectedBlockedWmsAttempt] = useState<BlockedTransferAttempt | null>(null);

  // Filtro rápido do batimento IQ09 direto na Fila de Solicitações & Operação SAP
  const [iq09MacroFilter, setIq09MacroFilter] = useState<'todos' | IQ09MacroReadinessStatus>('todos');
  const [isApplyingDePara, setIsApplyingDePara] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Estado de Ordenação e Agrupamento Interativo (por Material, Centro, Depósitos, FIFO, etc.)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'fifo', direction: 'asc' });

  // Estados de Exclusão de Linhas Selecionadas
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [itemToDeleteSingle, setItemToDeleteSingle] = useState<TransferItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Colunas proporcionais redimensionáveis que mantêm 100% da largura da grid sem estourar
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_WIDTHS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const total = COLUMN_ORDER.reduce((acc, k) => acc + (Number(parsed[k]) || 0), 0);
        if (total >= 98 && total <= 102) {
          return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
        }
      }
    } catch (e) {}
    return DEFAULT_COLUMN_WIDTHS;
  });

  const tableRef = useRef<HTMLTableElement | null>(null);
  const justResizedRef = useRef(false);
  const resizingRef = useRef<{
    colKey: ColumnKey;
    neighborKey: ColumnKey;
    startX: number;
    tableWidth: number;
    startColWidth: number;
    startNeighborWidth: number;
  } | null>(null);

  // Listas para filtros dinâmicos
  const allCentros = useMemo(() => Array.from(new Set(items.map((i) => i.centro))).sort(), [items]);
  const allDepsOrigem = useMemo(() => Array.from(new Set(items.map((i) => i.depositoOrigem))).sort(), [items]);
  const allDepsDestino = useMemo(() => Array.from(new Set(items.map((i) => i.depositoDestino))).sort(), [items]);

  // Função para alternar ordenação ao clicar no cabeçalho (bloqueada durante redimensionamento)
  const handleSort = (field: SortField) => {
    if (justResizedRef.current) return;
    setSortConfig((prev) => {
      if (prev.field === field) {
        if (prev.direction === 'asc') {
          return { field, direction: 'desc' };
        } else {
          // Volta à ordem cronológica FIFO padrão
          return { field: 'fifo', direction: 'asc' };
        }
      }
      return { field, direction: 'asc' };
    });
  };

  // Mapa O(1) de auditoria automática de cada item da fila contra a Base IQ09 ativa e Batimento Sênior WMS
  const iq09AuditMap = useMemo(() => {
    const map = new Map<string, IQ09QueueItemAudit>();
    for (const item of items) {
      map.set(item.id, auditTransferItemAgainstIQ09(item));
    }
    return map;
  }, [items, iq09SnapshotVersion, iq09TotalItems, wmsSnapshotVersion]);

  // Resumo executivo do batimento IQ09 para os itens ativos na fila (Pendentes / Em Análise, ou todos se filtrando concluídos)
  const iq09QueueSummary = useMemo(() => {
    let prontosMacro = 0;
    let corrigiveisDePara = 0;
    let jaNoDestino = 0;
    let errosCriticos = 0;
    let hasBase = false;
    const corrigiveisItems: Array<{ item: TransferItem; audit: IQ09QueueItemAudit }> = [];
    const prontosItems: TransferItem[] = [];

    const scopeItems = items.filter((i) =>
      filters.status === 'concluido' ? i.status === 'concluido' : i.status !== 'concluido'
    );

    for (const item of scopeItems) {
      const audit = iq09AuditMap.get(item.id);
      if (!audit || !audit.hasIQ09Base) continue;
      hasBase = true;

      if (audit.macroStatus === 'pronto_macro_100') {
        prontosMacro++;
        prontosItems.push(item);
      } else if (audit.macroStatus === 'corrigivel_depara') {
        corrigiveisDePara++;
        corrigiveisItems.push({ item, audit });
      } else if (audit.macroStatus === 'ja_no_destino_sap') {
        jaNoDestino++;
      } else if (audit.macroStatus === 'erro_critico_macro') {
        errosCriticos++;
      }
    }

    return {
      hasBase: hasBase || iq09TotalItems > 0,
      totalAudited: scopeItems.length,
      prontosMacro,
      corrigiveisDePara,
      jaNoDestino,
      errosCriticos,
      corrigiveisItems,
      prontosItems,
    };
  }, [items, filters.status, iq09AuditMap, iq09TotalItems]);

  // Aplicar De-Para Automático IQ09 em 1 linha específica
  const handleFixSingleItemWithIQ09 = async (item: TransferItem, audit: IQ09QueueItemAudit) => {
    if (!onApplyIQ09DePara || !audit.iq09Item) return;
    const iq = audit.iq09Item;
    const diffNotes = audit.mismatchDetails.join(', ');
    const prefix = item.observacoes ? `${item.observacoes} | ` : '';
    await onApplyIQ09DePara([
      {
        id: item.id,
        material: iq.material,
        centro: iq.centro,
        depositoOrigem: iq.deposito,
        observacoes: `${prefix}[De-Para IQ09: ${diffNotes}]`,
      },
    ]);
  };

  // Aplicar De-Para Automático IQ09 em lote para todas as solicitações divergentes na fila
  const handleFixAllDeParaWithIQ09 = async () => {
    if (!onApplyIQ09DePara || iq09QueueSummary.corrigiveisItems.length === 0) return;
    setIsApplyingDePara(true);
    try {
      const payload = iq09QueueSummary.corrigiveisItems
        .filter((entry) => Boolean(entry.audit.iq09Item))
        .map(({ item, audit }) => {
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
      await onApplyIQ09DePara(payload);
      if (iq09MacroFilter === 'corrigivel_depara') {
        setIq09MacroFilter('todos');
      }
    } finally {
      setIsApplyingDePara(false);
    }
  };

  // Abre o modal executivo "VER MOTIVO" para qualquer divergência Sênior WMS ou IQ09
  const handleOpenMotivoModal = (item: TransferItem, iqAudit?: IQ09QueueItemAudit) => {
    if (iqAudit?.wmsVerdict && iqAudit.wmsVerdict.code !== 'NO_WMS_BASE_LOADED') {
      setSelectedBlockedWmsAttempt({
        serial: item.serial,
        material: item.material,
        centro: item.centro,
        depositoOrigem: item.depositoOrigem,
        depositoDestino: item.depositoDestino,
        verdict: iqAudit.wmsVerdict,
      });
      return;
    }

    const damageCheck = checkDefinitiveDamageOrigin(item.depositoOrigem, item.depositoDestino);
    const iq = iqAudit?.iq09Item;

    setSelectedBlockedWmsAttempt({
      serial: item.serial,
      material: item.material,
      centro: item.centro,
      depositoOrigem: item.depositoOrigem,
      depositoDestino: item.depositoDestino,
      verdict: {
        serial: item.serial,
        hasWmsBase: Boolean(iqAudit?.wmsVerdict?.hasWmsBase),
        foundInWmsBase: Boolean(iqAudit?.wmsVerdict?.foundInWmsBase),
        allowed: false,
        isAllowed: false,
        severity: iqAudit?.macroStatus === 'corrigivel_depara' ? 'warning_physical_check' : 'blocked_breaker',
        code: 'BLOCKED_WMS_DEPOSIT_MISMATCH',
        badgeLabel:
          iqAudit?.badgeLabel ||
          (damageCheck.isInvalidOrigin ? `🛑 Origem Avaria (${item.depositoOrigem})` : '🛑 Solicitação Indevida'),
        title: damageCheck.isInvalidOrigin
          ? `Proibido Voltar de Avaria Definitiva (${item.depositoOrigem}) para Estoque Livre`
          : iqAudit?.macroStatus === 'corrigivel_depara'
          ? 'Divergência Contábil SAP IQ09 (Corrigível via De-Para)'
          : 'Diagnóstico de Bloqueio SAP IQ09 / Sênior WMS',
        whyItIsInvalid:
          iqAudit?.summaryMessage ||
          (damageCheck.isInvalidOrigin
            ? `O depósito de origem ${item.depositoOrigem} é de Avaria Definitiva e não pode retornar ao estoque livre.`
            : 'Divergência identificada na validação sistêmica.'),
        whyExplanation:
          iqAudit?.summaryMessage ||
          (damageCheck.isInvalidOrigin
            ? `O depósito de origem ${item.depositoOrigem} é de Avaria Definitiva e não pode retornar ao estoque livre.`
            : 'Divergência identificada na validação sistêmica.'),
        buiatteActionPlan:
          iqAudit?.macroStatus === 'corrigivel_depara'
            ? [
                `Utilize o botão "⚡ Corrigir c/ IQ09" na linha para sincronizar Material (${iq?.material || item.material}), Centro (${iq?.centro || item.centro}) e Depósito Origem (${iq?.deposito || item.depositoOrigem}).`,
                'Confirme no Sênior WMS se o lote e endereço físico já estão regularizados no depósito de destino.',
              ]
            : [
                'Verifique a posição contábil atual do serial na transação IQ09 (SAP) e o endereço físico no Sênior WMS.',
                'Regularize primeiro a movimentação física/lote no Sênior WMS ou alinhe com o Supervisor antes de solicitar a MIGO 311.',
              ],
        actionOwner: 'WMS',
        iq09Item: iq,
        wmsItem: iqAudit?.wmsVerdict?.wmsItem,
      },
    });
  };

  // Itens filtrados, agrupados e ordenados
  const filteredItems = useMemo(() => {
    const list = items.filter((item) => {
      // Filtro rápido do Batimento IQ09 / Macro MIGO
      if (iq09MacroFilter !== 'todos') {
        const audit = iq09AuditMap.get(item.id);
        if (!audit || audit.macroStatus !== iq09MacroFilter) return false;
      }

      // Busca geral
      if (filters.busca.trim()) {
        const query = filters.busca.toLowerCase();
        const match =
          item.material.toLowerCase().includes(query) ||
          item.serial.toLowerCase().includes(query) ||
          item.solicitationCode.toLowerCase().includes(query) ||
          item.centro.toLowerCase().includes(query) ||
          item.depositoOrigem.toLowerCase().includes(query) ||
          item.depositoDestino.toLowerCase().includes(query) ||
          (item.sapDocNumber && item.sapDocNumber.toLowerCase().includes(query)) ||
          (item.observacoes && item.observacoes.toLowerCase().includes(query));
        if (!match) return false;
      }

      // Status
      if (filters.status !== 'todos' && item.status !== filters.status) {
        return false;
      }

      // Centro
      if (filters.centro !== 'todos' && item.centro !== filters.centro) {
        return false;
      }

      // Depósito Origem
      if (filters.depositoOrigem !== 'todos' && item.depositoOrigem !== filters.depositoOrigem) {
        return false;
      }

      // Depósito Destino
      if (filters.depositoDestino !== 'todos' && item.depositoDestino !== filters.depositoDestino) {
        return false;
      }

      // Apenas divergências
      if (filters.apenasDivergencias && item.status !== 'divergencia') {
        return false;
      }

      return true;
    });

    // Ordenação e Agrupamento
    return [...list].sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;

      switch (sortConfig.field) {
        case 'material': {
          const cmp = a.material.localeCompare(b.material, 'pt-BR', { numeric: true, sensitivity: 'base' });
          if (cmp !== 0) return cmp * dir;
          return a.prioridadeFifo - b.prioridadeFifo;
        }
        case 'centro': {
          const cmp = a.centro.localeCompare(b.centro, 'pt-BR', { numeric: true });
          if (cmp !== 0) return cmp * dir;
          return a.prioridadeFifo - b.prioridadeFifo;
        }
        case 'rota': {
          const routeA = `${a.depositoOrigem}➔${a.depositoDestino}`;
          const routeB = `${b.depositoOrigem}➔${b.depositoDestino}`;
          const cmp = routeA.localeCompare(routeB, 'pt-BR', { numeric: true });
          if (cmp !== 0) return cmp * dir;
          return a.prioridadeFifo - b.prioridadeFifo;
        }
        case 'serial': {
          const cmp = a.serial.localeCompare(b.serial, 'pt-BR', { numeric: true });
          if (cmp !== 0) return cmp * dir;
          return a.prioridadeFifo - b.prioridadeFifo;
        }
        case 'status': {
          const cmp = a.status.localeCompare(b.status, 'pt-BR');
          if (cmp !== 0) return cmp * dir;
          return a.prioridadeFifo - b.prioridadeFifo;
        }
        case 'docSap': {
          const docA = a.sapDocNumber || '';
          const docB = b.sapDocNumber || '';
          const cmp = docA.localeCompare(docB, 'pt-BR', { numeric: true });
          if (cmp !== 0) return cmp * dir;
          return a.prioridadeFifo - b.prioridadeFifo;
        }
        case 'fifo':
        default: {
          return (a.prioridadeFifo - b.prioridadeFifo) * dir;
        }
      }
    });
  }, [items, filters, sortConfig, iq09MacroFilter, iq09AuditMap]);

  // Contagem de solicitações flegadas com Origem em Depósito de Avaria Definitiva (B136, B149, B137)
  const flaggedDamageCount = useMemo(() => {
    return filteredItems.filter(
      (i) => checkDefinitiveDamageOrigin(i.depositoOrigem, i.depositoDestino).isInvalidOrigin
    ).length;
  }, [filteredItems]);

  // Checkbox master (sincronizado estritamente com os itens visíveis no filtro atual)
  const isAllSelected =
    filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id));
  const isSomeSelected =
    filteredItems.some((i) => selectedIds.has(i.id)) && !isAllSelected;

  // Desmarca automaticamente os itens cujo status acabou de ser alterado (individual ou em lote)
  const prevStatusMapRef = useRef<Map<string, TransferStatus>>(new Map());
  useEffect(() => {
    const prevMap = prevStatusMapRef.current;
    const changedStatusIds = new Set<string>();

    items.forEach((item) => {
      const prevStatus = prevMap.get(item.id);
      if (prevStatus && prevStatus !== item.status) {
        changedStatusIds.add(item.id);
      }
    });

    const nextMap = new Map<string, TransferStatus>();
    items.forEach((item) => nextMap.set(item.id, item.status));
    prevStatusMapRef.current = nextMap;

    if (changedStatusIds.size > 0) {
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        let modified = false;
        const next = new Set<string>();
        prev.forEach((id) => {
          if (changedStatusIds.has(id)) {
            modified = true;
          } else {
            next.add(id);
          }
        });
        return modified ? next : prev;
      });
    }
  }, [items]);

  // Limpa imediatamente a seleção quando uma alteração em lote ou resolução SAP é concluída
  useEffect(() => {
    if (selectionResetKey !== undefined && selectionResetKey > 0) {
      setSelectedIds(new Set());
    }
  }, [selectionResetKey]);

  // Mantém a seleção sincronizada apenas com os itens visíveis no filtro atual
  useEffect(() => {
    const visibleIds = new Set(filteredItems.map((i) => i.id));
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let modified = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleIds.has(id)) {
          next.add(id);
        } else {
          modified = true;
        }
      });
      return modified ? next : prev;
    });
  }, [filteredItems]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectedItemsList = useMemo(() => {
    return filteredItems.filter((i) => selectedIds.has(i.id));
  }, [filteredItems, selectedIds]);

  const handleCopySingleRow = (item: TransferItem) => {
    const text = `${item.material}\t${item.serial}\t${item.centro}\t${item.depositoOrigem}\t${item.depositoDestino}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopySelectedTable = () => {
    if (selectedItemsList.length === 0) return;
    const text = formatForSAPTable(selectedItemsList);
    navigator.clipboard.writeText(text);
    setCopiedBatchNotice(true);
    setTimeout(() => setCopiedBatchNotice(false), 2500);
  };

  const handleCopySelectedSerials = () => {
    if (selectedItemsList.length === 0) return;
    const text = formatSerialsForSAP(selectedItemsList);
    navigator.clipboard.writeText(text);
    setCopiedBatchNotice(true);
    setTimeout(() => setCopiedBatchNotice(false), 2500);
  };

  // Drag para redimensionamento balanceado entre colunas vizinhas (mantém 100% da grid sem bugs ou saltos)
  const handleStartResize = (e: React.MouseEvent, colKey: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();

    const colIdx = COLUMN_ORDER.indexOf(colKey);
    const neighborKey = colIdx >= 0 && colIdx < COLUMN_ORDER.length - 1
      ? COLUMN_ORDER[colIdx + 1]
      : COLUMN_ORDER[colIdx - 1];

    if (!neighborKey) return;

    const tableWidth = tableRef.current?.getBoundingClientRect().width || 1200;
    justResizedRef.current = true;

    resizingRef.current = {
      colKey,
      neighborKey,
      startX: e.clientX,
      tableWidth,
      startColWidth: columnWidths[colKey],
      startNeighborWidth: columnWidths[neighborKey],
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const {
        colKey: cKey,
        neighborKey: nKey,
        startX,
        tableWidth: tWidth,
        startColWidth,
        startNeighborWidth,
      } = resizingRef.current;

      const deltaPixels = moveEvent.clientX - startX;
      const deltaPct = (deltaPixels / tWidth) * 100;

      const minDelta = MIN_COLUMN_WIDTHS[cKey] - startColWidth;
      const maxDelta = startNeighborWidth - MIN_COLUMN_WIDTHS[nKey];
      const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaPct));

      const nextColWidth = Number((startColWidth + clampedDelta).toFixed(2));
      const nextNeighborWidth = Number((startNeighborWidth - clampedDelta).toFixed(2));

      setColumnWidths((prev) => ({
        ...prev,
        [cKey]: nextColWidth,
        [nKey]: nextNeighborWidth,
      }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      resizingRef.current = null;
      setColumnWidths((current) => {
        try {
          localStorage.setItem(STORAGE_WIDTHS_KEY, JSON.stringify(current));
        } catch (e) {}
        return current;
      });
      setTimeout(() => {
        justResizedRef.current = false;
      }, 150);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetAllCols = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem(STORAGE_WIDTHS_KEY);
    } catch (e) {}
  };

  const handleResetSingleCol = (_colKey: ColumnKey) => {
    handleResetAllCols();
  };

  const isCustomColumnWidths = useMemo(() => {
    return COLUMN_ORDER.some((k) => Math.abs(columnWidths[k] - DEFAULT_COLUMN_WIDTHS[k]) > 0.25);
  }, [columnWidths]);

  const handleDirectAttachPhoto = async (itemId: string, file: File | Blob) => {
    if (!file || !onAttachLabelPhoto) return;
    try {
      setUploadingItemId(itemId);
      const compressed = await compressImageFile(file, 760, 0.68);
      onAttachLabelPhoto(itemId, compressed);
    } catch (err) {
      console.error('Erro ao anexar foto:', err);
      alert('Não foi possível comprimir a foto da etiqueta.');
    } finally {
      setUploadingItemId(null);
    }
  };

  return (
    <>
      <div className="bg-white/95 backdrop-blur-2xl rounded-2xl border border-[#BAE6FD]/60 shadow-[0_18px_45px_rgba(4,18,52,0.22)] overflow-hidden transition-all w-full max-w-full">
        {/* =====================================================================
            BARRA DE BUSCA, FILTROS & BATIMENTO IQ09 (DESIGN COMPACTO E PREMIUM)
           ===================================================================== */}
        <div className="border-b border-slate-200/80 bg-white w-full max-w-full overflow-hidden">
          {/* LINHA 1: Busca + Seletores Enxutos em Linha Única */}
          <div className="px-3 sm:px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2">
            {/* Esquerda: Campo de Busca Rápida + Botão Mobile "Filtros" */}
            <div className="flex items-center gap-2 w-full md:w-auto md:flex-1 md:max-w-xs lg:max-w-sm">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-[#00609C]/70 absolute left-3 top-2" />
                <input
                  id="global-search-input"
                  type="text"
                  placeholder="Buscar Material, Serial, Centro, Doc SAP..."
                  value={filters.busca}
                  onChange={(e) => onFilterChange({ ...filters, busca: e.target.value })}
                  className="w-full h-8 pl-8 pr-8 text-xs bg-slate-50/90 hover:bg-slate-100/70 focus:bg-white text-slate-800 border border-slate-200/90 rounded-lg focus:ring-2 focus:ring-[#0083CA]/40 focus:border-[#0083CA] placeholder:text-slate-400 transition-all duration-150"
                />
                <div className="absolute right-2 top-1.5 flex items-center gap-1">
                  {filters.busca ? (
                    <button
                      type="button"
                      onClick={() => onFilterChange({ ...filters, busca: '' })}
                      className="text-xs text-slate-400 hover:text-slate-600 px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  ) : (
                    <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] font-mono bg-white text-slate-400 rounded border border-slate-200">
                      /
                    </kbd>
                  )}
                </div>
              </div>

              {/* Botão Acordeão de Filtros no Mobile (< md) */}
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen((prev) => !prev)}
                className={`md:hidden h-8 px-2.5 rounded-lg border text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all active:scale-95 ${
                  isMobileFiltersOpen ||
                  filters.status !== 'todos' ||
                  filters.centro !== 'todos' ||
                  filters.depositoOrigem !== 'todos' ||
                  filters.depositoDestino !== 'todos' ||
                  iq09MacroFilter !== 'todos'
                    ? 'bg-[#002664] text-white border-[#002664]'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filtros</span>
                {(filters.status !== 'todos' ||
                  filters.centro !== 'todos' ||
                  filters.depositoOrigem !== 'todos' ||
                  filters.depositoDestino !== 'todos' ||
                  iq09MacroFilter !== 'todos') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                )}
              </button>
            </div>

            {/* Direita: Seletores Compactos Alinhados em Linha Única */}
            <div
              className={`${
                isMobileFiltersOpen ? 'grid grid-cols-2 gap-1.5 pt-1' : 'hidden'
              } md:flex md:flex-wrap items-center gap-1.5 w-full md:w-auto justify-end`}
            >
              {/* Status Filter */}
              <select
                value={filters.status}
                onChange={(e) => onFilterChange({ ...filters, status: e.target.value as any })}
                className={`h-8 px-2.5 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                  filters.status !== 'todos'
                    ? 'bg-[#E0F2FE] text-[#002664] border-[#38BDF8] font-bold'
                    : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/90 text-slate-700'
                }`}
              >
                <option value="todos">Status: Todos</option>
                <option value="pendente">⏳ Pendente (FIFO)</option>
                <option value="em_analise">🔄 Em Validação SAP</option>
                <option value="concluido">✓ Concluído SAP</option>
                <option value="divergencia">⚠ Divergência</option>
              </select>

              {/* Centro Filter */}
              <select
                value={filters.centro}
                onChange={(e) => onFilterChange({ ...filters, centro: e.target.value })}
                className={`h-8 px-2.5 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                  filters.centro !== 'todos'
                    ? 'bg-[#E0F2FE] text-[#002664] border-[#38BDF8] font-bold'
                    : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/90 text-slate-700'
                }`}
              >
                <option value="todos">Centro: Todos</option>
                {allCentros.map((c) => (
                  <option key={c} value={c}>
                    Centro {c}
                  </option>
                ))}
              </select>

              {/* Dep. Origem Filter */}
              <select
                value={filters.depositoOrigem}
                onChange={(e) => onFilterChange({ ...filters, depositoOrigem: e.target.value })}
                className={`h-8 px-2.5 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                  filters.depositoOrigem !== 'todos'
                    ? 'bg-[#E0F2FE] text-[#002664] border-[#38BDF8] font-bold'
                    : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/90 text-slate-700'
                }`}
              >
                <option value="todos">Origem: Todas</option>
                {allDepsOrigem.map((d) => (
                  <option key={d} value={d}>
                    Origem {d}
                  </option>
                ))}
              </select>

              {/* Dep. Destino Filter */}
              <select
                value={filters.depositoDestino}
                onChange={(e) => onFilterChange({ ...filters, depositoDestino: e.target.value })}
                className={`h-8 px-2.5 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                  filters.depositoDestino !== 'todos'
                    ? 'bg-[#E0F2FE] text-[#002664] border-[#38BDF8] font-bold'
                    : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/90 text-slate-700'
                }`}
              >
                <option value="todos">Destino: Todos</option>
                {allDepsDestino.map((d) => (
                  <option key={d} value={d}>
                    Destino {d}
                  </option>
                ))}
              </select>

              {/* Indicador Compacto de Avaria Definitiva */}
              {flaggedDamageCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200 shrink-0"
                  title={`${flaggedDamageCount} solicitação(ões) com depósito de origem de Avaria Definitiva (B136, B149 ou B137)`}
                >
                  <span>🔴 {flaggedDamageCount} Avaria</span>
                </span>
              )}

              {/* Indicador de Ordenação Ativa */}
              {sortConfig.field !== 'fifo' && (
                <button
                  type="button"
                  onClick={() => setSortConfig({ field: 'fifo', direction: 'asc' })}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#E0F2FE] border border-[#7DD3FC] text-[#002664] text-[11px] font-bold cursor-pointer hover:bg-[#BAE6FD]/60 transition-colors"
                  title="Clique para voltar à ordem cronológica FIFO padrão"
                >
                  <span>
                    Ordem:{' '}
                    {sortConfig.field === 'material'
                      ? 'Material'
                      : sortConfig.field === 'centro'
                      ? 'Centro'
                      : sortConfig.field === 'rota'
                      ? 'Rota'
                      : sortConfig.field === 'serial'
                      ? 'Serial'
                      : sortConfig.field === 'status'
                      ? 'Status'
                      : sortConfig.field}
                  </span>
                  <RotateCcw className="w-3 h-3 text-[#00609C]" />
                </button>
              )}

              {/* Botão para Restaurar Largura Padrão das Colunas */}
              {isCustomColumnWidths && (
                <button
                  type="button"
                  onClick={handleResetAllCols}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-semibold transition-all cursor-pointer"
                  title="Restaurar tamanho equilibrado de todas as colunas da tabela"
                >
                  <RotateCcw className="w-3 h-3 text-[#00609C]" />
                  <span>Colunas</span>
                </button>
              )}

              {/* Limpar Filtros */}
              {(filters.busca ||
                filters.status !== 'todos' ||
                filters.centro !== 'todos' ||
                filters.depositoOrigem !== 'todos' ||
                filters.depositoDestino !== 'todos' ||
                filters.apenasDivergencias ||
                iq09MacroFilter !== 'todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setIq09MacroFilter('todos');
                    onFilterChange({
                      busca: '',
                      status: 'todos',
                      centro: 'todos',
                      depositoOrigem: 'todos',
                      depositoDestino: 'todos',
                      periodo: 'todos',
                      apenasDivergencias: false,
                    });
                  }}
                  className="h-8 px-2.5 text-[11px] text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-bold transition-all cursor-pointer shrink-0"
                >
                  ✕ Limpar
                </button>
              )}
            </div>
          </div>

          {/* LINHA 2: FAIXA INTEGRADA E ENXUTA DE BATIMENTO IQ09 ⟷ FILA SAP */}
          <div className={`${isMobileFiltersOpen || iq09MacroFilter !== 'todos' ? 'block' : 'hidden md:block'}`}>
            {iq09QueueSummary.hasBase ? (
              <div className="px-3 sm:px-4 py-2 bg-[#F0F7FF] border-t border-[#BAE6FD]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                {/* Esquerda + Pílulas de Semáforo IQ09 em 1 Linha */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#002664] text-white text-[10px] font-extrabold tracking-wide uppercase shrink-0">
                    <Database className="w-3 h-3 text-[#38BDF8]" />
                    <span>Batimento IQ09</span>
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setIq09MacroFilter(
                        iq09MacroFilter === 'pronto_macro_100' ? 'todos' : 'pronto_macro_100'
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                      iq09MacroFilter === 'pronto_macro_100'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white hover:bg-emerald-50 text-slate-700 border-slate-200/90'
                    }`}
                    title="Material, Centro e Depósito de Origem batem 100% com a IQ09"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>100% OK p/ Macro</span>
                    <span
                      className={`font-mono font-black px-1.5 py-0.2 rounded text-[10px] ${
                        iq09MacroFilter === 'pronto_macro_100'
                          ? 'bg-emerald-800 text-white'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {iq09QueueSummary.prontosMacro}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setIq09MacroFilter(
                        iq09MacroFilter === 'corrigivel_depara' ? 'todos' : 'corrigivel_depara'
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                      iq09MacroFilter === 'corrigivel_depara'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs'
                        : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200/90'
                    }`}
                    title="Material, Centro ou Origem difere da IQ09 (Corrigível via De-Para)"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>De-Para IQ09</span>
                    <span
                      className={`font-mono font-black px-1.5 py-0.2 rounded text-[10px] ${
                        iq09MacroFilter === 'corrigivel_depara'
                          ? 'bg-amber-950 text-amber-200'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {iq09QueueSummary.corrigiveisDePara}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setIq09MacroFilter(
                        iq09MacroFilter === 'ja_no_destino_sap' ? 'todos' : 'ja_no_destino_sap'
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                      iq09MacroFilter === 'ja_no_destino_sap'
                        ? 'bg-[#00609C] text-white border-[#002664] shadow-2xs'
                        : 'bg-white hover:bg-sky-50 text-slate-700 border-slate-200/90'
                    }`}
                    title="Serial já consta no depósito de destino na IQ09"
                  >
                    <span className="w-2 h-2 rounded-full bg-[#249ED5]" />
                    <span>Já no Destino</span>
                    <span
                      className={`font-mono font-black px-1.5 py-0.2 rounded text-[10px] ${
                        iq09MacroFilter === 'ja_no_destino_sap'
                          ? 'bg-[#002664] text-white'
                          : 'bg-sky-100 text-[#002664]'
                      }`}
                    >
                      {iq09QueueSummary.jaNoDestino}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setIq09MacroFilter(
                        iq09MacroFilter === 'erro_critico_macro' ? 'todos' : 'erro_critico_macro'
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                      iq09MacroFilter === 'erro_critico_macro'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                        : 'bg-white hover:bg-rose-50 text-slate-700 border-slate-200/90'
                    }`}
                    title="Ausente na IQ09, Trava Sênior WMS ou Avaria Definitiva"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Impedido / Trava WMS</span>
                    <span
                      className={`font-mono font-black px-1.5 py-0.2 rounded text-[10px] ${
                        iq09MacroFilter === 'erro_critico_macro'
                          ? 'bg-rose-900 text-white'
                          : 'bg-rose-100 text-rose-900'
                      }`}
                    >
                      {iq09QueueSummary.errosCriticos}
                    </span>
                  </button>
                </div>

                {/* Direita: Botões de Ação Rápida de Automação */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {iq09QueueSummary.corrigiveisDePara > 0 && onApplyIQ09DePara && (
                    <button
                      type="button"
                      disabled={isApplyingDePara}
                      onClick={handleFixAllDeParaWithIQ09}
                      className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95"
                      title="Corrige automaticamente Material, Centro e Depósito de Origem de todas as solicitações divergentes para bater 100% com a IQ09"
                    >
                      <Zap className="w-3 h-3 fill-slate-950" />
                      <span>
                        {isApplyingDePara
                          ? 'Sincronizando...'
                          : `Corrigir De-Para (${iq09QueueSummary.corrigiveisDePara})`}
                      </span>
                    </button>
                  )}

                  {iq09QueueSummary.prontosMacro > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const readyIds = new Set(iq09QueueSummary.prontosItems.map((i) => i.id));
                        setSelectedIds(readyIds);
                        onOpenSAPModal(iq09QueueSummary.prontosItems);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#002664] hover:bg-[#00488E] text-white font-extrabold text-[11px] inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
                      title="Seleciona apenas os itens 100% batidos com a IQ09 e abre o Assistente para rodar a Macro MIGO sem erros"
                    >
                      <Terminal className="w-3 h-3 text-[#38BDF8]" />
                      <span>Assistente Macro OK ({iq09QueueSummary.prontosMacro})</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              onOpenIQ09Tab && (
                <div className="px-3.5 py-2 bg-[#F0F7FF] border-t border-[#BAE6FD]/70 flex flex-wrap items-center justify-between gap-2 text-xs text-[#002664]">
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-[#0083CA]" />
                    <span>
                      Importe a planilha <strong>IQ09 (.xlsx)</strong> para ativar o <strong>Batimento Automático</strong> direto na fila.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenIQ09Tab}
                    className="px-2.5 py-1 rounded-lg bg-[#002664] hover:bg-[#00488E] text-white font-bold text-[11px] cursor-pointer"
                  >
                    Importar Base IQ09 (.xlsx)
                  </button>
                </div>
              )
            )}
          </div>

          {/* Selected Rows Batch Action Bar - Botões Dinâmicos, Leves e Suaves */}
          {selectedItemsList.length > 0 && (
            <div className="flex flex-wrap items-center justify-between p-2.5 bg-blue-50/90 border border-blue-200/80 rounded-2xl animate-in fade-in duration-150 gap-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#00609C] text-white shadow-xs">
                  {selectedItemsList.length} selecionado(s)
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-rose-600 hover:bg-white/80 border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                  title="Desmarcar todos os itens selecionados"
                >
                  ✕ Desmarcar
                </button>
                <span className="text-xs text-slate-600 hidden sm:inline font-medium">
                  Ações em lote para o SAP:
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySelectedTable}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-2xs"
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-600" />
                  <span>Copiar TAB</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopySelectedSerials}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-2xs"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Copiar Seriais</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenSAPModal(selectedItemsList)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Assistente SAP</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenResolutionModal(selectedItemsList, 'concluir')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xs"
                  title="Concluir itens selecionados no SAP"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Concluir ({selectedItemsList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const idsToUpdate = selectedItemsList.map((i) => i.id);
                    setSelectedIds(new Set());
                    onBatchUpdateStatus?.(idsToUpdate, 'em_analise');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xs"
                  title="Alterar status dos itens selecionados para Em Análise"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Em Análise</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const idsToUpdate = selectedItemsList.map((i) => i.id);
                    setSelectedIds(new Set());
                    onBatchUpdateStatus?.(idsToUpdate, 'pendente');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xs"
                  title="Voltar status dos itens selecionados para Pendente"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pendente</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenResolutionModal(selectedItemsList, 'divergencia')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xs"
                  title="Registrar divergência nos itens selecionados"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Divergência</span>
                </button>

                {onDeleteSelected && (
                  <button
                    type="button"
                    onClick={() => setIsBatchDeleteModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 shadow-xs cursor-pointer"
                    title="Excluir linhas selecionadas caso alguém tenha digitado incorretamente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir ({selectedItemsList.length})</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Notificação flutuante de cópia */}
          {copiedBatchNotice && (
            <div className="p-2 bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-700" />
              <span>Dados copiados para a área de transferência! Cole diretamente no SAP GUI ou MIGO.</span>
            </div>
          )}
        </div>

        {/* 1. VISÃO MOBILE OTIMIZADA (FLUTTER CARD-BASED COM SUPORTE A FOTO E ZERO ESTOURO DE GRID) */}
        <div className="block md:hidden divide-y divide-slate-200 w-full max-w-full overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">Nenhuma movimentação encontrada</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const damageCheck = checkDefinitiveDamageOrigin(item.depositoOrigem, item.depositoDestino);
              const isInvalidOrigin = damageCheck.isInvalidOrigin;
              const iqAudit = iq09AuditMap.get(item.id);

              return (
                <div
                  key={`mobile-${item.id}`}
                  className={`p-3 transition-colors w-full max-w-full overflow-hidden ${
                    isInvalidOrigin
                      ? 'bg-red-100/95 border-l-4 border-l-red-600'
                      : isSelected
                      ? 'bg-blue-50/70'
                      : item.status === 'divergencia'
                      ? 'bg-rose-50/40'
                      : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  {/* Header do Card Mobile */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-[#0083CA] focus:ring-[#0083CA] cursor-pointer"
                      />
                      <span
                        className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isInvalidOrigin
                            ? 'bg-red-200 text-red-950 border border-red-400'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        FIFO #{item.prioridadeFifo}
                      </span>
                      <span
                        className={`font-mono text-sm font-extrabold ${
                          isInvalidOrigin ? 'text-red-950' : 'text-slate-900'
                        }`}
                      >
                        {item.material}
                      </span>
                      {iqAudit?.hasIQ09Base && item.status !== 'concluido' && (
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                            iqAudit.macroStatus === 'pronto_macro_100'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : iqAudit.macroStatus === 'corrigivel_depara'
                              ? 'bg-amber-100 text-amber-950 border-amber-400'
                              : iqAudit.macroStatus === 'ja_no_destino_sap'
                              ? 'bg-sky-100 text-sky-900 border-sky-300'
                              : 'bg-rose-100 text-rose-900 border-rose-300'
                          }`}
                        >
                          {iqAudit.badgeLabel}
                        </span>
                      )}
                      {isInvalidOrigin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold shadow-2xs">
                          🚫 SOLICITAÇÃO INCORRETA • AVARIA DEFINITIVA
                        </span>
                      )}
                    </div>

                    {/* Status Badge Interativo Mobile */}
                    <div>
                      <select
                        value={item.status}
                        onChange={(e) => {
                          const newStatus = e.target.value as TransferStatus;
                          if (newStatus === 'concluido' || newStatus === 'divergencia') {
                            onOpenResolutionModal([item], newStatus === 'concluido' ? 'concluir' : 'divergencia');
                          } else {
                            onUpdateStatusSingle(item.id, newStatus);
                          }
                        }}
                        className={`text-[10px] font-bold rounded-full px-2 py-0.5 border cursor-pointer transition-all outline-hidden appearance-none ${
                          item.status === 'pendente'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : item.status === 'em_analise'
                            ? 'bg-blue-100 text-[#00609C] border-blue-300'
                            : item.status === 'concluido'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}
                        title="Tocar para alterar status"
                      >
                        <option value="pendente">⏳ Pendente</option>
                        <option value="em_analise">🔄 Em Análise</option>
                        <option value="concluido">✓ Concluído</option>
                        <option value="divergencia">⚠ Divergência</option>
                      </select>
                    </div>
                  </div>

                    {/* Serial, Posição WMS/SAP & Centro (Sem ocultar nenhuma informação no Mobile) */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 mb-2 space-y-1.5 text-xs">
                      <div className="flex items-start justify-between gap-2 font-mono">
                        <span className="text-slate-500 text-[11px] shrink-0">Serial (UII):</span>
                        <div className="flex flex-col items-end gap-1 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 break-all text-right">
                            <span>{item.serial}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(item.serial);
                                setCopiedId(`m-ser-${item.id}`);
                                setTimeout(() => setCopiedId(null), 1500);
                              }}
                              className="text-slate-400 hover:text-slate-700 active:scale-90 shrink-0"
                            >
                              {copiedId === `m-ser-${item.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          {iqAudit?.iq09Item?.equipamento && (
                            <span className="text-[10px] text-slate-500">
                              Eq. SAP: {iqAudit.iq09Item.equipamento}
                            </span>
                          )}
                          {iqAudit?.wmsVerdict?.wmsItem && (
                            <span className="text-[10px] font-sans font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              WMS: {iqAudit.wmsVerdict.wmsItem.depositoWms || 'S/ SALDO'}
                              {iqAudit.wmsVerdict.wmsItem.localWms
                                ? ` (${iqAudit.wmsVerdict.wmsItem.localWms})`
                                : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 font-mono text-[11px]">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded ${
                            isInvalidOrigin
                              ? 'bg-red-200 text-red-950 border border-red-400'
                              : 'text-indigo-700 bg-indigo-50'
                          }`}
                        >
                          Centro {item.centro}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isInvalidOrigin ? (
                            <span className="px-2 py-0.5 rounded bg-red-600 text-white font-extrabold shadow-2xs">
                              {item.depositoOrigem} ⚠️
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                              {item.depositoOrigem}
                            </span>
                          )}
                          <ArrowRight className={`w-3 h-3 ${isInvalidOrigin ? 'text-red-700' : 'text-slate-400'}`} />
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold ${
                              isInvalidOrigin
                                ? 'bg-white text-red-900 border border-red-400 font-extrabold'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {item.depositoDestino}
                          </span>
                        </div>
                      </div>

                      {isInvalidOrigin && damageCheck.originInfo && (
                        <div className="pt-1.5 border-t border-red-200 text-[11px] text-red-900 font-semibold leading-snug">
                          ❌ <strong>Origem {damageCheck.originInfo.code} ({damageCheck.originInfo.shortTitle}):</strong> Produto já avariado (Definitivo). Não deve ir para o estoque livre.
                        </div>
                      )}

                      {/* Alerta Enxuto e Botão VER MOTIVO / De-Para IQ09 no Card Mobile */}
                      {iqAudit?.hasIQ09Base && item.status !== 'concluido' && iqAudit.macroStatus !== 'pronto_macro_100' && (
                        <div
                          className={`pt-1.5 border-t text-[11px] font-semibold flex flex-col gap-1.5 ${
                            iqAudit.macroStatus === 'corrigivel_depara'
                              ? 'border-amber-200 text-amber-900'
                              : iqAudit.macroStatus === 'ja_no_destino_sap'
                              ? 'border-sky-200 text-sky-900'
                              : 'border-rose-200 text-rose-900'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold break-words">{iqAudit.badgeLabel}</span>
                            <button
                              type="button"
                              onClick={() => handleOpenMotivoModal(item, iqAudit)}
                              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] uppercase tracking-wider shadow-2xs cursor-pointer"
                            >
                              <ShieldAlert className="w-3 h-3 shrink-0" />
                              <span>VER MOTIVO</span>
                            </button>
                          </div>
                          {iqAudit.canAutoFixDePara && onApplyIQ09DePara && (
                            <button
                              type="button"
                              onClick={() => handleFixSingleItemWithIQ09(item, iqAudit)}
                              className="w-full py-1.5 px-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                            >
                              <Zap className="w-3.5 h-3.5 fill-slate-950" />
                              <span>
                                ⚡ Corrigir c/ IQ09 ({iqAudit.iq09Item?.material} • {iqAudit.iq09Item?.centro} • {iqAudit.iq09Item?.deposito})
                              </span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Foto da Label no Mobile (Com Câmera ao Vivo / Nativa e Galeria) */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                        <span className="text-slate-500 text-[11px]">Foto da Etiqueta:</span>
                        {item.labelPhotoUrl ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingPhotoItem(item)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#002664] text-[11px] font-bold cursor-pointer"
                            >
                              <img
                                src={item.labelPhotoUrl}
                                alt="Label"
                                className="w-4 h-4 object-cover rounded"
                              />
                              <span>Ver Foto</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCameraCaptureTargetItem(item)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              title="Trocar foto"
                            >
                              <Camera className="w-3.5 h-3.5 text-[#00609C]" />
                              <span>Trocar</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCameraCaptureTargetItem(item)}
                            className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#002664] hover:bg-[#003380] text-white text-[11px] font-bold shadow-2xs active:scale-95"
                          >
                            <Camera className="w-3.5 h-3.5 text-cyan-300" />
                            <span>
                              {uploadingItemId === item.id ? 'Salvando...' : '+ Tirar / Anexar Foto'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Solicitante & Horário Completo no Mobile */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 text-[11px] text-slate-600">
                        <span>
                          Solicitante: <strong className="text-slate-800">{item.criadoPor}</strong>
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {item.solicitationCode} •{' '}
                          {new Date(item.criadoEm).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Doc SAP ou Observações Completas (sem truncate) */}
                    {item.sapDocNumber && (
                      <div className="text-[11px] font-mono font-bold text-emerald-700 flex items-center gap-1 mb-1.5">
                        <FileCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Doc SAP: {item.sapDocNumber}</span>
                      </div>
                    )}
                    {item.observacoes && (
                      <div className={`text-[11px] flex items-start gap-1.5 mb-2 break-words whitespace-normal ${item.status === 'divergencia' ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}>
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{item.observacoes}</span>
                      </div>
                    )}

                  {/* Mobile Quick Action Buttons (Grid Responsivo 2 Colunas Sem Estouro) */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 w-full max-w-full">
                    <button
                      type="button"
                      onClick={() => handleCopySingleRow(item)}
                      className="py-1.5 px-2.5 text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5 active:scale-95 min-w-0"
                    >
                      <Terminal className="w-3.5 h-3.5 text-[#00609C] shrink-0" />
                      <span className="truncate">Copiar TAB</span>
                    </button>

                    {item.status !== 'concluido' && (
                      <button
                        type="button"
                        onClick={() => onOpenResolutionModal([item], 'concluir')}
                        className="py-1.5 px-2.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 min-w-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Concluir SAP</span>
                      </button>
                    )}

                    {item.status !== 'divergencia' && (
                      <button
                        type="button"
                        onClick={() => onOpenResolutionModal([item], 'divergencia')}
                        className="py-1.5 px-2.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl active:scale-95 flex items-center justify-center gap-1 min-w-0"
                      >
                        <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Divergência</span>
                      </button>
                    )}

                    {onDeleteSelected && (
                      <button
                        type="button"
                        onClick={() => setItemToDeleteSingle(item)}
                        className="py-1.5 px-2.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl active:scale-95 flex items-center justify-center gap-1 min-w-0"
                        title="Excluir este lançamento"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Excluir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 2. VISÃO DESKTOP (TABELA 100% RESPONSIVA DENTRO DA GRID COM REDIMENSIONAMENTO BALANCEADO) */}
        <div className="hidden md:block w-full overflow-hidden">
          <table ref={tableRef} className="w-full text-left text-xs border-collapse table-fixed">
            <colgroup>
              {COLUMN_ORDER.map((colKey) => (
                <col key={colKey} style={{ width: `${columnWidths[colKey]}%` }} />
              ))}
            </colgroup>
            <thead className="bg-slate-100/90 backdrop-blur-md text-slate-600 font-semibold uppercase tracking-wider text-[10px] xl:text-[11px] border-b border-slate-200">
              <tr>
                {/* 1. Checkbox Select */}
                <th className="py-2.5 px-1 text-center relative select-none">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = isSomeSelected;
                    }}
                    onChange={handleToggleSelectAll}
                    className="rounded text-[#0083CA] focus:ring-[#0083CA] cursor-pointer"
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'select')}
                    onDoubleClick={() => handleResetSingleCol('select')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 2. FIFO */}
                <th
                  className={`py-2.5 px-1 text-center relative select-none cursor-pointer transition-colors hover:bg-slate-200/80 ${
                    sortConfig.field === 'fifo' ? 'bg-blue-50/90 text-[#002664] font-bold' : ''
                  }`}
                  onClick={() => handleSort('fifo')}
                  title="Ordenar por Prioridade FIFO (Clique para alternar ordem)"
                >
                  <div className="flex items-center justify-center gap-0.5">
                    <span>FIFO</span>
                    {sortConfig.field === 'fifo' ? (
                      sortConfig.direction === 'asc' ? (
                        <ArrowUp className="w-2.5 h-2.5 text-[#00609C] stroke-[3] shrink-0" />
                      ) : (
                        <ArrowDown className="w-2.5 h-2.5 text-[#00609C] stroke-[3] shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'fifo')}
                    onDoubleClick={() => handleResetSingleCol('fifo')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 3. Material */}
                <th
                  className={`py-2.5 px-1.5 relative select-none cursor-pointer transition-colors hover:bg-slate-200/80 ${
                    sortConfig.field === 'material' ? 'bg-blue-50/90 text-[#002664] font-bold' : ''
                  }`}
                  onClick={() => handleSort('material')}
                  title="Ordenar e Agrupar por Materiais iguais (Clique para alternar A-Z / Z-A)"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="leading-tight">Material</span>
                    {sortConfig.field === 'material' ? (
                      sortConfig.direction === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'material')}
                    onDoubleClick={() => handleResetSingleCol('material')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 4. Serial */}
                <th
                  className={`py-2.5 px-1.5 relative select-none cursor-pointer transition-colors hover:bg-slate-200/80 ${
                    sortConfig.field === 'serial' ? 'bg-blue-50/90 text-[#002664] font-bold' : ''
                  }`}
                  onClick={() => handleSort('serial')}
                  title="Ordenar por Serial (Clique para alternar A-Z / Z-A)"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="leading-tight">Serial</span>
                    {sortConfig.field === 'serial' ? (
                      sortConfig.direction === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'serial')}
                    onDoubleClick={() => handleResetSingleCol('serial')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 5. Centro */}
                <th
                  className={`py-2.5 px-1 text-center relative select-none cursor-pointer transition-colors hover:bg-slate-200/80 ${
                    sortConfig.field === 'centro' ? 'bg-blue-50/90 text-[#002664] font-bold' : ''
                  }`}
                  onClick={() => handleSort('centro')}
                  title="Ordenar e Agrupar por Centros iguais (Clique para alternar)"
                >
                  <div className="flex items-center justify-center gap-0.5">
                    <span>Centro</span>
                    {sortConfig.field === 'centro' ? (
                      sortConfig.direction === 'asc' ? (
                        <ArrowUp className="w-2.5 h-2.5 text-[#00609C] stroke-[3] shrink-0" />
                      ) : (
                        <ArrowDown className="w-2.5 h-2.5 text-[#00609C] stroke-[3] shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'centro')}
                    onDoubleClick={() => handleResetSingleCol('centro')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 6. Rota Origem ➔ Destino */}
                <th
                  className={`py-2.5 px-1.5 relative select-none cursor-pointer transition-colors hover:bg-slate-200/80 ${
                    sortConfig.field === 'rota' ? 'bg-blue-50/90 text-[#002664] font-bold' : ''
                  }`}
                  onClick={() => handleSort('rota')}
                  title="Ordenar e Agrupar por Depósitos de Origem e Destino iguais"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="leading-tight">Origem ➔ Destino</span>
                    {sortConfig.field === 'rota' ? (
                      sortConfig.direction === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'rota')}
                    onDoubleClick={() => handleResetSingleCol('rota')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 7. Status */}
                <th
                  className={`py-2.5 px-1.5 relative select-none cursor-pointer transition-colors hover:bg-slate-200/80 ${
                    sortConfig.field === 'status' ? 'bg-blue-50/90 text-[#002664] font-bold' : ''
                  }`}
                  onClick={() => handleSort('status')}
                  title="Ordenar e Agrupar por Status (Pendente, Concluído, etc.)"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Status</span>
                    {sortConfig.field === 'status' ? (
                      sortConfig.direction === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'status')}
                    onDoubleClick={() => handleResetSingleCol('status')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 8. Foto Label (Novo!) */}
                <th className="py-2.5 px-1 text-center relative select-none">
                  <span className="flex items-center justify-center gap-1">
                    <Camera className="w-3 h-3 text-[#249ED5] shrink-0" />
                    <span>Label</span>
                  </span>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'foto')}
                    onDoubleClick={() => handleResetSingleCol('foto')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 9. Doc SAP / Obs */}
                <th
                  className={`py-2.5 px-1.5 relative select-none cursor-pointer transition-colors hover:bg-slate-200/80 ${
                    sortConfig.field === 'docSap' ? 'bg-blue-50/90 text-[#002664] font-bold' : ''
                  }`}
                  onClick={() => handleSort('docSap')}
                  title="Ordenar por Documento SAP / Observações"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="leading-tight">Doc SAP / Obs</span>
                    {sortConfig.field === 'docSap' ? (
                      sortConfig.direction === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#00609C] stroke-[3] shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60 hover:opacity-100 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'docSap')}
                    onDoubleClick={() => handleResetSingleCol('docSap')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 10. Solicitante */}
                <th className="py-2.5 px-1.5 relative select-none">
                  <span className="leading-tight">Solicitante</span>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleStartResize(e, 'solicitante')}
                    onDoubleClick={() => handleResetSingleCol('solicitante')}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#249ED5]/70 z-10"
                    title="Arraste para ajustar coluna (Duplo clique para restaurar)"
                  />
                </th>

                {/* 11. Ações */}
                <th className="py-2.5 pl-1.5 pr-3 text-right relative select-none">
                  <span>Ações</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-14 text-center text-slate-500">
                    {items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#002664] to-[#249ED5] text-white flex items-center justify-center shadow-lg mb-3">
                          <Sparkles className="w-7 h-7 text-cyan-200" />
                        </div>
                        <h4 className="text-base font-bold text-slate-800">
                          Sistema Pronto para Operação Oficial!
                        </h4>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          Nenhum registro de teste ativo. As novas solicitações de transferência criadas pelo Time Buiatte aparecerão aqui em tempo real com prioridade FIFO, SLA e conferência SAP.
                        </p>
                        <div className="flex items-center gap-2.5 mt-4">
                          {onOpenNewModal && (
                            <button
                              type="button"
                              onClick={onOpenNewModal}
                              className="px-4 py-2 rounded-xl bg-[#002664] hover:bg-[#003380] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                            >
                              + Nova Solicitação (N)
                            </button>
                          )}
                          {onOpenBatchPaste && (
                            <button
                              type="button"
                              onClick={onOpenBatchPaste}
                              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all border border-slate-300 active:scale-95 cursor-pointer"
                            >
                              Colar do Excel (V)
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <Filter className="w-8 h-8 text-slate-300 mb-2" />
                        <p className="text-sm font-semibold text-slate-700">Nenhuma solicitação encontrada</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Tente alterar os termos de busca ou filtros selecionados.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const damageCheck = checkDefinitiveDamageOrigin(item.depositoOrigem, item.depositoDestino);
                  const routeAnalysis = analyzeTransferRoute(item.centro, item.depositoOrigem, item.depositoDestino);
                  const isInvalidOrigin = damageCheck.isInvalidOrigin;
                  const iqAudit = iq09AuditMap.get(item.id);
                  const showIQ09Diff = Boolean(iqAudit?.hasIQ09Base && item.status !== 'concluido');

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isInvalidOrigin
                          ? 'bg-red-100/90 hover:bg-red-100 border-l-4 border-l-red-600'
                          : showIQ09Diff && iqAudit?.macroStatus === 'erro_critico_macro'
                          ? 'bg-rose-50/70 hover:bg-rose-100/70 border-l-4 border-l-rose-500'
                          : showIQ09Diff && iqAudit?.macroStatus === 'corrigivel_depara'
                          ? 'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-500'
                          : showIQ09Diff && iqAudit?.macroStatus === 'ja_no_destino_sap'
                          ? 'bg-sky-50/60 hover:bg-sky-100/60 border-l-4 border-l-sky-500'
                          : isSelected
                          ? 'bg-blue-50/80 hover:bg-blue-50'
                          : item.status === 'divergencia'
                          ? 'bg-rose-50/30 hover:bg-rose-50/50'
                          : 'hover:bg-blue-50/50'
                      }`}
                    >
                      {/* 1. Checkbox */}
                      <td className="py-2 px-1 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded text-[#0083CA] focus:ring-[#0083CA] cursor-pointer"
                        />
                      </td>

                      {/* 2. FIFO # */}
                      <td className="py-2 px-1 text-center align-middle">
                        <span
                          className={`inline-flex items-center justify-center font-mono font-bold text-[10px] w-5 h-5 rounded-full transition-transform active:scale-95 ${
                            isInvalidOrigin
                              ? 'bg-red-600 text-white shadow-xs'
                              : item.prioridadeFifo === 1
                              ? 'bg-amber-500 text-white shadow-xs animate-pulse'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                          title={`Prioridade FIFO #${item.prioridadeFifo}`}
                        >
                          {item.prioridadeFifo}
                        </span>
                      </td>

                      {/* 3. Material (Com Batimento Automático IQ09) */}
                      <td className={`py-2 px-1.5 font-mono font-bold align-middle ${isInvalidOrigin ? 'text-red-950' : 'text-slate-900'}`}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-start justify-between gap-1">
                            <span
                              className={`break-all leading-tight text-[11px] ${
                                showIQ09Diff && iqAudit?.materialMismatch
                                  ? 'text-amber-900 underline decoration-wavy decoration-amber-500'
                                  : ''
                              }`}
                            >
                              {item.material}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(item.material);
                                setCopiedId(`mat-${item.id}`);
                                setTimeout(() => setCopiedId(null), 1500);
                              }}
                              className={`${
                                isInvalidOrigin ? 'text-red-500 hover:text-red-800' : 'text-slate-300 hover:text-slate-600'
                              } transition-colors active:scale-90 shrink-0 mt-0.5`}
                              title="Copiar código do material"
                            >
                              {copiedId === `mat-${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {/* Divergência de Material contra a Base IQ09 */}
                          {showIQ09Diff && iqAudit?.materialMismatch && iqAudit.iq09Item && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-950 border border-amber-400 text-[9px] font-mono font-extrabold leading-tight w-fit max-w-full"
                              title={`Na base IQ09 este serial pertence ao Material ${iqAudit.iq09Item.material} (diferente de ${item.material})`}
                            >
                              ⚠️ IQ09: {iqAudit.iq09Item.material}
                            </span>
                          )}

                          {isInvalidOrigin && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-sans font-extrabold leading-tight shadow-2xs w-fit max-w-full"
                              title={`Solicitação Incorreta: Origem ${damageCheck.originInfo?.code} (${damageCheck.originInfo?.definition}) não deve ir para estoque livre.`}
                            >
                              🚫 AVARIA DEFINITIVA
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Serial / UII (Com Selo de Batimento IQ09 em Tempo Real) */}
                      <td className={`py-2 px-1.5 font-mono align-middle ${isInvalidOrigin ? 'text-red-950 font-semibold' : 'text-slate-700'}`}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-start justify-between gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded border break-all leading-tight text-[11px] ${
                                isInvalidOrigin
                                  ? 'bg-red-50/90 border-red-300 text-red-950'
                                  : showIQ09Diff && !iqAudit?.serialFound
                                  ? 'bg-rose-100 border-rose-400 text-rose-950 font-bold'
                                  : showIQ09Diff && iqAudit?.macroStatus === 'pronto_macro_100'
                                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              {item.serial}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(item.serial);
                                setCopiedId(`ser-${item.id}`);
                                setTimeout(() => setCopiedId(null), 1500);
                              }}
                              className={`${
                                isInvalidOrigin ? 'text-red-500 hover:text-red-800' : 'text-slate-300 hover:text-slate-600'
                              } transition-colors active:scale-90 shrink-0 mt-0.5`}
                              title="Copiar serial"
                            >
                              {copiedId === `ser-${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {/* Selo Único de Status do Cruzamento Automático IQ09 + Sênior WMS */}
                          {(iqAudit?.hasIQ09Base || iqAudit?.wmsVerdict) && (
                            <div className="flex flex-wrap items-center gap-1">
                              {iqAudit?.wmsVerdict &&
                              iqAudit.wmsVerdict.code !== 'NO_WMS_BASE_LOADED' &&
                              !iqAudit.wmsVerdict.allowed ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenMotivoModal(item, iqAudit)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-sans font-extrabold leading-none border bg-rose-600 hover:bg-rose-700 text-white border-rose-700 cursor-pointer transition-colors"
                                  title="Clique para ver o motivo do bloqueio e a ação recomendada"
                                >
                                  <span>{iqAudit.wmsVerdict.badgeLabel}</span>
                                </button>
                              ) : iqAudit?.hasIQ09Base ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (iqAudit.macroStatus !== 'pronto_macro_100') {
                                      handleOpenMotivoModal(item, iqAudit);
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-sans font-extrabold leading-none border ${
                                    iqAudit.macroStatus === 'pronto_macro_100'
                                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300 cursor-default'
                                      : iqAudit.macroStatus === 'corrigivel_depara'
                                      ? 'bg-amber-200 hover:bg-amber-300 text-amber-950 border-amber-400 cursor-pointer'
                                      : iqAudit.macroStatus === 'ja_no_destino_sap'
                                      ? 'bg-sky-100 hover:bg-sky-200 text-sky-900 border-sky-300 cursor-pointer'
                                      : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 cursor-pointer'
                                  }`}
                                  title={
                                    iqAudit.macroStatus === 'pronto_macro_100'
                                      ? iqAudit.wmsVerdict?.wmsItem?.localWms
                                        ? `${iqAudit.summaryMessage} • Endereço WMS: ${iqAudit.wmsVerdict.wmsItem.localWms}`
                                        : iqAudit.summaryMessage
                                      : 'Clique para ver o motivo completo'
                                  }
                                >
                                  <span>
                                    {iqAudit.badgeLabel}
                                    {iqAudit.macroStatus === 'pronto_macro_100' &&
                                    iqAudit.wmsVerdict?.wmsItem?.localWms
                                      ? ` (${iqAudit.wmsVerdict.wmsItem.localWms})`
                                      : ''}
                                  </span>
                                </button>
                              ) : null}

                              {iqAudit?.iq09Item?.equipamento && (
                                <span className="text-[9px] text-slate-400 font-mono">
                                  Eq.{iqAudit.iq09Item.equipamento}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 5. Centro (Com Batimento Automático IQ09) */}
                      <td className="py-2 px-1 text-center align-middle">
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              isInvalidOrigin
                                ? 'bg-red-200 text-red-950 border-red-400'
                                : showIQ09Diff && iqAudit?.centroMismatch
                                ? 'bg-amber-100 text-amber-950 border-amber-400 line-through'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                          >
                            {item.centro}
                          </span>
                          {showIQ09Diff && iqAudit?.centroMismatch && iqAudit.iq09Item && (
                            <span
                              className="inline-block px-1.5 py-0.5 rounded bg-amber-300 text-slate-950 font-mono font-extrabold text-[9px] border border-amber-500"
                              title={`Na base IQ09 este serial está no Centro ${iqAudit.iq09Item.centro} (não em ${item.centro})`}
                            >
                              IQ09:{iqAudit.iq09Item.centro}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. Depósito Origem -> Destino (Com Batimento Automático IQ09 e Botão 1 Clique De-Para) */}
                      <td className="py-2 px-1.5 font-mono align-middle">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-1 text-[11px]">
                            {isInvalidOrigin ? (
                              <span
                                className="px-1.5 py-0.5 rounded bg-red-600 text-white font-extrabold border border-red-700 shadow-2xs shrink-0"
                                title={damageCheck.originInfo?.definition}
                              >
                                {item.depositoOrigem} ⚠️
                              </span>
                            ) : showIQ09Diff && iqAudit?.origemMismatch ? (
                              <span
                                className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 font-extrabold border border-amber-400 shrink-0 line-through"
                                title={`Origem solicitada (${item.depositoOrigem}) difere do depósito atual na IQ09 (${iqAudit.iq09Item?.deposito})`}
                              >
                                {item.depositoOrigem}
                              </span>
                            ) : (
                              <span
                                className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200 shrink-0"
                                title={routeAnalysis.originDeposit ? `${routeAnalysis.originDeposit.code}: ${routeAnalysis.originDeposit.classification} (${routeAnalysis.originDeposit.application})` : item.depositoOrigem}
                              >
                                {item.depositoOrigem}
                              </span>
                            )}
                            <ArrowRight className={`w-3 h-3 shrink-0 ${isInvalidOrigin ? 'text-red-700' : 'text-slate-400'}`} />
                            <span
                              className={`px-1.5 py-0.5 rounded font-semibold border shrink-0 ${
                                isInvalidOrigin
                                  ? 'bg-white text-red-900 border-red-400 font-extrabold'
                                  : routeAnalysis.destinationDeposit?.colorScheme === 'yellow'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                  : routeAnalysis.destinationDeposit?.colorScheme === 'red'
                                  ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                              title={routeAnalysis.destinationDeposit ? `${routeAnalysis.destinationDeposit.code}: ${routeAnalysis.destinationDeposit.classification} (${routeAnalysis.destinationDeposit.application})` : item.depositoDestino}
                            >
                              {item.depositoDestino}
                            </span>
                          </div>

                          {/* Alerta de Depósito Origem Real na IQ09 */}
                          {showIQ09Diff && iqAudit?.origemMismatch && iqAudit.iq09Item && (
                            <span className="text-[9px] font-mono font-extrabold text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300 w-fit">
                              ⚠️ IQ09 Origem: {iqAudit.iq09Item.deposito} ➔ {item.depositoDestino}
                            </span>
                          )}

                          {/* Botão 1-Clique na Linha para Sincronizar De-Para com a IQ09 */}
                          {showIQ09Diff && iqAudit?.canAutoFixDePara && onApplyIQ09DePara && (
                            <button
                              type="button"
                              onClick={() => handleFixSingleItemWithIQ09(item, iqAudit)}
                              className="mt-0.5 px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-sans font-extrabold text-[9px] inline-flex items-center gap-1 w-fit shadow-2xs transition-all cursor-pointer active:scale-95"
                              title={`Substituir pelos dados da IQ09: Material ${iqAudit.iq09Item?.material}, Centro ${iqAudit.iq09Item?.centro}, Origem ${iqAudit.iq09Item?.deposito}`}
                            >
                              <Zap className="w-2.5 h-2.5 fill-slate-950 shrink-0" />
                              <span>⚡ Corrigir c/ IQ09</span>
                            </button>
                          )}

                          {isInvalidOrigin ? (
                            <span className="text-[9px] font-sans font-extrabold text-red-800 leading-tight">
                              ❌ PROIBIDO VOLTAR P/ LIVRE
                            </span>
                          ) : routeAnalysis.hasCenterMismatch || routeAnalysis.hasApplicationMismatch ? (
                            <span
                              className="text-[9px] font-sans font-bold text-amber-700 leading-tight"
                              title={routeAnalysis.warnings.join(' ')}
                            >
                              ⚠️ Verificar Centro/Depósito
                            </span>
                          ) : damageCheck.isValidDestination ? (
                            <span className="text-[9px] font-sans font-semibold text-emerald-700 leading-tight">
                              ✓ Entrada em Avaria (OK)
                            </span>
                          ) : routeAnalysis.destinationDeposit ? (
                            <span className="text-[9px] font-sans font-medium text-slate-500 leading-tight">
                              {routeAnalysis.destinationDeposit.shortTitle} ({routeAnalysis.destinationDeposit.application})
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 7. Status Badge com Troca Rápida */}
                      <td className="py-2 px-1.5 align-middle">
                        <select
                          value={item.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as TransferStatus;
                            if (newStatus === 'concluido' || newStatus === 'divergencia') {
                              onOpenResolutionModal([item], newStatus === 'concluido' ? 'concluir' : 'divergencia');
                            } else {
                              onUpdateStatusSingle(item.id, newStatus);
                            }
                          }}
                          className={`w-full max-w-full text-[10px] font-bold rounded-full px-2 py-0.5 border cursor-pointer transition-all outline-hidden appearance-none text-center ${
                            item.status === 'pendente'
                              ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                              : item.status === 'em_analise'
                              ? 'bg-blue-100 text-[#00609C] border-blue-300 hover:bg-blue-200'
                              : item.status === 'concluido'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200'
                          }`}
                          title="Clique para alterar status imediatamente"
                        >
                          <option value="pendente">⏳ Pendente</option>
                          <option value="em_analise">🔄 Em Análise</option>
                          <option value="concluido">✓ Concluído</option>
                          <option value="divergencia">⚠ Divergência</option>
                        </select>
                      </td>

                      {/* 8. Foto Label */}
                      <td className="py-2 px-1 text-center align-middle">
                        {item.labelPhotoUrl ? (
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingPhotoItem(item)}
                              className="group relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[#002664] text-[10px] font-bold hover:bg-blue-100 shadow-2xs transition-colors cursor-pointer"
                              title="Ver foto da etiqueta / label do produto"
                            >
                              <img
                                src={item.labelPhotoUrl}
                                alt="Label"
                                className="w-4 h-4 object-cover rounded shadow-2xs group-hover:scale-110 transition-transform"
                              />
                              <span>Foto</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setCameraCaptureTargetItem(item)}
                              className="cursor-pointer p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                              title="Tirar nova foto ou trocar imagem da etiqueta"
                            >
                              <Camera className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCameraCaptureTargetItem(item)}
                            className="cursor-pointer inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-slate-300 hover:border-[#002664] hover:bg-blue-50/50 text-slate-500 hover:text-[#002664] text-[10px] font-semibold transition-colors"
                            title="Tirar foto com a câmera ou anexar arquivo da etiqueta"
                          >
                            <Camera className="w-3 h-3 shrink-0" />
                            <span>{uploadingItemId === item.id ? '...' : '+ Foto'}</span>
                          </button>
                        )}
                      </td>

                      {/* 9. Doc SAP / Observações (Visual Enxuto + Botão VER MOTIVO) */}
                      <td className="py-2 px-1.5 align-middle">
                        {(isInvalidOrigin || (showIQ09Diff && iqAudit && iqAudit.macroStatus !== 'pronto_macro_100')) && (
                          <div className="flex flex-col items-start gap-1 mb-0.5">
                            <span
                              className={`text-[10px] font-extrabold leading-tight ${
                                isInvalidOrigin
                                  ? 'text-red-900'
                                  : iqAudit?.macroStatus === 'corrigivel_depara'
                                  ? 'text-amber-900'
                                  : iqAudit?.macroStatus === 'ja_no_destino_sap'
                                  ? 'text-sky-800'
                                  : 'text-rose-800'
                              }`}
                            >
                              {isInvalidOrigin && damageCheck.originInfo
                                ? `🛑 ${damageCheck.originInfo.shortTitle}: Proibido p/ Livre`
                                : iqAudit?.macroStatus === 'corrigivel_depara'
                                ? `⚡ De-Para: ${iqAudit.mismatchDetails.join(' | ')}`
                                : iqAudit?.macroStatus === 'ja_no_destino_sap'
                                ? `🔵 Já em ${item.depositoDestino} no SAP`
                                : '🛑 Solicitação Indevida'}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleOpenMotivoModal(item, iqAudit)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-extrabold text-[10px] uppercase tracking-wider shadow-2xs transition-all cursor-pointer active:scale-95 ${
                                iqAudit?.macroStatus === 'corrigivel_depara' && !isInvalidOrigin
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                  : iqAudit?.macroStatus === 'ja_no_destino_sap' && !isInvalidOrigin
                                  ? 'bg-sky-600 hover:bg-sky-700 text-white'
                                  : 'bg-rose-600 hover:bg-rose-700 text-white'
                              }`}
                              title="Clique para abrir o diagnóstico completo Sênior WMS ⟷ SAP e plano de ação"
                            >
                              <ShieldAlert className="w-3 h-3 shrink-0" />
                              <span>VER MOTIVO</span>
                            </button>
                          </div>
                        )}
                        {item.sapDocNumber ? (
                          <div className="flex items-start gap-1 text-[11px] font-mono text-emerald-700 font-bold leading-tight break-all">
                            <FileCheck className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                            <span>Doc: {item.sapDocNumber}</span>
                          </div>
                        ) : null}

                        {item.observacoes ? (
                          <div
                            className={`text-[10px] flex items-start gap-1 leading-tight break-words whitespace-normal mt-0.5 ${
                              isInvalidOrigin
                                ? 'text-red-800 font-semibold'
                                : item.status === 'divergencia'
                                ? 'text-rose-700 font-semibold'
                                : 'text-slate-600'
                            }`}
                          >
                            <MessageSquare className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                            <span>{item.observacoes}</span>
                          </div>
                        ) : !item.sapDocNumber &&
                          !isInvalidOrigin &&
                          !(showIQ09Diff && iqAudit && iqAudit.macroStatus !== 'pronto_macro_100') ? (
                          <span className="text-slate-400 text-[10px]">-</span>
                        ) : null}
                      </td>

                      {/* 10. Solicitante & Data (Nome completo visível sem cortar com '...') */}
                      <td className="py-2 px-1.5 text-[10px] text-slate-500 align-middle">
                        <div
                          className={`font-medium leading-tight break-words whitespace-normal ${
                            isInvalidOrigin ? 'text-red-950 font-bold' : 'text-slate-800'
                          }`}
                        >
                          {item.criadoPor}
                        </div>
                        <div className={`text-[9px] mt-0.5 ${isInvalidOrigin ? 'text-red-700 font-semibold' : 'text-slate-400'}`}>
                          {new Date(item.criadoEm).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* 11. Ações Rápidas (100% dentro da célula sem cortar ícones na direita) */}
                      <td className="py-2 pl-1 pr-3 text-right align-middle">
                        <div className="flex items-center justify-end gap-0.5">
                          {/* Copiar Linha */}
                          <button
                            type="button"
                            onClick={() => handleCopySingleRow(item)}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90"
                            title="Copiar linha formato SAP (TAB)"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Concluir no SAP */}
                          {item.status !== 'concluido' && (
                            <button
                              type="button"
                              onClick={() => onOpenResolutionModal([item], 'concluir')}
                              className="p-1 rounded text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-all active:scale-90"
                              title="Concluir no SAP (MIGO)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Apontar Divergência */}
                          {item.status !== 'divergencia' && (
                            <button
                              type="button"
                              onClick={() => onOpenResolutionModal([item], 'divergencia')}
                              className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all active:scale-90"
                              title="Apontar Divergência"
                            >
                              <AlertOctagon className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Mudar status para Em Análise */}
                          {item.status === 'pendente' && (
                            <button
                              type="button"
                              onClick={() => onUpdateStatusSingle(item.id, 'em_analise')}
                              className="p-1 rounded text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-all active:scale-90"
                              title="Mudar status para Em Análise"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Reabrir para Pendente se estiver em análise, concluído ou divergência */}
                          {item.status !== 'pendente' && (
                            <button
                              type="button"
                              onClick={() => onUpdateStatusSingle(item.id, 'pendente')}
                              className="p-1 rounded text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-all active:scale-90"
                              title="Reabrir item (Voltar para Pendente)"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Excluir Linha Individual (Caso de erro de digitação) */}
                          {onDeleteSelected && (
                            <button
                              type="button"
                              onClick={() => setItemToDeleteSingle(item)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all active:scale-90"
                              title="Excluir este lançamento (Erro de digitação)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Summary */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Exibindo <strong>{filteredItems.length}</strong> de <strong>{items.length}</strong> movimentações no ciclo mensal
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Fila FIFO • Atendimento prioritário para SLA
            </span>
          </div>
        </div>
      </div>

      {/* Modal de Zoom da Foto da Label */}
      <LabelPhotoModal
        item={viewingPhotoItem}
        onClose={() => setViewingPhotoItem(null)}
      />

      {/* Modal de Confirmação de Exclusão em Lote */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-rose-600 to-rose-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Excluir Solicitações?</h3>
                  <p className="text-xs text-rose-100">
                    {selectedItemsList.length} registro(s) selecionado(s)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-5 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2.5">
                <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Ação permanente:</span> Os itens selecionados serão removidos do banco de dados (Google Planilhas) e de todos os computadores sincronizados. Use esta função para limpar seriais ou materiais digitados por engano.
                </div>
              </div>

              {/* Lista Resumo dos Itens a serem excluídos */}
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-slate-50/50 p-1">
                {selectedItemsList.slice(0, 10).map((it) => (
                  <div key={it.id} className="p-2 text-xs flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate">{it.material}</div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">{it.serial}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-600 shrink-0">
                      <div>Centro {it.centro}</div>
                      <div className="text-[10px] text-slate-400">{it.depositoOrigem} ➔ {it.depositoDestino}</div>
                    </div>
                  </div>
                ))}
                {selectedItemsList.length > 10 && (
                  <div className="p-2 text-center text-xs text-slate-500 font-medium">
                    + {selectedItemsList.length - 10} outro(s) item(ns)
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    if (onDeleteSelected) {
                      await onDeleteSelected(Array.from(selectedIds));
                    }
                    setSelectedIds(new Set());
                    setIsBatchDeleteModalOpen(false);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all flex items-center gap-1.5 active:scale-95 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Excluindo...' : `Confirmar Exclusão (${selectedItemsList.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão Individual */}
      {itemToDeleteSingle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 bg-gradient-to-r from-rose-600 to-rose-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base">Excluir Solicitação?</h3>
                  <p className="text-[11px] text-rose-100">Correção de lançamento incorreto</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemToDeleteSingle(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                Deseja realmente excluir este lançamento do sistema?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1">
                <div><span className="font-semibold text-slate-500">Material:</span> <strong className="text-slate-800">{itemToDeleteSingle.material}</strong></div>
                <div><span className="font-semibold text-slate-500">Serial:</span> <span className="font-mono text-slate-800">{itemToDeleteSingle.serial}</span></div>
                <div><span className="font-semibold text-slate-500">Rota:</span> Centro {itemToDeleteSingle.centro} ({itemToDeleteSingle.depositoOrigem} ➔ {itemToDeleteSingle.depositoDestino})</div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToDeleteSingle(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    if (onDeleteSelected) {
                      await onDeleteSelected([itemToDeleteSingle.id]);
                    }
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(itemToDeleteSingle.id);
                      return next;
                    });
                    setItemToDeleteSingle(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all flex items-center gap-1 active:scale-95 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Excluindo...' : 'Excluir'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Diagnóstico Sênior WMS x SAP na Fila FIFO */}
      {selectedBlockedWmsAttempt && (
        <WMSBreakerWarningModal
          isOpen={Boolean(selectedBlockedWmsAttempt)}
          blockedAttempts={[selectedBlockedWmsAttempt]}
          totalSerialsCount={1}
          validSerialsCount={selectedBlockedWmsAttempt.verdict.allowed ? 1 : 0}
          onCloseAndFix={() => setSelectedBlockedWmsAttempt(null)}
        />
      )}

      {/* Modal de Câmera ao Vivo / Nativa para Anexar Foto na Fila */}
      <CameraCaptureModal
        isOpen={Boolean(cameraCaptureTargetItem)}
        title="Anexar Foto da Etiqueta / Material"
        subtitle={
          cameraCaptureTargetItem
            ? `Material: ${cameraCaptureTargetItem.material} • Serial: ${cameraCaptureTargetItem.serial}`
            : ''
        }
        onClose={() => setCameraCaptureTargetItem(null)}
        onCapturePhoto={(compressedDataUrl) => {
          if (cameraCaptureTargetItem && onAttachLabelPhoto) {
            onAttachLabelPhoto(cameraCaptureTargetItem.id, compressedDataUrl);
          }
          setCameraCaptureTargetItem(null);
        }}
      />
    </>
  );
};
