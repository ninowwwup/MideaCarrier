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
        className={`text-left p-3.5 rounded-2xl border transition-all text-sm relative overflow-hidden group active:scale-[0.98] active:translate-y-0.5 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,12,32,0.35)] hover:shadow-[0_16px_36px_rgba(0,38,100,0.45)] ${
          activeStatusFilter === 'pendente'
            ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/60 shadow-amber-500/20'
            : 'bg-white/95 border-white/80 hover:border-amber-300 hover:bg-white'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Fila FIFO (Pendente)
          </span>
          <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
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
        className={`text-left p-3.5 rounded-2xl border transition-all text-sm relative overflow-hidden group active:scale-[0.98] active:translate-y-0.5 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,12,32,0.35)] hover:shadow-[0_16px_36px_rgba(0,38,100,0.45)] ${
          activeStatusFilter === 'em_analise'
            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400/60 shadow-blue-500/20'
            : 'bg-white/95 border-white/80 hover:border-blue-300 hover:bg-white'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#00609C]">
            Em Validação SAP
          </span>
          <div className="p-1.5 rounded-lg bg-blue-100 text-[#00609C]">
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 group-hover:text-[#00609C] transition-colors">
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
        className={`text-left p-3.5 rounded-2xl border transition-all text-sm relative overflow-hidden group active:scale-[0.98] active:translate-y-0.5 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,12,32,0.35)] hover:shadow-[0_16px_36px_rgba(0,38,100,0.45)] ${
          activeStatusFilter === 'concluido'
            ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/60 shadow-emerald-500/20'
            : 'bg-white/95 border-white/80 hover:border-emerald-300 hover:bg-white'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Concluído no SAP
          </span>
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
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
        className={`text-left p-3.5 rounded-2xl border transition-all text-sm relative overflow-hidden group active:scale-[0.98] active:translate-y-0.5 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,12,32,0.35)] hover:shadow-[0_16px_36px_rgba(0,38,100,0.45)] ${
          activeStatusFilter === 'divergencia'
            ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/60 shadow-rose-500/20'
            : 'bg-white/95 border-white/80 hover:border-rose-300 hover:bg-white'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            Divergências / Erros
          </span>
          <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
            <AlertOctagon className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 group-hover:text-rose-700 transition-colors">
          {stats.divergencias}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Requer ajuste do time Buiatte
        </p>
      </button>

      {/* 5. SLA Compliance */}
      <div className="p-3.5 rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,12,32,0.35)] text-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            SLA no Prazo
          </span>
          <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {stats.taxaSlaNoPrazo}%
        </div>
        <div className="w-full bg-slate-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
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
      <div className="p-3.5 rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,12,32,0.35)] text-sm">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Volume & Média
          </span>
          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-slate-900">{stats.totalSeriais}</span>
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
