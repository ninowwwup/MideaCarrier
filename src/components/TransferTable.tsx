import React, { useState, useMemo } from 'react';
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
  CornerDownRight,
  Smartphone
} from 'lucide-react';
import { TransferItem, TransferStatus, TeamRole, FilterOptions } from '../types/transfer';
import { formatForSAPTable, formatSerialsForSAP } from '../utils/sapFormatter';

interface TransferTableProps {
  items: TransferItem[];
  currentRole: TeamRole;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onOpenSAPModal: (items: TransferItem[]) => void;
  onOpenResolutionModal: (items: TransferItem[], mode: 'concluir' | 'divergencia') => void;
  onUpdateStatusSingle: (id: string, newStatus: TransferStatus) => void;
}

export const TransferTable: React.FC<TransferTableProps> = ({
  items,
  currentRole,
  filters,
  onFilterChange,
  onOpenSAPModal,
  onOpenResolutionModal,
  onUpdateStatusSingle,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedBatchNotice, setCopiedBatchNotice] = useState(false);

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

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Search & Filter Toolbar */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/60 space-y-3">
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
              className="w-full pl-9 pr-14 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0083CA] focus:border-transparent placeholder:text-slate-400 shadow-2xs"
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

          {/* Filtros Rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => onFilterChange({ ...filters, status: e.target.value as any })}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
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
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
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
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
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
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-[#0083CA] shadow-2xs"
            >
              <option value="todos">Dep. Destino: Todos</option>
              {allDepsDestino.map((d) => (
                <option key={d} value={d}>
                  Dep. {d}
                </option>
              ))}
            </select>

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
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Concluir</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenResolutionModal(selectedItemsList, 'divergencia')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all active:scale-95 active:translate-y-0.5 shadow-2xs"
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

      {/* 1. VISÃO MOBILE OTIMIZADA (CARD-BASED PARA CELULARES & COLETOR) */}
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

                  {/* Status Badge */}
                  <div>
                    {item.status === 'pendente' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Pendente</span>
                      </span>
                    )}
                    {item.status === 'em_analise' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#00609C] border border-blue-200">
                        <RefreshCw className="w-3 h-3 animate-spin-slow" />
                        <span>Em Validação</span>
                      </span>
                    )}
                    {item.status === 'concluido' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Concluído</span>
                      </span>
                    )}
                    {item.status === 'divergencia' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <AlertOctagon className="w-3 h-3 text-rose-600" />
                        <span>Divergência</span>
                      </span>
                    )}
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

      {/* 2. VISÃO DESKTOP (TABELA COMPLETA COM HEADERS & AÇÕES) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100/80 text-slate-600 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
            <tr>
              <th className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isSomeSelected;
                  }}
                  onChange={handleToggleSelectAll}
                  className="rounded text-[#0083CA] focus:ring-[#0083CA] cursor-pointer"
                />
              </th>
              <th className="py-3 px-2 w-14 text-center">FIFO</th>
              <th className="py-3 px-3">Material</th>
              <th className="py-3 px-3">Serial</th>
              <th className="py-3 px-2 text-center">Centro</th>
              <th className="py-3 px-3">Origem ➔ Destino</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Doc SAP / Obs</th>
              <th className="py-3 px-3">Solicitante</th>
              <th className="py-3 px-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-500">
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
                    className={`transition-colors hover:bg-blue-50/40 ${
                      isSelected
                        ? 'bg-blue-50/70'
                        : item.status === 'divergencia'
                        ? 'bg-rose-50/30'
                        : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-[#0083CA] focus:ring-[#0083CA] cursor-pointer"
                      />
                    </td>

                    {/* FIFO # */}
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`inline-flex items-center justify-center font-mono font-bold text-[10px] w-6 h-6 rounded-full transition-transform active:scale-95 ${
                          item.prioridadeFifo === 1
                            ? 'bg-amber-500 text-white shadow-xs animate-pulse'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                        title={`Prioridade FIFO #${item.prioridadeFifo}`}
                      >
                        {item.prioridadeFifo}
                      </span>
                    </td>

                    {/* Material */}
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{item.material}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.material);
                            setCopiedId(`mat-${item.id}`);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          className="text-slate-300 hover:text-slate-600 transition-colors active:scale-90"
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

                    {/* Serial */}
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          {item.serial}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.serial);
                            setCopiedId(`ser-${item.id}`);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          className="text-slate-300 hover:text-slate-600 transition-colors active:scale-90"
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

                    {/* Centro */}
                    <td className="py-2.5 px-2 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {item.centro}
                      </span>
                    </td>

                    {/* Depósito Origem -> Destino */}
                    <td className="py-2.5 px-3 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                          {item.depositoOrigem}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                          {item.depositoDestino}
                        </span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-2.5 px-3">
                      {item.status === 'pendente' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Pendente</span>
                        </span>
                      )}
                      {item.status === 'em_analise' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-[#00609C] border border-blue-200">
                          <RefreshCw className="w-3 h-3 animate-spin-slow" />
                          <span>Em Validação</span>
                        </span>
                      )}
                      {item.status === 'concluido' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Concluído SAP</span>
                        </span>
                      )}
                      {item.status === 'divergencia' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertOctagon className="w-3 h-3 text-rose-600" />
                          <span>Divergência</span>
                        </span>
                      )}
                    </td>

                    {/* Doc SAP / Observações */}
                    <td className="py-2.5 px-3 max-w-xs">
                      {item.sapDocNumber ? (
                        <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-700 font-bold">
                          <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Doc: {item.sapDocNumber}</span>
                        </div>
                      ) : null}

                      {item.observacoes ? (
                        <div
                          className={`text-[11px] truncate flex items-center gap-1 ${
                            item.status === 'divergencia'
                              ? 'text-rose-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                          title={item.observacoes}
                        >
                          <MessageSquare className="w-3 h-3 shrink-0" />
                          <span className="truncate">{item.observacoes}</span>
                        </div>
                      ) : !item.sapDocNumber ? (
                        <span className="text-slate-400 text-[11px]">-</span>
                      ) : null}
                    </td>

                    {/* Solicitante & Data */}
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      <div className="truncate font-medium text-slate-700">{item.criadoPor}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(item.criadoEm).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>

                    {/* Ações Rápidas com Efeito de Tecla */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Botão Copiar Linha p/ SAP */}
                        <button
                          type="button"
                          onClick={() => handleCopySingleRow(item)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all active:scale-90"
                          title="Copiar linha formato SAP (TAB)"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        {/* Ações Midea (SAP) */}
                        {item.status !== 'concluido' && (
                          <button
                            type="button"
                            onClick={() => onOpenResolutionModal([item], 'concluir')}
                            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-all active:scale-90"
                            title="Concluir no SAP (Informar Doc. Material)"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}

                        {item.status !== 'divergencia' && (
                          <button
                            type="button"
                            onClick={() => onOpenResolutionModal([item], 'divergencia')}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-all active:scale-90"
                            title="Apontar Divergência no SAP"
                          >
                            <AlertOctagon className="w-4 h-4" />
                          </button>
                        )}

                        {item.status === 'pendente' && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatusSingle(item.id, 'em_analise')}
                            className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-all active:scale-90"
                            title="Mudar status para Em Validação"
                          >
                            <RefreshCw className="w-4 h-4" />
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
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div>
          Exibindo <strong>{filteredItems.length}</strong> de <strong>{items.length}</strong> movimentações registradas no ciclo mensal
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Fila FIFO: Atendimento prioritário para SLA
          </span>
        </div>
      </div>
    </div>
  );
};
