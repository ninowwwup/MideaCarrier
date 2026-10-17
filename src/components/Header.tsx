import React from 'react';
import { 
  Boxes, 
  PlusCircle, 
  FileSpreadsheet, 
  Download, 
  Layers, 
  Users, 
  Sparkles,
  BellRing,
  Volume2,
  VolumeX
} from 'lucide-react';
import { TeamRole } from '../types/transfer';

interface HeaderProps {
  currentRole: TeamRole;
  onSelectRole: (role: TeamRole) => void;
  onOpenNewModal: () => void;
  onOpenBatchPaste: () => void;
  onExportCSV: () => void;
  totalPending: number;
  totalErrors: number;
  latestAlertCount: number;
  onOpenLatestAlert: () => void;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onSelectRole,
  onOpenNewModal,
  onOpenBatchPaste,
  onExportCSV,
  totalPending,
  totalErrors,
  latestAlertCount,
  onOpenLatestAlert,
  isSoundEnabled,
  onToggleSound,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner with Brand & Role Selector */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3.5 gap-3">
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#00609C] to-[#0083CA] flex items-center justify-center text-white shadow-sm ring-2 ring-blue-100">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-[#00609C]">
                  Midea <span className="font-normal text-slate-500">Carrier</span>
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#0083CA] border border-blue-200">
                  Transfer Hub SAP
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Sincronização Time Buiatte (Sênior WMS) ⟷ Time Midea (SAP)
              </p>
            </div>
          </div>

          {/* Perspective Selector (Espelho) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
            <button
              type="button"
              onClick={() => onSelectRole('ambos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentRole === 'ambos'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Espelho Geral</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('buiatte')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentRole === 'buiatte'
                  ? 'bg-[#0083CA] text-white shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Time Buiatte (WMS)</span>
              {totalErrors > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('midea')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentRole === 'midea'
                  ? 'bg-slate-900 text-white shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Time Midea (SAP)</span>
              {totalPending > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-amber-950 font-bold">
                  {totalPending}
                </span>
              )}
            </button>
          </div>

          {/* Action Buttons & Alert Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Som de Alerta Toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              className={`p-2 rounded-lg border transition-colors ${
                isSoundEnabled
                  ? 'bg-blue-50 text-[#00609C] border-blue-200 hover:bg-blue-100'
                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
              }`}
              title={isSoundEnabled ? 'Som de alerta ativado (Clique para mutar)' : 'Som de alerta desativado'}
            >
              {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Sino de Notificação / Último Alerta Time Midea */}
            <button
              type="button"
              onClick={onOpenLatestAlert}
              className="relative p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
              title="Ver último alerta de solicitação para o Time Midea"
            >
              <BellRing className={`w-4 h-4 ${latestAlertCount > 0 ? 'animate-bounce text-amber-600' : 'text-slate-500'}`} />
              {latestAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-xs">
                  {latestAlertCount}
                </span>
              )}
            </button>

            {/* Baixar CSV */}
            <button
              type="button"
              onClick={onExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
              title="Baixar base completa em formato CSV para Excel e indicadores"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Baixar CSV</span>
            </button>

            {/* Colar Tabela do Excel */}
            <button
              type="button"
              onClick={onOpenBatchPaste}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#00609C] bg-blue-50/80 border border-blue-200 hover:bg-blue-100 transition-colors shadow-2xs"
              title="Colar tabela do Excel ou mensagem do WhatsApp diretamente"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Colar Tabela</span>
            </button>

            {/* Nova Solicitação */}
            <button
              type="button"
              onClick={onOpenNewModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0083CA] hover:bg-[#0070b0] transition-colors shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nova Solicitação</span>
            </button>
          </div>
        </div>
      </div>

      {/* Role Context Bar */}
      <div className="bg-slate-50/70 border-t border-slate-200/60 py-1.5 px-4 sm:px-6 lg:px-8 text-xs text-slate-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentRole === 'buiatte' && (
            <span className="inline-flex items-center gap-1 text-[#00609C] font-semibold">
              <Users className="w-3.5 h-3.5" /> Modo Time Buiatte:
              <span className="font-normal text-slate-600">
                Cadastre solicitações com múltiplos seriais. O Time Midea receberá o alerta em pop-up instantaneamente.
              </span>
            </span>
          )}
          {currentRole === 'midea' && (
            <span className="inline-flex items-center gap-1 text-slate-900 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#0083CA]" /> Modo Time Midea:
              <span className="font-normal text-slate-600">
                Alertas pop-up em tempo real ativados. Copie em lote para o SAP (MIGO 311) e informe o Nº de Doc. Material.
              </span>
            </span>
          )}
          {currentRole === 'ambos' && (
            <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
              <Layers className="w-3.5 h-3.5 text-[#0083CA]" /> Espelho Geral Compartilhado:
              <span className="text-slate-500">
                Visualização sincronizada entre Time Buiatte e Time Midea com proteção de SLA e FIFO.
              </span>
            </span>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            SLA Meta: 120min
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            FIFO Ativo
          </span>
        </div>
      </div>
    </header>
  );
};
