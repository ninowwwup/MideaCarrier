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
  SlidersHorizontal,
  Camera,
  Image as ImageIcon,
  RotateCcw
} from 'lucide-react';
import { TransferItem, TransferStatus, TeamRole, FilterOptions } from '../types/transfer';
import { formatForSAPTable, formatSerialsForSAP } from '../utils/sapFormatter';
import { LabelPhotoModal } from './LabelPhotoModal';
import { compressImageFile } from '../utils/imageCompressor';

interface TransferTableProps {
  items: TransferItem[];
  currentRole: TeamRole;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onOpenSAPModal: (items: TransferItem[]) => void;
  onOpenResolutionModal: (items: TransferItem[], mode: 'concluir' | 'divergencia') => void;
  onUpdateStatusSingle: (id: string, newStatus: TransferStatus) => void;
  onBatchUpdateStatus?: (ids: string[], newStatus: TransferStatus) => void;
  onAttachLabelPhoto?: (itemId: string, photoUrl: string) => void;
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

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  select: 38,
  fifo: 50,
  material: 130,
  serial: 175,
  centro: 75,
  rota: 150,
  status: 125,
  foto: 95,
  docSap: 155,
  solicitante: 125,
  acoes: 110,
};

const STORAGE_WIDTHS_KEY = 'migou_column_widths_v2';

