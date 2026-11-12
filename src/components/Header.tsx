import React from 'react';
import {
  PlusCircle,
  FileSpreadsheet,
  Layers,
  Users,
  Sparkles,
  BellRing,
  Menu,
  Radio,
  Bell,
  ShieldCheck,
  Compass,
  Database,
  ClipboardList,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { TeamRole } from '../types/transfer';
import { AuthUser } from '../types/auth';
import { PWAInstallButton } from './PWAInstallButton';
import { MigouLogo } from './MigouLogo';
import { AlertSoundType, ALERT_SOUND_OPTIONS, getSavedAlertSound } from '../utils/audioAlert';

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
  currentAlertSound?: AlertSoundType;
  onOpenSoundSelector?: () => void;
  desktopNotifPermission: string;
  onRequestDesktopPermission: () => void;
  isPushSubscribed: boolean;
  onEnablePushManager: () => void;
  onTestPush: () => void;
  autoPurgedCount?: number;
  isCloudConnected: boolean;
  onOpenDatabaseDiagnostic?: () => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  activeMainTab?: 'operacao' | 'consulta_iq09' | 'guia_depositos';
  onSelectMainTab?: (tab: 'operacao' | 'consulta_iq09' | 'guia_depositos') => void;
  iq09TotalItems?: number;
  iq09UpdatedAt?: string | null;
  onOpenMobileSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
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
  onTestAlertSound,
  currentAlertSound,
  onOpenSoundSelector,
  isPushSubscribed,
  onEnablePushManager,
  onTestPush,
  isCloudConnected,
  onOpenDatabaseDiagnostic,
  currentUser,
  activeMainTab = 'operacao',
  onSelectMainTab,
  iq09TotalItems = 0,
  iq09UpdatedAt = null,
  onOpenMobileSidebar,
  isSidebarCollapsed = false,
  onToggleSidebarCollapse,
}) => {
  const activeSound =
    ALERT_SOUND_OPTIONS.find((s) => s.id === (currentAlertSound || getSavedAlertSound())) ||
    ALERT_SOUND_OPTIONS[0];

  const moduleMeta = {
    operacao: {
      title: 'Fila de Solicitações & Operação SAP',
      subtitle: 'Movimentação MIGO 311 • De-Para Automático IQ09 em Tempo Real',
      icon: ClipboardList,
      badgeText: 'MIGO 311',
      badgeColor: 'from-cyan-300/95 to-sky-400/95 text-slate-950',
    },
    consulta_iq09: {
      title: 'Central Base IQ09 & Validador De-Para',
      subtitle: 'Consulta Instantânea de Estoque e Seriais SAP (UII = Serial)',
      icon: Database,
      badgeText: 'UII = SERIAL',
      badgeColor: 'from-emerald-300/95 to-teal-400/95 text-slate-950',
    },
    guia_depositos: {
      title: 'Guia Interativo de Depósitos & Regras SAP',
      subtitle: 'Rotas Oficiais B179/B170 • Livre, Contagem, Faltas e Avarias',
      icon: Compass,
      badgeText: 'REGRAS SAP',
      badgeColor: 'from-amber-300/95 to-orange-400/95 text-slate-950',
    },
  }[activeMainTab];

  const ActiveModuleIcon = moduleMeta.icon;

  return (
    <header className="bg-slate-950/25 backdrop-blur-2xl border-b border-white/20 sticky top-0 z-30 shadow-[0_6px_24px_rgba(0,0,0,0.14)] transition-all">
      <div className="max-w-[1680px] mx-auto px-2.5 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between py-2.5 gap-2.5">
          {/* Esquerda: Botão Menu Mobile / Toggle Sidebar + Contexto do Módulo Ativo */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Botão Hamburger Mobile (< lg) */}
            {onOpenMobileSidebar && (
              <button
                type="button"
                onClick={onOpenMobileSidebar}
                className="lg:hidden p-2 rounded-xl border border-white/25 bg-white/15 text-white hover:bg-white/25 active:scale-95 transition-all cursor-pointer shrink-0 shadow-xs"
                title="Abrir Menu Lateral MIGOU"
                aria-label="Abrir Menu Lateral"
              >
                <Menu className="w-5 h-5 text-cyan-200" />
              </button>
            )}

            {/* Toggle rápido da Sidebar no Desktop (opcional para quem gosta de atalho no topo) */}
            {onToggleSidebarCollapse && (
              <button
                type="button"
                onClick={onToggleSidebarCollapse}
                className="hidden lg:flex p-2 rounded-xl border border-white/20 bg-white/10 text-white/80 hover:text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer shrink-0"
                title={isSidebarCollapsed ? 'Expandir Menu Lateral' : 'Recolher Menu Lateral'}
                aria-label="Alternar Menu Lateral"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 text-cyan-300" />
                ) : (
                  <PanelLeftClose className="w-4 h-4 text-white/80" />
                )}
              </button>
            )}

            {/* Logo Mobile (< lg) */}
            <div className="lg:hidden shrink-0">
              <MigouLogo
                size="sm"
                animated={false}
                onClick={() => onSelectMainTab && onSelectMainTab('operacao')}
              />
            </div>

            {/* Título Contextual da Tela Ativa */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ActiveModuleIcon className="w-4 h-4 text-cyan-300 hidden sm:block shrink-0" />
                <h1 className="font-extrabold text-sm sm:text-base lg:text-lg tracking-tight text-white truncate drop-shadow-xs">
                  {moduleMeta.title}
                </h1>
                <span
                  className={`hidden md:inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r ${moduleMeta.badgeColor} border border-white/40 shadow-2xs shrink-0`}
                >
                  {moduleMeta.badgeText}
                </span>

                {/* Pill Status IQ09 em Tempo Real */}
                {iq09TotalItems > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectMainTab &&
                      onSelectMainTab(activeMainTab === 'consulta_iq09' ? 'operacao' : 'consulta_iq09')
                    }
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 hover:bg-emerald-400/35 border border-emerald-300/50 text-emerald-100 text-[11px] font-bold transition-all cursor-pointer shadow-2xs shrink-0"
                    title={
                      iq09UpdatedAt
                        ? `Base IQ09 atualizada em ${new Date(iq09UpdatedAt).toLocaleString('pt-BR')} — Clique para alternar`
                        : 'Base IQ09 ativa — Clique para consultar'
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    <span>IQ09: {iq09TotalItems.toLocaleString('pt-BR')} UIIs</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectMainTab && onSelectMainTab('consulta_iq09')}
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white/80 text-[10px] font-semibold transition-all cursor-pointer shrink-0"
                    title="Clique para importar a planilha IQ09 do SAP"
                  >
                    <Database className="w-3 h-3 text-cyan-300" />
                    <span>Importar IQ09</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-cyan-50/80 font-medium truncate hidden sm:block">
                {moduleMeta.subtitle}
              </p>
            </div>
          </div>

          {/* Centro-Direita: Seletor Rápido de Visão (Desktop XL+) */}
          <div className="hidden 2xl:flex items-center bg-black/25 backdrop-blur-xl p-1 rounded-xl border border-white/20 shadow-inner gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onSelectRole('ambos')}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200 active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                currentRole === 'ambos'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-white/80 hover:text-white hover:bg-white/10 font-medium'
              }`}
              title="Espelho Geral: Visualizar todas as solicitações de todos os centros"
            >
              <Layers className={`w-3.5 h-3.5 ${currentRole === 'ambos' ? 'text-blue-600' : 'text-white/80'}`} />
              <span>Espelho Geral</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('buiatte')}
              className={`relative px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200 active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                currentRole === 'buiatte'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-white/80 hover:text-white hover:bg-white/10 font-medium'
              }`}
              title="Visão Time Buiatte (WMS Sênior - Solicitações e Divergências)"
            >
              <Users className={`w-3.5 h-3.5 ${currentRole === 'buiatte' ? 'text-blue-600' : 'text-white/80'}`} />
              <span>Time Buiatte</span>
              {totalErrors > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('midea')}
              className={`relative px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200 active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                currentRole === 'midea'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-white/80 hover:text-white hover:bg-white/10 font-medium'
              }`}
              title="Visão Time Midea (SAP MIGO - Fila FIFO e Atendimento)"
            >
              <Sparkles className={`w-3.5 h-3.5 ${currentRole === 'midea' ? 'text-blue-600' : 'text-white/80'}`} />
              <span>Time Midea</span>
              {totalPending > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-400 text-amber-950 font-black">
                  {totalPending}
                </span>
              )}
            </button>
          </div>

          {/* Direita: CTAs de Ação Rápida + Ferramentas de Sistema */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Botão Colar Tabela */}
            <button
              type="button"
              onClick={onOpenBatchPaste}
              className="hidden md:flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/30 backdrop-blur-md shadow-xs hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              title="Colar tabela do Excel ou mensagem do WhatsApp diretamente (Atalho: V)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-200 shrink-0" />
              <span>Colar Tabela</span>
              <kbd className="hidden xl:inline-block px-1 py-0.2 text-[9px] font-mono bg-white/20 text-white rounded border border-white/30">
                V
              </kbd>
            </button>

            {/* Botão Nova Solicitação */}
            <button
              type="button"
              onClick={onOpenNewModal}
              className="flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-extrabold text-slate-900 bg-white hover:bg-white/95 border border-white/80 shadow-[0_4px_15px_rgba(0,0,0,0.15)] hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer whitespace-nowrap group"
              title="Nova Solicitação com múltiplos seriais (Atalho: N)"
            >
              <PlusCircle className="w-4 h-4 text-blue-600 group-hover:rotate-90 transition-transform duration-300 shrink-0" />
              <span className="hidden sm:inline">Nova Solicitação</span>
              <span className="sm:hidden">Nova</span>
              <kbd className="hidden xl:inline-block px-1 py-0.2 text-[9px] font-mono bg-slate-100 text-slate-700 rounded border border-slate-300">
                N
              </kbd>
            </button>

            <div className="h-5 w-px bg-white/20 hidden sm:block mx-0.5" />

            {/* Diagnóstico Nuvem (Admin Midea) */}
            {currentUser?.role !== 'buiatte' && onOpenDatabaseDiagnostic && (
              <button
                type="button"
                onClick={onOpenDatabaseDiagnostic}
                className={`p-2 rounded-xl text-xs font-semibold border backdrop-blur-md shadow-xs flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 active:scale-90 cursor-pointer ${
                  isCloudConnected
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30'
                    : 'bg-white/15 text-white border-white/25 hover:bg-white/25'
                }`}
                title={
                  isCloudConnected
                    ? 'Nuvem Conectada em Tempo Real (Clique para ver Diagnóstico)'
                    : 'Sincronização em Tempo Real Ativa (Clique para ver Diagnóstico)'
                }
                aria-label="Diagnóstico do Banco de Dados"
              >
                <Radio className="w-4 h-4 text-emerald-300 animate-pulse" />
              </button>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Alerta Sonoro Personalizável */}
            <button
              type="button"
              onClick={onOpenSoundSelector || onTestAlertSound}
              className="p-2 sm:px-2.5 sm:py-2 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs flex items-center gap-1 cursor-pointer"
              title={`Som de Alerta Ativo: ${activeSound.name} • Clique para alterar`}
              aria-label={`Som de Alerta Ativo: ${activeSound.name}`}
            >
              <span className="text-sm shrink-0">{activeSound.icon}</span>
              <span className="hidden lg:inline text-[11px] text-cyan-100 font-medium truncate max-w-[75px]">
                {activeSound.shortName}
              </span>
            </button>

            {/* Push Manager */}
            {isPushSubscribed ? (
              <button
                type="button"
                onClick={onTestPush}
                className="p-2 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs cursor-pointer"
                title="Push Manager Ativo! Clique para testar notificação nativa"
                aria-label="Testar Notificação Push"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnablePushManager}
                className="p-2 rounded-xl text-xs font-semibold text-white bg-amber-500/30 hover:bg-amber-500/40 border border-amber-300/50 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs animate-pulse cursor-pointer"
                title="Ativar Service Worker Push Manager para receber notificações em segundo plano"
                aria-label="Ativar Push Manager"
              >
                <Bell className="w-4 h-4 text-amber-200" />
              </button>
            )}

            {/* Sino de Alertas Time Midea */}
            <button
              type="button"
              onClick={onOpenLatestAlert}
              className="relative p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs cursor-pointer"
              title="Focar solicitações pendentes do Time Midea"
              aria-label="Ver solicitações pendentes"
            >
              <BellRing
                className={`w-4 h-4 ${
                  latestAlertCount > 0 ? 'animate-bounce text-amber-300' : 'text-white/80'
                }`}
              />
              {latestAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white shadow-xs">
                  {latestAlertCount}
                </span>
              )}
            </button>

            {/* Exportar Excel */}
            <button
              type="button"
              onClick={onExportCSV}
              className="hidden sm:flex p-2 rounded-xl text-white bg-white/15 hover:bg-white/25 border border-white/25 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-90 shadow-xs group cursor-pointer"
              title="Baixar base completa em formato Excel / CSV para indicadores"
              aria-label="Baixar planilha Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300 group-hover:scale-110 transition-transform duration-200" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
