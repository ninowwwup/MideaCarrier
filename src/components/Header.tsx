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
  onOpenDatabaseDiagnostic?: () => void;
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
  onOpenDatabaseDiagnostic,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white/10 backdrop-blur-2xl border-b border-white/20 sticky top-0 z-30 shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all">
      {/* Top Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-3">
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-white/20 border border-white/35 backdrop-blur-md flex items-center justify-center text-white shadow-md hover:scale-105 transition-all duration-200 cursor-pointer">
              <Boxes className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl sm:text-2xl tracking-tight text-white drop-shadow-sm">
                  MIGOU
                </span>
                <span className="text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30 backdrop-blur-md shadow-xs">
                  SAP MIGO
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-white/80 font-normal hidden sm:block">
                Gestão de Transferências SAP & WMS • Time Buiatte ⟷ Time Midea
              </p>
            </div>
          </div>

          {/* Perspective Selector (Desktop) - Estilo Segmented Control Figma */}
          <div className="hidden lg:flex items-center bg-black/20 backdrop-blur-xl p-1 rounded-2xl border border-white/20 shadow-inner gap-1">
            <button
              type="button"
              onClick={() => onSelectRole('ambos')}
              className={`px-3 py-1.5 rounded-xl text-xs transition-all duration-200 active:scale-95 flex items-center gap-1.5 ${
                currentRole === 'ambos'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/10 font-medium'
              }`}
              title="Espelho Geral: Visualizar todas as solicitações de todos os centros"
              aria-label="Espelho Geral"
            >
              <Layers className={`w-3.5 h-3.5 ${currentRole === 'ambos' ? 'text-blue-600' : 'text-white/80'}`} />
              <span>Espelho Geral</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('buiatte')}
              className={`relative px-3 py-1.5 rounded-xl text-xs transition-all duration-200 active:scale-95 flex items-center gap-1.5 ${
                currentRole === 'buiatte'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/10 font-medium'
              }`}
              title="Visão Time Buiatte (WMS Sênior - Solicitações e Divergências)"
              aria-label="Time Buiatte"
            >
              <Users className={`w-3.5 h-3.5 ${currentRole === 'buiatte' ? 'text-blue-600' : 'text-white/80'}`} />
              <span>Time Buiatte</span>
              {totalErrors > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('midea')}
              className={`relative px-3 py-1.5 rounded-xl text-xs transition-all duration-200 active:scale-95 flex items-center gap-1.5 ${
                currentRole === 'midea'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/10 font-medium'
              }`}
              title="Visão Time Midea (SAP MIGO - Fila FIFO e Atendimento)"
              aria-label="Time Midea"
            >
              <Sparkles className={`w-3.5 h-3.5 ${currentRole === 'midea' ? 'text-blue-600' : 'text-white/80'}`} />
              <span>Time Midea</span>
              {totalPending > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-400 text-amber-950 font-bold shadow-xs ml-0.5">
                  {totalPending}
                </span>
              )}
            </button>
          </div>

          {/* Quick Tools & Indicators - Botões Dinâmicos, Leves e Suaves (Figma Style) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Status Indicativo Silencioso / Diagnóstico Supabase & Nuvem */}
            <button
              type="button"
              onClick={onOpenDatabaseDiagnostic}
              className={`p-2.5 rounded-xl text-xs font-semibold border backdrop-blur-md shadow-xs flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 active:scale-90 ${
                isCloudConnected
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30'
                  : 'bg-white/15 text-white border-white/25 hover:bg-white/25'
              }`}
              title={
                isCloudConnected
                  ? 'Nuvem Conectada em Tempo Real (Clique para ver Diagnóstico e Script SQL do Supabase)'
                  : 'Sincronização em Tempo Real Ativa (Clique para ver Diagnóstico e Script SQL do Supabase)'
              }
              aria-label="Diagnóstico do Banco de Dados e Supabase"
            >
              <Radio className="w-4 h-4 text-emerald-300 animate-pulse" />
            </button>

            {/* PWA Install Button (Apenas Ícone) */}
            <PWAInstallButton />

            {/* Alerta Sonoro de Gota d'Água Ativo (Obrigatório) - Teste Imediato */}
            <button
              type="button"
              onClick={onTestAlertSound}
              className="p-2.5 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs flex items-center gap-1.5"
              title="Alerta Sonoro de Gota d'Água Ativo (Obrigatório) • Clique para testar o som"
              aria-label="Alerta Sonoro de Gota d'Água Ativo - Clique para testar"
            >
              <Droplets className="w-4 h-4 text-cyan-200 animate-pulse" />
              <span className="hidden sm:inline text-[11px] text-cyan-100 font-medium">Som Ativo</span>
            </button>

            {/* Controle do Push Manager (Service Worker) - Apenas Ícone */}
            {isPushSubscribed ? (
              <button
                type="button"
                onClick={onTestPush}
                className="p-2.5 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs"
                title="Push Manager Ativo! Clique para testar notificação nativa"
                aria-label="Testar Notificação Push"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnablePushManager}
                className="p-2.5 rounded-xl text-xs font-semibold text-white bg-amber-500/30 hover:bg-amber-500/40 border border-amber-300/50 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs animate-pulse"
                title="Ativar Service Worker Push Manager para receber notificações em segundo plano"
                aria-label="Ativar Push Manager"
              >
                <Bell className="w-4 h-4 text-amber-200" />
              </button>
            )}

            {/* Sino de Alertas Time Midea - Apenas Ícone */}
            <button
              type="button"
              onClick={onOpenLatestAlert}
              className="relative p-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs"
              title="Ver alertas em tempo real estilo Outlook"
              aria-label="Ver alertas estilo Outlook"
            >
              <BellRing className={`w-4 h-4 ${latestAlertCount > 0 ? 'animate-bounce text-amber-300' : 'text-white/80'}`} />
              {latestAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-xs">
                  {latestAlertCount}
                </span>
              )}
            </button>

            {/* Baixar Base em Excel - Apenas Ícone do Excel */}
            <button
              type="button"
              onClick={onExportCSV}
              className="p-2.5 rounded-xl text-white bg-white/15 hover:bg-white/25 border border-white/25 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs group"
              title="Baixar base completa em formato Excel / CSV para indicadores"
              aria-label="Baixar planilha Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300 group-hover:scale-110 transition-transform duration-200" />
            </button>

            {/* Menu Mobile Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2.5 rounded-xl border border-white/25 bg-white/15 text-white hover:bg-white/25 transition-all duration-200"
              title="Menu de navegação"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Expanded Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-white/15 space-y-3 animate-in fade-in duration-150">
            <div className="text-xs font-semibold text-white/70 uppercase tracking-wider px-1">
              Alternar Modo de Visualização
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectRole('ambos');
                  setMobileMenuOpen(false);
                }}
                className={`py-2 text-xs rounded-xl font-semibold border transition-all duration-200 ${
                  currentRole === 'ambos'
                    ? 'bg-white text-slate-900 border-white shadow-xs'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
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
                className={`py-2 text-xs rounded-xl font-semibold border transition-all duration-200 ${
                  currentRole === 'buiatte'
                    ? 'bg-white text-[#00609C] border-white shadow-xs'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
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
                className={`py-2 text-xs rounded-xl font-semibold border transition-all duration-200 ${
                  currentRole === 'midea'
                    ? 'bg-white text-[#002664] border-white shadow-xs'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
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
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl transition-all duration-200"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span>Exportar Base em Excel (CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onTestAlertSound();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl transition-all duration-200"
            >
              <Droplets className="w-4 h-4 text-cyan-200 animate-pulse" />
              <span>Testar Som de Gota d'Água (Ativo)</span>
            </button>

            {onOpenDatabaseDiagnostic && (
              <button
                type="button"
                onClick={() => {
                  onOpenDatabaseDiagnostic();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl transition-all duration-200"
              >
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Diagnóstico do Banco & Supabase</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* HERO ACTION BAR: Translucent Glass Integrado ao Gradiente */}
      <div className="bg-black/15 backdrop-blur-xl border-t border-white/10 border-b border-white/20 px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Info & Auto-limpeza status */}
          <div className="flex items-center gap-2.5 text-xs text-white/90 text-center sm:text-left font-medium">
            <span className="p-1 rounded-lg bg-white/15 border border-white/25 backdrop-blur-sm hidden sm:inline-block">
              <CalendarCheck2 className="w-4 h-4 text-[#C2DEEB]" />
            </span>
            <span>
              <strong className="text-white font-semibold">Sincronização em Tempo Real (In-time):</strong> Conexão ativa entre dispositivos com histórico de 30 dias.
            </span>
          </div>

          {/* BOTÕES DINÂMICOS, LEVES E SUAVES (ESTILO FIGMA) */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* BOTÃO COLAR TABELA */}
            <button
              type="button"
              onClick={onOpenBatchPaste}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-white bg-white/15 hover:bg-white/25 border border-white/30 backdrop-blur-md shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ease-out group"
              title="Colar tabela do Excel ou mensagem do WhatsApp diretamente (Atalho: V)"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#C2DEEB] group-hover:scale-110 transition-transform duration-200" />
              <span className="tracking-wide">COLAR TABELA</span>
              <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-white/20 text-white rounded border border-white/30">
                V
              </kbd>
            </button>

            {/* BOTÃO NOVA SOLICITAÇÃO */}
            <button
              type="button"
              onClick={onOpenNewModal}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 bg-white hover:bg-white/95 border border-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_25px_rgba(255,255,255,0.35)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ease-out group"
              title="Nova Solicitação com múltiplos seriais (Atalho: N)"
            >
              <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 group-hover:rotate-90 transition-transform duration-300" />
              <span className="tracking-wide">NOVA SOLICITAÇÃO</span>
              <kbd className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-700 rounded border border-slate-300">
                N
              </kbd>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
