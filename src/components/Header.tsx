import React, { useState } from 'react';
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
  VolumeX,
  Menu,
  X,
  CalendarCheck2
} from 'lucide-react';
import { TeamRole } from '../types/transfer';
import { PWAInstallButton } from './PWAInstallButton';

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
  autoPurgedCount?: number;
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
  autoPurgedCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs backdrop-blur-md bg-white/95">
      {/* Top Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-3">
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-[#00609C] via-[#0083CA] to-blue-400 flex items-center justify-center text-white shadow-md ring-2 ring-blue-100 transition-transform active:scale-95 cursor-pointer">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-[#00609C]">
                  Midea <span className="font-normal text-slate-500">Carrier</span>
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#0083CA] border border-blue-200 shadow-2xs">
                  SAP Hub
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium hidden sm:block">
                Sincronização Time Buiatte (WMS) ⟷ Time Midea (SAP)
              </p>
            </div>
          </div>

          {/* Perspective Selector (Desktop) */}
          <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/90 shadow-2xs">
            <button
              type="button"
              onClick={() => onSelectRole('ambos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-95 ${
                currentRole === 'ambos'
                  ? 'bg-white text-slate-900 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Espelho Geral</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('buiatte')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-95 ${
                currentRole === 'buiatte'
                  ? 'bg-[#0083CA] text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Time Buiatte</span>
              {totalErrors > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('midea')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-95 ${
                currentRole === 'midea'
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Time Midea</span>
              {totalPending > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-amber-950 font-bold">
                  {totalPending}
                </span>
              )}
            </button>
          </div>

          {/* Quick Tools & PWA */}
          <div className="flex items-center gap-2">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Som Toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              className={`p-2 rounded-xl border transition-all active:scale-90 ${
                isSoundEnabled
                  ? 'bg-blue-50 text-[#00609C] border-blue-200 hover:bg-blue-100 shadow-2xs'
                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
              }`}
              title={isSoundEnabled ? 'Som de alerta ativado (Clique para mutar)' : 'Som de alerta desativado'}
            >
              {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Sino de Alertas Time Midea */}
            <button
              type="button"
              onClick={onOpenLatestAlert}
              className="relative p-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-all active:scale-90 shadow-2xs"
              title="Ver alertas em tempo real estilo Outlook"
            >
              <BellRing className={`w-4 h-4 ${latestAlertCount > 0 ? 'animate-bounce text-amber-600' : 'text-slate-600'}`} />
              {latestAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-xs">
                  {latestAlertCount}
                </span>
              )}
            </button>

            {/* Baixar CSV (Desktop) */}
            <button
              type="button"
              onClick={onExportCSV}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition-all active:scale-95 shadow-2xs"
              title="Baixar base completa em formato CSV para Excel e indicadores"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Baixar CSV</span>
            </button>

            {/* Menu Mobile Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Expanded Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-200 space-y-3 animate-in fade-in duration-150">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              Alternar Modo de Visualização
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectRole('ambos');
                  setMobileMenuOpen(false);
                }}
                className={`py-2 text-xs rounded-lg font-bold border transition-colors ${
                  currentRole === 'ambos'
                    ? 'bg-blue-50 text-[#00609C] border-blue-300'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                Espelho Geral
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectRole('buiatte');
                  setMobileMenuOpen(false);
                }}
                className={`py-2 text-xs rounded-lg font-bold border transition-colors ${
                  currentRole === 'buiatte'
                    ? 'bg-[#0083CA] text-white border-transparent'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                Time Buiatte
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectRole('midea');
                  setMobileMenuOpen(false);
                }}
                className={`py-2 text-xs rounded-lg font-bold border transition-colors ${
                  currentRole === 'midea'
                    ? 'bg-slate-900 text-white border-transparent'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                Time Midea
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onExportCSV();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Exportar Base em CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* HERO ACTION BAR: Botões Maiores, Destaque Profissional & Efeito de Teclas */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0B2545] to-[#00609C] text-white px-4 sm:px-6 lg:px-8 py-3 shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Info & Auto-limpeza status */}
          <div className="flex items-center gap-2.5 text-xs text-blue-100/90 text-center sm:text-left">
            <span className="p-1 rounded-md bg-white/10 hidden sm:inline-block">
              <CalendarCheck2 className="w-4 h-4 text-emerald-400" />
            </span>
            <span>
              <strong>Histórico Mensal Ativo:</strong> Sistema com auto-limpeza automática mensal de 30 dias para performance e leveza.
            </span>
          </div>

          {/* BOTÕES PRINCIPAIS MAIORES COM EFEITO DE TECLA */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* BOTÃO COLAR TABELA (MAIOR, ELEGANTE & TÁTIL) */}
            <button
              type="button"
              onClick={onOpenBatchPaste}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-white/15 hover:bg-white/25 border border-white/30 backdrop-blur-sm transition-all duration-150 active:translate-y-0.5 active:scale-95 shadow-md hover:shadow-lg group"
              title="Colar tabela do Excel ou mensagem do WhatsApp diretamente (Atalho: V)"
            >
              <FileSpreadsheet className="w-4 h-4 text-cyan-300 group-hover:scale-110 transition-transform" />
              <span>COLAR TABELA</span>
              <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-black/25 text-blue-100 rounded border border-white/20">
                V
              </kbd>
            </button>

            {/* BOTÃO NOVA SOLICITAÇÃO (HERO EM DESTAQUE, MAIOR & TÁTIL) */}
            <button
              type="button"
              onClick={onOpenNewModal}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-[#0B2545] bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 hover:from-amber-200 hover:to-amber-300 border-2 border-yellow-200 transition-all duration-150 active:translate-y-0.5 active:scale-95 shadow-lg hover:shadow-amber-400/25 group"
              title="Nova Solicitação com múltiplos seriais (Atalho: N)"
            >
              <PlusCircle className="w-5 h-5 text-[#0B2545] group-hover:rotate-90 transition-transform duration-200" />
              <span>NOVA SOLICITAÇÃO</span>
              <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-black/15 text-slate-900 rounded border border-black/20">
                N
              </kbd>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
