import React from 'react';
import { 
  Clock, 
  CheckCircle2, 
  AlertOctagon, 
  RefreshCw, 
  TrendingUp, 
  Layers, 
  ShieldCheck,
  Timer
} from 'lucide-react';
import { KPIStats, TransferStatus } from '../types/transfer';

interface KPIDashboardProps {
  stats: KPIStats;
  activeStatusFilter: TransferStatus | 'todos';
  onFilterByStatus: (status: TransferStatus | 'todos') => void;
}

export const KPIDashboard: React.FC<KPIDashboardProps> = ({
  stats,
  activeStatusFilter,
  onFilterByStatus,
}) => {
  return (
    <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3.5 mb-3 sm:mb-6 w-full max-w-full overflow-hidden">
      {/* 1. Pendentes (Fila FIFO) */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'pendente' ? 'todos' : 'pendente')}
        className={`text-left p-2.5 sm:p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer min-w-0 ${
          activeStatusFilter === 'pendente'
            ? 'bg-amber-50/95 border-amber-300 ring-2 ring-amber-400/60 shadow-[0_12px_30px_rgba(245,158,11,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-amber-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-1 sm:mb-2 gap-1">
          <span className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider text-amber-800 truncate">
            Fila FIFO
          </span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-amber-100/90 text-amber-700 shadow-2xs shrink-0">
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="text-lg sm:text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-amber-700 transition-colors">
          {stats.pendentes}
        </div>
        <div className="hidden sm:flex text-[11px] text-slate-500 mt-1 items-center gap-1 truncate">
          <Timer className="w-3 h-3 text-amber-600 shrink-0" />
          <span className="truncate">Mais antigo: {stats.maisAntigoPendenteMin} min</span>
        </div>
      </button>

      {/* 2. Em Análise SAP */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'em_analise' ? 'todos' : 'em_analise')}
        className={`text-left p-2.5 sm:p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer min-w-0 ${
          activeStatusFilter === 'em_analise'
            ? 'bg-blue-50/95 border-blue-300 ring-2 ring-blue-400/60 shadow-[0_12px_30px_rgba(0,131,202,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-blue-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#00609C] to-[#38BDF8] opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-1 sm:mb-2 gap-1">
          <span className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#00609C] truncate">
            Em MIGO
          </span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-blue-100/90 text-[#00609C] shadow-2xs shrink-0">
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin-slow" />
          </div>
        </div>
        <div className="text-lg sm:text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-[#00609C] transition-colors">
          {stats.emAnalise}
        </div>
        <p className="hidden sm:block text-[11px] text-slate-500 mt-1 truncate">
          Em processamento pelo time Midea
        </p>
      </button>

      {/* 3. Concluídos no SAP */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'concluido' ? 'todos' : 'concluido')}
        className={`text-left p-2.5 sm:p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer min-w-0 ${
          activeStatusFilter === 'concluido'
            ? 'bg-emerald-50/95 border-emerald-300 ring-2 ring-emerald-400/60 shadow-[0_12px_30px_rgba(16,185,129,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-emerald-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-1 sm:mb-2 gap-1">
          <span className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 truncate">
            Concluídos
          </span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="text-lg sm:text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-emerald-700 transition-colors">
          {stats.concluidos}
        </div>
        <p className="hidden sm:block text-[11px] text-slate-500 mt-1 truncate">
          Movimentação 311 efetuada
        </p>
      </button>

      {/* 4. Divergências / Erros */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'divergencia' ? 'todos' : 'divergencia')}
        className={`text-left p-2.5 sm:p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer min-w-0 ${
          activeStatusFilter === 'divergencia'
            ? 'bg-rose-50/95 border-rose-300 ring-2 ring-rose-400/60 shadow-[0_12px_30px_rgba(244,63,94,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-rose-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-red-600 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-1 sm:mb-2 gap-1">
          <span className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider text-rose-700 truncate">
            Divergências
          </span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs shrink-0">
            <AlertOctagon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="text-lg sm:text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-rose-700 transition-colors">
          {stats.divergencias}
        </div>
        <p className="hidden sm:block text-[11px] text-slate-500 mt-1 truncate">
          Requer ajuste do time Buiatte
        </p>
      </button>

      {/* 5. SLA Compliance */}
      <div className="p-2.5 sm:p-3.5 rounded-2xl border border-white/85 figma-glass-surface backdrop-blur-xl text-sm relative overflow-hidden min-w-0">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-1 sm:mb-2 gap-1">
          <span className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider text-indigo-700 truncate">
            SLA Prazo
          </span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-indigo-100/90 text-indigo-700 shadow-2xs shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="text-lg sm:text-2xl font-extrabold tabular-nums text-slate-900">
          {stats.taxaSlaNoPrazo}%
        </div>
        <div className="hidden sm:block w-full bg-slate-200/70 h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              stats.taxaSlaNoPrazo >= 90
                ? 'bg-emerald-500'
                : stats.taxaSlaNoPrazo >= 75
                ? 'bg-amber-500'
                : 'bg-rose-500'
            }`}
            style={{ width: `${stats.taxaSlaNoPrazo}%` }}
          ></div>
        </div>
      </div>

      {/* 6. Volume de Seriais & Tempo Médio */}
      <div className="p-2.5 sm:p-3.5 rounded-2xl border border-white/85 figma-glass-surface backdrop-blur-xl text-sm relative overflow-hidden min-w-0">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-slate-500 to-cyan-600 opacity-75" />
        <div className="flex items-center justify-between text-slate-500 mb-1 sm:mb-2 gap-1">
          <span className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-700 truncate">
            Total UIIs
          </span>
          <div className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-slate-100 text-slate-700 shadow-2xs shrink-0">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg sm:text-2xl font-extrabold tabular-nums text-slate-900">{stats.totalSeriais}</span>
          <span className="hidden sm:inline text-xs text-slate-500 font-medium">seriais</span>
        </div>
        <div className="hidden sm:flex text-[11px] text-slate-500 mt-1 items-center gap-1 truncate">
          <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />
          <span className="truncate">Média: {stats.tempoMedioAtendimentoMin} min</span>
        </div>
      </div>
    </div>
  );
};
