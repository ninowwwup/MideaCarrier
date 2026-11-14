import React from 'react';
import {
  PlusCircle,
  FileSpreadsheet,
  BellRing,
  Radio,
  Bell,
  ShieldCheck,
  Compass,
  Database,
  ClipboardList,
  BarChart3,
  Menu,
} from 'lucide-react';
import { AuthUser } from '../types/auth';
import { PWAInstallButton } from './PWAInstallButton';
import { AlertSoundType, ALERT_SOUND_OPTIONS, getSavedAlertSound } from '../utils/audioAlert';
import { MainTabType } from './Sidebar';

interface HeaderProps {
  onOpenNewModal: () => void;
  onOpenBatchPaste: () => void;
  onExportCSV: () => void;
  latestAlertCount: number;
  onOpenLatestAlert: () => void;
  onTestAlertSound: () => void;
  currentAlertSound?: AlertSoundType;
  onOpenSoundSelector?: () => void;
  isPushSubscribed: boolean;
  onEnablePushManager: () => void;
  onTestPush: () => void;
  isCloudConnected: boolean;
  onOpenDatabaseDiagnostic?: () => void;
  currentUser?: AuthUser | null;
  activeMainTab?: MainTabType;
  onSelectMainTab?: (tab: MainTabType) => void;
  iq09TotalItems?: number;
  iq09UpdatedAt?: string | null;
  onOpenMobileDrawer?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewModal,
  onOpenBatchPaste,
  onExportCSV,
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
  onOpenMobileDrawer,
}) => {
  const activeSound =
    ALERT_SOUND_OPTIONS.find((s) => s.id === (currentAlertSound || getSavedAlertSound())) ||
    ALERT_SOUND_OPTIONS[0];

  const moduleMeta = {
    operacao: {
      title: 'Fila de Solicitações & Operação SAP',
      subtitle: 'Movimentação MIGO 311 • Batimento Automático IQ09 & Trava Sênior WMS',
      icon: ClipboardList,
    },
    consulta_iq09: {
      title: 'Central 2º WMS: Base IQ09 SAP & Batimento Sênior WMS',
      subtitle: 'Trava Breaker B111 • Consulta Unificada SAP (UII) ⟷ Sênior WMS (Lote/Local)',
      icon: Database,
    },
    dashboard_executivo: {
      title: 'Dashboard Executivo: Batimento SAP ⟷ Sênior WMS',
      subtitle: 'Análise de Acuracidade • Matriz De-Para de Depósitos • Gargalos Operacionais e Planos de Ação',
      icon: BarChart3,
    },
    guia_depositos: {
      title: 'Guia de Depósitos & Regras SAP',
      subtitle: 'Rotas Oficiais B179/B170 • Livre, Contagem, Faltas e Avarias',
      icon: Compass,
    },
  }[activeMainTab];

  const ActiveModuleIcon = moduleMeta.icon;

  const shortMobileTitle = {
    operacao: 'Fila & Operação SAP',
    consulta_iq09: 'Base IQ09 & WMS',
    dashboard_executivo: 'Dashboard Estoque',
    guia_depositos: 'Guia de Depósitos',
  }[activeMainTab];

  return (
    <header className="bg-[#081b42]/95 backdrop-blur-xl border-b border-white/15 sticky top-0 z-30 w-full max-w-full overflow-x-hidden">
      {/* =====================================================================
          1. MOBILE / PWA APPBAR (FLUTTER MATERIAL 3 SHELL - < lg)
          Zero estouro de ícones: cabe perfeitamente em telas de 320px a 430px
         ===================================================================== */}
      <div className="flex lg:hidden items-center justify-between gap-2 px-3 py-2.5 w-full max-w-full">
        {/* Esquerda: Botão Gaveta + Título Enxuto do Módulo */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onOpenMobileDrawer && (
            <button
              type="button"
              onClick={onOpenMobileDrawer}
              className="relative p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 cursor-pointer shrink-0 active:scale-95 transition-transform"
              title="Abrir Menu de Módulos e Utilitários PWA"
              aria-label="Abrir Menu"
            >
              <Menu className="w-4 h-4 text-cyan-200" />
              <span
                className={`w-2 h-2 rounded-full absolute top-1.5 right-1.5 ${
                  isCloudConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <ActiveModuleIcon className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span className="font-extrabold text-xs tracking-tight text-white truncate">
                {shortMobileTitle}
              </span>
              {iq09TotalItems > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 font-mono font-extrabold text-[9px] shrink-0">
                  IQ09 OK
                </span>
              )}
            </div>
            <p className="text-[10px] text-cyan-100/75 truncate">
              {currentUser ? `${currentUser.displayName} • ` : ''}
              {isCloudConnected ? 'Nuvem Ativa' : 'Modo Local'}
            </p>
          </div>
        </div>

        {/* Direita: Ações Essenciais Compactas (Sem Estouro de Grid) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenBatchPaste}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 shrink-0 active:scale-95 transition-all cursor-pointer"
            title="Colar Tabela (Excel / WhatsApp)"
          >
            <FileSpreadsheet className="w-4 h-4 text-cyan-200" />
          </button>

          <button
            type="button"
            onClick={onOpenNewModal}
            className="px-2.5 py-2 rounded-xl text-xs font-extrabold text-slate-900 bg-white hover:bg-slate-100 border border-white flex items-center gap-1 shadow-xs shrink-0 active:scale-95 transition-all cursor-pointer"
            title="Nova Solicitação MIGO 311"
          >
            <PlusCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Solicitar</span>
          </button>

          <button
            type="button"
            onClick={onOpenLatestAlert}
            className="relative p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 transition-colors shrink-0 active:scale-95 cursor-pointer"
            title="Focar solicitações pendentes"
          >
            <BellRing className={`w-4 h-4 ${latestAlertCount > 0 ? 'text-amber-300' : 'text-white/80'}`} />
            {latestAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white">
                {latestAlertCount > 99 ? '99+' : latestAlertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. DESKTOP TOPBAR CORPORATIVA (lg+) - LAYOUT ORIGINAL PRESERVADO
         ===================================================================== */}
      <div className="hidden lg:block max-w-[1680px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between py-2.5 gap-2 sm:gap-3">
          {/* Esquerda: Título da Tela Ativa + Indicador da Base IQ09 */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <ActiveModuleIcon className="w-4 h-4 text-cyan-300 shrink-0" />
                <h1 className="font-extrabold text-xs sm:text-base tracking-tight text-white truncate">
                  {moduleMeta.title}
                </h1>

                {iq09TotalItems > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectMainTab &&
                      onSelectMainTab(activeMainTab === 'consulta_iq09' ? 'operacao' : 'consulta_iq09')
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                    title={
                      iq09UpdatedAt
                        ? `Base IQ09 atualizada em ${new Date(iq09UpdatedAt).toLocaleString('pt-BR')}`
                        : 'Base IQ09 ativa'
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                    <span>IQ09: {iq09TotalItems.toLocaleString('pt-BR')} UIIs</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectMainTab && onSelectMainTab('consulta_iq09')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
                    title="Clique para importar a planilha IQ09 do SAP"
                  >
                    <Database className="w-3 h-3 text-cyan-300" />
                    <span>Importar IQ09</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onSelectMainTab && onSelectMainTab('consulta_iq09')}
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/25 hover:bg-indigo-500/35 border border-indigo-300/40 text-indigo-100 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                  title="Trava Breaker Sênior WMS x SAP ativa — Clique para abrir a Central 2º WMS e importar o Batimento de Estoque"
                >
                  <ShieldCheck className="w-3 h-3 text-indigo-300" />
                  <span>Trava Sênior WMS</span>
                </button>
              </div>
              <p className="hidden sm:block text-[11px] text-cyan-100/75 font-medium truncate">
                {moduleMeta.subtitle}
              </p>
            </div>
          </div>

          {/* Direita: Ações Rápidas + Utilitários */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            <button
              type="button"
              onClick={onOpenBatchPaste}
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/25 transition-colors cursor-pointer whitespace-nowrap"
              title="Colar tabela do Excel ou mensagem do WhatsApp diretamente (Atalho: V)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-200 shrink-0" />
              <span className="hidden sm:inline">Colar Tabela</span>
            </button>

            <button
              type="button"
              onClick={onOpenNewModal}
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-slate-900 bg-white hover:bg-slate-100 border border-white transition-colors cursor-pointer whitespace-nowrap"
              title="Nova Solicitação com múltiplos seriais (Atalho: N)"
            >
              <PlusCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Nova Solicitação</span>
            </button>

            <div className="hidden sm:block h-5 w-px bg-white/15 mx-0.5" />

            {currentUser?.role !== 'buiatte' && onOpenDatabaseDiagnostic && (
              <button
                type="button"
                onClick={onOpenDatabaseDiagnostic}
                className={`p-2 rounded-xl text-xs font-semibold border flex items-center justify-center transition-colors cursor-pointer ${
                  isCloudConnected
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30'
                    : 'bg-white/15 text-white border-white/25 hover:bg-white/25'
                }`}
                title="Diagnóstico do Banco de Dados e Google Planilhas"
                aria-label="Diagnóstico do Banco de Dados"
              >
                <Radio className="w-4 h-4 text-emerald-300" />
              </button>
            )}

            <PWAInstallButton />

            <button
              type="button"
              onClick={onOpenSoundSelector || onTestAlertSound}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/25 transition-colors flex items-center gap-1 cursor-pointer"
              title={`Som de Alerta Ativo: ${activeSound.name}`}
            >
              <span className="text-sm shrink-0">{activeSound.icon}</span>
              <span className="hidden xl:inline text-[11px] text-cyan-100 font-medium">
                {activeSound.shortName}
              </span>
            </button>

            {isPushSubscribed ? (
              <button
                type="button"
                onClick={onTestPush}
                className="p-2 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                title="Push Manager Ativo! Clique para testar notificação nativa"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnablePushManager}
                className="p-2 rounded-xl text-xs font-semibold text-white bg-amber-500/30 hover:bg-amber-500/40 border border-amber-300/50 transition-colors cursor-pointer"
                title="Ativar notificações em segundo plano"
              >
                <Bell className="w-4 h-4 text-amber-200" />
              </button>
            )}

            <button
              type="button"
              onClick={onOpenLatestAlert}
              className="relative p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 transition-colors cursor-pointer"
              title="Focar solicitações pendentes do Time Midea"
            >
              <BellRing className={`w-4 h-4 ${latestAlertCount > 0 ? 'text-amber-300' : 'text-white/80'}`} />
              {latestAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white">
                  {latestAlertCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onExportCSV}
              className="p-2 rounded-xl text-white bg-white/15 hover:bg-white/25 border border-white/25 transition-colors cursor-pointer"
              title="Baixar base completa em formato Excel / CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
