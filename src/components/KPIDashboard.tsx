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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
      {/* 1. Pendentes (Fila FIFO) */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'pendente' ? 'todos' : 'pendente')}
        className={`text-left p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer ${
          activeStatusFilter === 'pendente'
            ? 'bg-amber-50/95 border-amber-300 ring-2 ring-amber-400/60 shadow-[0_12px_30px_rgba(245,158,11,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-amber-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
            Fila FIFO (Pendente)
          </span>
          <div className="p-1.5 rounded-xl bg-amber-100/90 text-amber-700 shadow-2xs">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-amber-700 transition-colors">
          {stats.pendentes}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
          <Timer className="w-3 h-3 text-amber-600" />
          <span>Mais antigo: {stats.maisAntigoPendenteMin} min</span>
        </div>
      </button>

      {/* 2. Em Análise SAP */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'em_analise' ? 'todos' : 'em_analise')}
        className={`text-left p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer ${
          activeStatusFilter === 'em_analise'
            ? 'bg-blue-50/95 border-blue-300 ring-2 ring-blue-400/60 shadow-[0_12px_30px_rgba(0,131,202,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-blue-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#00609C] to-[#38BDF8] opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#00609C]">
            Em Validação SAP
          </span>
          <div className="p-1.5 rounded-xl bg-blue-100/90 text-[#00609C] shadow-2xs">
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
          </div>
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-[#00609C] transition-colors">
          {stats.emAnalise}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Em processamento pelo time Midea
        </p>
      </button>

      {/* 3. Concluídos no SAP */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'concluido' ? 'todos' : 'concluido')}
        className={`text-left p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer ${
          activeStatusFilter === 'concluido'
            ? 'bg-emerald-50/95 border-emerald-300 ring-2 ring-emerald-400/60 shadow-[0_12px_30px_rgba(16,185,129,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-emerald-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
            Concluído no SAP
          </span>
          <div className="p-1.5 rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-emerald-700 transition-colors">
          {stats.concluidos}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Movimentação 311 efetuada
        </p>
      </button>

      {/* 4. Divergências / Erros */}
      <button
        type="button"
        onClick={() => onFilterByStatus(activeStatusFilter === 'divergencia' ? 'todos' : 'divergencia')}
        className={`text-left p-3.5 rounded-2xl border text-sm relative overflow-hidden group active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-xl cursor-pointer ${
          activeStatusFilter === 'divergencia'
            ? 'bg-rose-50/95 border-rose-300 ring-2 ring-rose-400/60 shadow-[0_12px_30px_rgba(244,63,94,0.22)]'
            : 'figma-glass-surface border-white/85 hover:border-rose-300 hover:bg-white'
        }`}
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-red-600 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700">
            Divergências / Erros
          </span>
          <div className="p-1.5 rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs">
            <AlertOctagon className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-slate-900 group-hover:text-rose-700 transition-colors">
          {stats.divergencias}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Requer ajuste do time Buiatte
        </p>
      </button>

      {/* 5. SLA Compliance */}
      <div className="p-3.5 rounded-2xl border border-white/85 figma-glass-surface backdrop-blur-xl text-sm relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 opacity-85" />
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
            SLA no Prazo
          </span>
          <div className="p-1.5 rounded-xl bg-indigo-100/90 text-indigo-700 shadow-2xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-slate-900">
          {stats.taxaSlaNoPrazo}%
        </div>
        <div className="w-full bg-slate-200/70 h-1.5 rounded-full mt-2 overflow-hidden">
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
      <div className="p-3.5 rounded-2xl border border-white/85 figma-glass-surface backdrop-blur-xl text-sm relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-slate-500 to-cyan-600 opacity-75" />
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
            Volume & Média
          </span>
          <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700 shadow-2xs">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-extrabold tabular-nums text-slate-900">{stats.totalSeriais}</span>
          <span className="text-xs text-slate-500 font-medium">seriais</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-600" />
          <span>Média: {stats.tempoMedioAtendimentoMin} min</span>
        </div>
      </div>
    </div>
  );
};
