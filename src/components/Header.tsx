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
  Radio,
  CalendarCheck2,
  Droplets,
  Bell,
  ShieldCheck
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
  onTestAlertSound: () => void;
  desktopNotifPermission: string;
  onRequestDesktopPermission: () => void;
  isPushSubscribed: boolean;
  onEnablePushManager: () => void;
  onTestPush: () => void;
  autoPurgedCount?: number;
  isCloudConnected: boolean;
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
  onTestAlertSound,
  desktopNotifPermission,
  onRequestDesktopPermission,
  isPushSubscribed,
  onEnablePushManager,
  onTestPush,
  autoPurgedCount = 0,
  isCloudConnected,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white/85 backdrop-blur-xl border-b border-white/40 sticky top-0 z-30 shadow-md">
      {/* Top Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-3">
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-[#002363] via-[#002664] to-[#249ED5] flex items-center justify-center text-white shadow-md ring-2 ring-white/60 transition-transform active:scale-95 cursor-pointer">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl sm:text-2xl tracking-tight bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] bg-clip-text text-transparent">
                  MIGOU
                </span>
                <span className="text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-[#002664] text-white shadow-2xs">
                  SAP MIGO
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C2DEEB]/50 text-[#002664] border border-[#249ED5]/30 hidden sm:inline-block">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium hidden sm:block">
                Gestão de Transferências SAP & WMS • Time Buiatte ⟷ Time Midea
              </p>
            </div>
          </div>

          {/* Perspective Selector (Desktop) - Apenas Ícones com Tooltips */}
          <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs gap-0.5">
            <button
              type="button"
              onClick={() => onSelectRole('ambos')}
              className={`p-2 rounded-lg text-xs transition-all active:scale-95 ${
                currentRole === 'ambos'
                  ? 'bg-white text-[#002664] shadow-xs font-bold border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
              title="Espelho Geral: Visualizar todas as solicitações de todos os centros"
              aria-label="Espelho Geral"
            >
              <Layers className="w-4 h-4 text-[#249ED5]" />
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('buiatte')}
              className={`relative p-2 rounded-lg text-xs transition-all active:scale-95 ${
                currentRole === 'buiatte'
                  ? 'bg-[#249ED5] text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
              title="Visão Time Buiatte (WMS Sênior - Solicitações e Divergências)"
              aria-label="Time Buiatte"
            >
              <Users className="w-4 h-4" />
              {totalErrors > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('midea')}
              className={`relative p-2 rounded-lg text-xs transition-all active:scale-95 ${
                currentRole === 'midea'
                  ? 'bg-[#002664] text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
              title="Visão Time Midea (SAP MIGO - Fila FIFO e Atendimento)"
              aria-label="Time Midea"
            >
              <Sparkles className="w-4 h-4 text-[#C2DEEB]" />
              {totalPending > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] bg-amber-400 text-amber-950 font-bold shadow-xs">
                  {totalPending}
                </span>
              )}
            </button>
          </div>

          {/* Quick Tools & Indicators - Todos os Botões Apenas Ícones */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Status Indicativo Silencioso de Sincronização */}
            <div
              className={`p-2 rounded-xl text-xs font-bold border shadow-2xs select-none flex items-center justify-center ${
                isCloudConnected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-blue-50 text-[#002664] border-[#249ED5]/40'
              }`}
              title={isCloudConnected ? 'Conectado à nuvem Supabase em tempo real (In-time)' : 'Sincronização em tempo real ativa'}
            >
              <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
            </div>

            {/* PWA Install Button (Apenas Ícone) */}
            <PWAInstallButton />

            {/* Som Toggle & Teste de Gota d'Água (Apenas Ícones) */}
            <div className="flex items-center gap-0.5 bg-white/70 rounded-xl p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={onToggleSound}
                className={`p-2 rounded-lg border transition-all active:scale-90 ${
                  isSoundEnabled
                    ? 'bg-blue-50 text-[#002664] border-blue-200 hover:bg-blue-100 shadow-2xs'
                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                }`}
                title={isSoundEnabled ? 'Som de alerta ativado (Clique para mutar)' : 'Som de alerta desativado (Clique para ativar)'}
                aria-label="Alternar som de alerta"
              >
                {isSoundEnabled ? <Volume2 className="w-4 h-4 text-[#249ED5]" /> : <VolumeX className="w-4 h-4" />}
              </button>
              
              <button
                type="button"
                onClick={onTestAlertSound}
                className="p-2 rounded-lg text-[#002664] hover:bg-blue-50 transition-all active:scale-95"
                title="Testar som suave de gota d'água"
                aria-label="Testar som suave de gota d'água"
              >
                <Droplets className="w-4 h-4 text-[#249ED5]" />
              </button>
            </div>

            {/* Controle do Push Manager (Service Worker) - Apenas Ícone */}
            {isPushSubscribed ? (
              <button
                type="button"
                onClick={onTestPush}
                className="p-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-all active:scale-95 shadow-2xs"
                title="Push Manager Ativo! Clique para testar notificação nativa"
                aria-label="Testar Notificação Push"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnablePushManager}
                className="p-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 shadow-md transition-all active:scale-95 animate-pulse"
                title="Ativar Service Worker Push Manager para receber notificações em segundo plano"
                aria-label="Ativar Push Manager"
              >
                <Bell className="w-4 h-4" />
              </button>
            )}

            {/* Sino de Alertas Time Midea - Apenas Ícone */}
            <button
              type="button"
              onClick={onOpenLatestAlert}
              className="relative p-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-all active:scale-90 shadow-2xs"
              title="Ver alertas em tempo real estilo Outlook"
              aria-label="Ver alertas estilo Outlook"
            >
              <BellRing className={`w-4 h-4 ${latestAlertCount > 0 ? 'animate-bounce text-amber-600' : 'text-slate-600'}`} />
              {latestAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-xs">
                  {latestAlertCount}
                </span>
              )}
            </button>

            {/* Baixar Base em Excel - Apenas Ícone do Excel */}
            <button
              type="button"
              onClick={onExportCSV}
              className="p-2 rounded-xl text-emerald-800 bg-emerald-50/90 border border-emerald-300 hover:bg-emerald-100 transition-all active:scale-95 shadow-2xs group"
              title="Baixar base completa em formato Excel / CSV para indicadores"
              aria-label="Baixar planilha Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            </button>

            {/* Menu Mobile Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
              title="Menu de navegação"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
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
                    ? 'bg-blue-50 text-[#002664] border-[#249ED5]'
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
                    ? 'bg-[#249ED5] text-white border-transparent'
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
                    ? 'bg-[#002664] text-white border-transparent'
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
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Exportar Base em Excel (CSV)</span>
            </button>
          </div>
        )}
      </div>

      {/* HERO ACTION BAR: Paleta Imperial Blue (#002664 & #002363) com Blue Bell (#249ED5) */}
      <div className="bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white px-4 sm:px-6 lg:px-8 py-3 shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Info & Auto-limpeza status */}
          <div className="flex items-center gap-2.5 text-xs text-white/95 text-center sm:text-left">
            <span className="p-1 rounded-md bg-white/15 hidden sm:inline-block">
              <CalendarCheck2 className="w-4 h-4 text-[#C2DEEB]" />
            </span>
            <span>
              <strong>Sincronização em Tempo Real (In-time):</strong> Conexão ativa entre dispositivos com histórico mensal leve de 30 dias.
            </span>
          </div>

          {/* BOTÕES PRINCIPAIS MAIORES COM EFEITO DE TECLA */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* BOTÃO COLAR TABELA */}
            <button
              type="button"
              onClick={onOpenBatchPaste}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-white/20 hover:bg-white/30 border border-white/40 backdrop-blur-sm transition-all duration-150 active:translate-y-0.5 active:scale-95 shadow-md hover:shadow-lg group"
              title="Colar tabela do Excel ou mensagem do WhatsApp diretamente (Atalho: V)"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#C2DEEB] group-hover:scale-110 transition-transform" />
              <span>COLAR TABELA</span>
              <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-black/25 text-white rounded border border-white/20">
                V
              </kbd>
            </button>

            {/* BOTÃO NOVA SOLICITAÇÃO */}
            <button
              type="button"
              onClick={onOpenNewModal}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-[#002363] bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 hover:from-amber-200 hover:to-amber-300 border-2 border-yellow-200 transition-all duration-150 active:translate-y-0.5 active:scale-95 shadow-lg hover:shadow-amber-400/25 group"
              title="Nova Solicitação com múltiplos seriais (Atalho: N)"
            >
              <PlusCircle className="w-5 h-5 text-[#002363] group-hover:rotate-90 transition-transform duration-200" />
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