export const TransferTable: React.FC<TransferTableProps> = ({
  items,
  currentRole,
  filters,
  onFilterChange,
  onOpenSAPModal,
  onOpenResolutionModal,
  onUpdateStatusSingle,
  onBatchUpdateStatus,
  onAttachLabelPhoto,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedBatchNotice, setCopiedBatchNotice] = useState(false);
  const [viewingPhotoItem, setViewingPhotoItem] = useState<TransferItem | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  // Colunas redimensionáveis estilo AppSheet
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_WIDTHS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
      }
    } catch (e) {}
    return DEFAULT_COLUMN_WIDTHS;
  });

  const resizingRef = useRef<{
    colKey: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Listas para filtros dinâmicos
  const allCentros = useMemo(() => Array.from(new Set(items.map((i) => i.centro))).sort(), [items]);
  const allDepsOrigem = useMemo(() => Array.from(new Set(items.map((i) => i.depositoOrigem))).sort(), [items]);
  const allDepsDestino = useMemo(() => Array.from(new Set(items.map((i) => i.depositoDestino))).sort(), [items]);

  // Itens filtrados
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
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
  }, [items, filters]);

  // Checkbox master
  const isAllSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;
  const isSomeSelected = selectedIds.size > 0 && !isAllSelected;

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
    return items.filter((i) => selectedIds.has(i.id));
  }, [items, selectedIds]);

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

  // Drag para redimensionamento de colunas (estilo AppSheet)
  const handleStartResize = (e: React.MouseEvent, colKey: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      colKey,
      startX: e.clientX,
      startWidth: columnWidths[colKey],
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = moveEvent.clientX - resizingRef.current.startX;
      const newWidth = Math.max(35, resizingRef.current.startWidth + delta);
      setColumnWidths((prev) => {
        const next = { ...prev, [resizingRef.current!.colKey]: newWidth };
        return next;
      });
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
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetSingleCol = (colKey: ColumnKey) => {
    setColumnWidths((prev) => {
      const next = { ...prev, [colKey]: DEFAULT_COLUMN_WIDTHS[colKey] };
      try {
        localStorage.setItem(STORAGE_WIDTHS_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleResetAllWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.setItem(STORAGE_WIDTHS_KEY, JSON.stringify(DEFAULT_COLUMN_WIDTHS));
    } catch (e) {}
  };

  const handleDirectAttachPhoto = async (itemId: string, file: File) => {
    if (!file || !onAttachLabelPhoto) return;
    try {
      setUploadingItemId(itemId);
      const compressed = await compressImageFile(file, 1024, 0.78);
      onAttachLabelPhoto(itemId, compressed);
    } catch (err) {
      console.error('Erro ao anexar foto:', err);
      alert('Não foi possível comprimir a foto da label.');
    } finally {
      setUploadingItemId(null);
    }
  };

  return (
    <>
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl overflow-hidden transition-all">
        {/* Search & Filter Toolbar com Glassmorphism */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200/80 bg-slate-50/70 backdrop-blur-md space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Campo de Busca Rápida com Efeito de Tecla [Ctrl+K] */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="global-search-input"
                type="text"
                placeholder="Buscar por Material, Serial, Centro, Doc SAP ou Depósito..."
                value={filters.busca}
                onChange={(e) => onFilterChange({ ...filters, busca: e.target.value })}
                className="w-full pl-9 pr-14 py-2 text-xs bg-white/90 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0083CA] focus:border-transparent placeholder:text-slate-400 shadow-2xs"
              />
              <div className="absolute right-2 top-2 flex items-center gap-1">
                {filters.busca ? (
                  <button
                    type="button"
                    onClick={() => onFilterChange({ ...filters, busca: '' })}
                    className="text-xs text-slate-400 hover:text-slate-600 px-1"
                  >
                    ✕
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-500 rounded border border-slate-200">
                    /
                  </kbd>
                )}
              </div>
            </div>

            {/* Filtros Rápidos & Botão Estilo AppSheet */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <select
                value={filters.status}
                onChange={(e) => onFilterChange({ ...filters, status: e.target.value as any })}
                className="px-2.5 py-1.5 text-xs font-medium bg-white/90 border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
              >
                <option value="todos">Status: Todos</option>
                <option value="pendente">Pendente (FIFO)</option>
                <option value="em_analise">Em Validação SAP</option>
                <option value="concluido">Concluído no SAP</option>
                <option value="divergencia">Com Divergência / Erro</option>
              </select>

              {/* Centro Filter */}
              <select
                value={filters.centro}
                onChange={(e) => onFilterChange({ ...filters, centro: e.target.value })}
                className="px-2.5 py-1.5 text-xs font-medium bg-white/90 border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
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
                className="px-2.5 py-1.5 text-xs font-medium bg-white/90 border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
              >
                <option value="todos">Dep. Origem: Todos</option>
                {allDepsOrigem.map((d) => (
                  <option key={d} value={d}>
                    Dep. {d}
                  </option>
                ))}
              </select>

              {/* Dep. Destino Filter */}
              <select
                value={filters.depositoDestino}
                onChange={(e) => onFilterChange({ ...filters, depositoDestino: e.target.value })}
                className="px-2.5 py-1.5 text-xs font-medium bg-white/90 border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
              >
                <option value="todos">Dep. Destino: Todos</option>
                {allDepsDestino.map((d) => (
                  <option key={d} value={d}>
                    Dep. {d}
                  </option>
                ))}
              </select>

              {/* Botão de Ajuste de Colunas (AppSheet View) */}
              <button
                type="button"
                onClick={handleResetAllWidths}
                title="Ajustar e redefinir espaçamento responsivo das colunas (estilo AppSheet)"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-white/90 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg shadow-2xs transition-all active:scale-95"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#00609C]" />
                <span className="hidden xl:inline">Colunas AppSheet</span>
              </button>

              {/* Limpar Filtros */}
              {(filters.busca ||
                filters.status !== 'todos' ||
                filters.centro !== 'todos' ||
                filters.depositoOrigem !== 'todos' ||
                filters.depositoDestino !== 'todos' ||
                filters.apenasDivergencias) && (
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange({
                      busca: '',
                      status: 'todos',
                      centro: 'todos',
                      depositoOrigem: 'todos',
                      depositoDestino: 'todos',
                      periodo: 'todos',
                      apenasDivergencias: false,
                    })
                  }
                  className="px-2 py-1 text-xs text-rose-600 hover:text-rose-800 font-medium active:scale-95"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Selected Rows Batch Action Bar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between p-2.5 bg-blue-50/95 border border-blue-200 rounded-xl animate-in fade-in duration-150 gap-2 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#0083CA] text-white">
                  {selectedIds.size} selecionado(s)
                </span>
                <span className="text-xs text-slate-600 hidden sm:inline">
                  Ações em lote para o SAP:
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySelectedTable}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-blue-300 text-[#00609C] hover:bg-blue-100 transition-all active:scale-95 active:translate-y-0.5 shadow-2xs"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Copiar TAB</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopySelectedSerials}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-blue-300 text-[#00609C] hover:bg-blue-100 transition-all active:scale-95 active:translate-y-0.5 shadow-2xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Copiar Seriais</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenSAPModal(selectedItemsList)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-black text-white transition-all active:scale-95 active:translate-y-0.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Assistente SAP</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenResolutionModal(selectedItemsList, 'concluir')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95 active:translate-y-0.5 shadow-2xs"
                  title="Concluir itens selecionados no SAP"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Concluir ({selectedItemsList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => onBatchUpdateStatus?.(selectedItemsList.map(i => i.id), 'em_analise')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-95 active:translate-y-0.5 shadow-2xs"
                  title="Alterar status dos itens selecionados para Em Análise"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Em Análise</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenResolutionModal(selectedItemsList, 'divergencia')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all active:scale-95 active:translate-y-0.5 shadow-2xs"
                  title="Registrar divergência nos itens selecionados"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Divergência</span>
                </button>
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

        {/* 1. VISÃO MOBILE OTIMIZADA (CARD-BASED COM SUPORTE A FOTO) */}
        <div className="block md:hidden divide-y divide-slate-200">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">Nenhuma movimentação encontrada</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={`mobile-${item.id}`}
                  className={`p-3.5 transition-colors ${
                    isSelected
                      ? 'bg-blue-50/70'
                      : item.status === 'divergencia'
                      ? 'bg-rose-50/40'
                      : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  {/* Header do Card Mobile */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-[#0083CA] focus:ring-[#0083CA] cursor-pointer"
                      />
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        FIFO #{item.prioridadeFifo}
                      </span>
                      <span className="font-mono text-sm font-extrabold text-slate-900">
                        {item.material}
                      </span>
                    </div>

                    {/* Status Badge Interativo Mobile */}
                    <div>
                      <select
                        value={item.status}
                        onChange={(e) => {
                          const newStatus = e.target.value as TransferStatus;
                          if (newStatus === 'concluido' || newStatus === 'divergencia') {
                            onOpenResolutionModal([item], newStatus);
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

                  {/* Serial & Centro */}
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80 mb-2 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-500 text-[11px]">Serial:</span>
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span>{item.serial}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.serial);
                            setCopiedId(`m-ser-${item.id}`);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          className="text-slate-400 hover:text-slate-700 active:scale-90"
                        >
                          {copiedId === `m-ser-${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 font-mono text-[11px]">
                      <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">
                        Centro {item.centro}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold">
                          {item.depositoOrigem}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold">
                          {item.depositoDestino}
                        </span>
                      </div>
                    </div>

                    {/* Foto da Label no Mobile */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                      <span className="text-slate-500 text-[11px]">Foto da Etiqueta:</span>
                      {item.labelPhotoUrl ? (
                        <button
                          type="button"
                          onClick={() => setViewingPhotoItem(item)}
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[#002664] text-[11px] font-bold"
                        >
                          <img
                            src={item.labelPhotoUrl}
                            alt="Label"
                            className="w-4 h-4 object-cover rounded"
                          />
                          <span>Ver Foto</span>
                        </button>
                      ) : (
                        <label className="cursor-pointer flex items-center gap-1 text-[11px] text-[#00609C] font-semibold hover:underline">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Anexar Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleDirectAttachPhoto(item.id, file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Doc SAP ou Observações */}
                  {item.sapDocNumber && (
                    <div className="text-[11px] font-mono font-bold text-emerald-700 flex items-center gap-1 mb-1.5">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Doc SAP: {item.sapDocNumber}</span>
                    </div>
                  )}
                  {item.observacoes && (
                    <div className={`text-[11px] flex items-center gap-1 mb-2 ${item.status === 'divergencia' ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
                      <MessageSquare className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.observacoes}</span>
                    </div>
                  )}

                  {/* Mobile Quick Action Buttons */}
                  <div className="flex items-center justify-between pt-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopySingleRow(item)}
                      className="flex-1 py-1 px-2 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1 active:scale-95"
                    >
                      <Terminal className="w-3 h-3 text-[#00609C]" />
                      <span>Copiar TAB</span>
                    </button>

                    {item.status !== 'concluido' && (
                      <button
                        type="button"
                        onClick={() => onOpenResolutionModal([item], 'concluir')}
                        className="flex-1 py-1 px-2 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-1 active:scale-95"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Concluir</span>
                      </button>
                    )}

                    {item.status !== 'divergencia' && (
                      <button
                        type="button"
                        onClick={() => onOpenResolutionModal([item], 'divergencia')}
                        className="py-1 px-2 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg active:scale-95"
                      >
                        Divergência
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 2. VISÃO DESKTOP (TABELA COM COLUNAS REDIMENSIONÁVEIS ESTILO APPSHEET) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead className="bg-slate-100/90 backdrop-blur-md text-slate-600 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                {/* 1. Checkbox Select */}
                <th
                  style={{ width: columnWidths.select, minWidth: columnWidths.select }}
                  className="py-2.5 px-2 text-center relative select-none"
                >
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
                    onMouseDown={(e) => handleStartResize(e, 'select')}
                    onDoubleClick={() => handleResetSingleCol('select')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5] group"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 2. FIFO */}
                <th
                  style={{ width: columnWidths.fifo, minWidth: columnWidths.fifo }}
                  className="py-2.5 px-1.5 text-center relative select-none"
                >
                  <span>FIFO</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'fifo')}
                    onDoubleClick={() => handleResetSingleCol('fifo')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 3. Material */}
                <th
                  style={{ width: columnWidths.material, minWidth: columnWidths.material }}
                  className="py-2.5 px-2 relative select-none"
                >
                  <span className="truncate">Material</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'material')}
                    onDoubleClick={() => handleResetSingleCol('material')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna (Duplo clique para auto-ajuste)"
                  />
                </th>

                {/* 4. Serial */}
                <th
                  style={{ width: columnWidths.serial, minWidth: columnWidths.serial }}
                  className="py-2.5 px-2 relative select-none"
                >
                  <span className="truncate">Serial</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'serial')}
                    onDoubleClick={() => handleResetSingleCol('serial')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna (Duplo clique para auto-ajuste)"
                  />
                </th>

                {/* 5. Centro */}
                <th
                  style={{ width: columnWidths.centro, minWidth: columnWidths.centro }}
                  className="py-2.5 px-1.5 text-center relative select-none"
                >
                  <span>Centro</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'centro')}
                    onDoubleClick={() => handleResetSingleCol('centro')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 6. Rota Origem ➔ Destino */}
                <th
                  style={{ width: columnWidths.rota, minWidth: columnWidths.rota }}
                  className="py-2.5 px-2 relative select-none"
                >
                  <span className="truncate">Origem ➔ Destino</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'rota')}
                    onDoubleClick={() => handleResetSingleCol('rota')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 7. Status */}
                <th
                  style={{ width: columnWidths.status, minWidth: columnWidths.status }}
                  className="py-2.5 px-2 relative select-none"
                >
                  <span>Status</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'status')}
                    onDoubleClick={() => handleResetSingleCol('status')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 8. Foto Label (Novo!) */}
                <th
                  style={{ width: columnWidths.foto, minWidth: columnWidths.foto }}
                  className="py-2.5 px-1.5 text-center relative select-none"
                >
                  <span className="flex items-center justify-center gap-1">
                    <Camera className="w-3 h-3 text-[#249ED5]" />
                    <span>Label</span>
                  </span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'foto')}
                    onDoubleClick={() => handleResetSingleCol('foto')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 9. Doc SAP / Obs */}
                <th
                  style={{ width: columnWidths.docSap, minWidth: columnWidths.docSap }}
                  className="py-2.5 px-2 relative select-none"
                >
                  <span className="truncate">Doc SAP / Obs</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'docSap')}
                    onDoubleClick={() => handleResetSingleCol('docSap')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 10. Solicitante */}
                <th
                  style={{ width: columnWidths.solicitante, minWidth: columnWidths.solicitante }}
                  className="py-2.5 px-2 relative select-none"
                >
                  <span className="truncate">Solicitante</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'solicitante')}
                    onDoubleClick={() => handleResetSingleCol('solicitante')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>

                {/* 11. Ações */}
                <th
                  style={{ width: columnWidths.acoes, minWidth: columnWidths.acoes }}
                  className="py-2.5 px-2 text-right relative select-none"
                >
                  <span>Ações</span>
                  <div
                    onMouseDown={(e) => handleStartResize(e, 'acoes')}
                    onDoubleClick={() => handleResetSingleCol('acoes')}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#249ED5]"
                    title="Redimensionar coluna"
                  />
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Filter className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-700">Nenhuma solicitação encontrada</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Tente alterar os termos de busca ou filtros selecionados.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-blue-50/50 ${
                        isSelected
                          ? 'bg-blue-50/80'
                          : item.status === 'divergencia'
                          ? 'bg-rose-50/30'
                          : ''
                      }`}
                    >
                      {/* 1. Checkbox */}
                      <td className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded text-[#0083CA] focus:ring-[#0083CA] cursor-pointer"
                        />
                      </td>

                      {/* 2. FIFO # */}
                      <td className="py-2 px-1.5 text-center">
                        <span
                          className={`inline-flex items-center justify-center font-mono font-bold text-[10px] w-5 h-5 rounded-full transition-transform active:scale-95 ${
                            item.prioridadeFifo === 1
                              ? 'bg-amber-500 text-white shadow-xs animate-pulse'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                          title={`Prioridade FIFO #${item.prioridadeFifo}`}
                        >
                          {item.prioridadeFifo}
                        </span>
                      </td>

                      {/* 3. Material */}
                      <td className="py-2 px-2 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1 overflow-hidden" title={item.material}>
                          <span className="truncate">{item.material}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(item.material);
                              setCopiedId(`mat-${item.id}`);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="text-slate-300 hover:text-slate-600 transition-colors active:scale-90 shrink-0"
                            title="Copiar código do material"
                          >
                            {copiedId === `mat-${item.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 4. Serial */}
                      <td className="py-2 px-2 font-mono text-slate-700">
                        <div className="flex items-center gap-1 overflow-hidden" title={item.serial}>
                          <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 truncate">
                            {item.serial}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(item.serial);
                              setCopiedId(`ser-${item.id}`);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="text-slate-300 hover:text-slate-600 transition-colors active:scale-90 shrink-0"
                            title="Copiar serial"
                          >
                            {copiedId === `ser-${item.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 5. Centro */}
                      <td className="py-2 px-1.5 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {item.centro}
                        </span>
                      </td>

                      {/* 6. Depósito Origem -> Destino */}
                      <td className="py-2 px-2 font-mono">
                        <div className="flex items-center gap-1 text-[11px] overflow-hidden">
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200 shrink-0">
                            {item.depositoOrigem}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 shrink-0">
                            {item.depositoDestino}
                          </span>
                        </div>
                      </td>

                      {/* 7. Status Badge com Troca Rápida */}
                      <td className="py-2 px-2">
                        <select
                          value={item.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as TransferStatus;
                            if (newStatus === 'concluido' || newStatus === 'divergencia') {
                              onOpenResolutionModal([item], newStatus);
                            } else {
                              onUpdateStatusSingle(item.id, newStatus);
                            }
                          }}
                          className={`text-[10px] font-bold rounded-full px-2 py-0.5 border cursor-pointer transition-all outline-hidden appearance-none ${
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

                      {/* 8. Foto Label (Novo!) */}
                      <td className="py-2 px-1.5 text-center">
                        {item.labelPhotoUrl ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingPhotoItem(item)}
                              className="group relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[#002664] text-[10px] font-bold hover:bg-blue-100 shadow-2xs transition-colors"
                              title="Ver foto da etiqueta / label do produto"
                            >
                              <img
                                src={item.labelPhotoUrl}
                                alt="Label"
                                className="w-4 h-4 object-cover rounded shadow-2xs group-hover:scale-110 transition-transform"
                              />
                              <span className="hidden xl:inline">Label</span>
                            </button>

                            <label
                              className="cursor-pointer p-0.5 text-slate-400 hover:text-slate-700"
                              title="Trocar foto da etiqueta"
                            >
                              <Camera className="w-3 h-3" />
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleDirectAttachPhoto(item.id, file);
                                }}
                              />
                            </label>
                          </div>
                        ) : (
                          <label
                            className="cursor-pointer inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-slate-300 hover:border-[#002664] text-slate-400 hover:text-[#002664] text-[10px] transition-colors"
                            title="Anexar foto da etiqueta para comprovação"
                          >
                            <Camera className="w-3 h-3" />
                            <span className="hidden xl:inline">+ Anexar</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleDirectAttachPhoto(item.id, file);
                              }}
                            />
                          </label>
                        )}
                      </td>

                      {/* 9. Doc SAP / Observações */}
                      <td className="py-2 px-2 overflow-hidden">
                        {item.sapDocNumber ? (
                          <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-700 font-bold truncate">
                            <FileCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="truncate">Doc: {item.sapDocNumber}</span>
                          </div>
                        ) : null}

                        {item.observacoes ? (
                          <div
                            className={`text-[10px] truncate flex items-center gap-1 ${
                              item.status === 'divergencia'
                                ? 'text-rose-700 font-semibold'
                                : 'text-slate-500'
                            }`}
                            title={item.observacoes}
                          >
                            <MessageSquare className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{item.observacoes}</span>
                          </div>
                        ) : !item.sapDocNumber ? (
                          <span className="text-slate-400 text-[10px]">-</span>
                        ) : null}
                      </td>

                      {/* 10. Solicitante & Data */}
                      <td className="py-2 px-2 text-[10px] text-slate-500 overflow-hidden">
                        <div className="truncate font-medium text-slate-700" title={item.criadoPor}>
                          {item.criadoPor}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {new Date(item.criadoEm).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* 11. Ações Rápidas */}
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Copiar Linha */}
                          <button
                            type="button"
                            onClick={() => handleCopySingleRow(item)}
                            className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90"
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
                              className="p-1 rounded text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-all active:scale-90"
                              title="Reabrir item (Voltar para Pendente)"
                            >
                              <Clock className="w-3.5 h-3.5" />
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
    </>
  );
};
