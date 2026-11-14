import React from 'react';
import {
  ClipboardList,
  Database,
  Compass,
  Layers,
  Users,
  Sparkles,
  ShieldCheck,
  Truck,
  LogOut,
  BarChart3,
  PlusCircle,
  X,
  Bell,
  Volume2,
  FileSpreadsheet,
  Radio,
} from 'lucide-react';
import { TeamRole } from '../types/transfer';
import { AuthUser } from '../types/auth';
import { MigouLogo } from './MigouLogo';
import { PWAInstallButton } from './PWAInstallButton';

export type MainTabType = 'operacao' | 'consulta_iq09' | 'dashboard_executivo' | 'guia_depositos';

interface SidebarProps {
  activeMainTab: MainTabType;
  onSelectMainTab: (tab: MainTabType) => void;
  currentRole: TeamRole;
  onSelectRole: (role: TeamRole) => void;
  totalItemsCount: number;
  totalPending: number;
  totalErrors: number;
  iq09TotalItems: number;
  wmsTotalItems?: number;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  isMobileDrawerOpen?: boolean;
  onCloseMobileDrawer?: () => void;
  onOpenNewModal?: () => void;
  onOpenSoundSelector?: () => void;
  isPushSubscribed?: boolean;
  onEnablePushManager?: () => void;
  onTestPush?: () => void;
  onExportCSV?: () => void;
  isCloudConnected?: boolean;
  onOpenDatabaseDiagnostic?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeMainTab,
  onSelectMainTab,
  currentRole,
  onSelectRole,
  totalItemsCount,
  totalPending,
  totalErrors,
  iq09TotalItems,
  wmsTotalItems = 0,
  currentUser,
  onLogout,
  isMobileDrawerOpen = false,
  onCloseMobileDrawer,
  onOpenNewModal,
  onOpenSoundSelector,
  isPushSubscribed = false,
  onEnablePushManager,
  onTestPush,
  onExportCSV,
  isCloudConnected = false,
  onOpenDatabaseDiagnostic,
}) => {
  const handleSelectTab = (tab: MainTabType) => {
    onSelectMainTab(tab);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const handleSelectRoleInternal = (role: TeamRole) => {
    onSelectRole(role);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const renderNavigationContent = (isDrawer = false) => (
    <div className="h-full flex flex-col justify-between p-3">
      {/* Topo: Marca + Menu Principal + Visão */}
      <div className="space-y-5">
        {/* 1. Identidade MIGOU */}
        <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <MigouLogo
              size="sm"
              animated={false}
              onClick={() => handleSelectTab('operacao')}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">
                  MIGOU
                </span>
                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-cyan-400 text-slate-950">
                  SAP
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                Midea ⟷ Buiatte
              </p>
            </div>
          </div>

          {isDrawer && onCloseMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 2. Navegação Principal (Reduzida e Direta) */}
        <nav className="space-y-1" aria-label="Menu Principal">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Módulos
          </div>

          <button
            type="button"
            onClick={() => handleSelectTab('operacao')}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              activeMainTab === 'operacao'
                ? 'bg-white text-[#002664] shadow-xs'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <ClipboardList
                className={`w-4 h-4 shrink-0 ${
                  activeMainTab === 'operacao' ? 'text-[#00609C]' : 'text-cyan-300'
                }`}
              />
              <span className="truncate">Fila & Operação</span>
            </span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                activeMainTab === 'operacao'
                  ? 'bg-blue-100 text-[#002664]'
                  : 'bg-white/15 text-slate-200'
              }`}
            >
              {totalItemsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('consulta_iq09')}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              activeMainTab === 'consulta_iq09'
                ? 'bg-white text-[#002664] shadow-xs'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Database
                className={`w-4 h-4 shrink-0 ${
                  activeMainTab === 'consulta_iq09' ? 'text-emerald-600' : 'text-emerald-300'
                }`}
              />
              <span className="truncate">Base IQ09 SAP</span>
            </span>
            {iq09TotalItems > 0 && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                title={`Base IQ09 ativa (${iq09TotalItems.toLocaleString('pt-BR')} UIIs)`}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('dashboard_executivo')}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              activeMainTab === 'dashboard_executivo'
                ? 'bg-white text-[#002664] shadow-xs'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <BarChart3
                className={`w-4 h-4 shrink-0 ${
                  activeMainTab === 'dashboard_executivo' ? 'text-indigo-600' : 'text-indigo-300'
                }`}
              />
              <span className="truncate">Dashboard Estoque</span>
            </span>
            {wmsTotalItems > 0 && (
              <span
                className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"
                title={`Batimento Sênior WMS ativo (${wmsTotalItems.toLocaleString('pt-BR')} seriais)`}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('guia_depositos')}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              activeMainTab === 'guia_depositos'
                ? 'bg-white text-[#002664] shadow-xs'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Compass
                className={`w-4 h-4 shrink-0 ${
                  activeMainTab === 'guia_depositos' ? 'text-amber-600' : 'text-amber-300'
                }`}
              />
              <span className="truncate">Guia Depósitos</span>
            </span>
          </button>
        </nav>

        {/* 3. Perspectiva / Perfil de Operação */}
        <div className="space-y-1 pt-2 border-t border-white/10">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Visão da Fila
          </div>

          <button
            type="button"
            onClick={() => handleSelectRoleInternal('ambos')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
              currentRole === 'ambos'
                ? 'bg-cyan-500/20 text-cyan-200 font-bold border border-cyan-400/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white font-medium'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Layers className="w-3.5 h-3.5 shrink-0 text-cyan-300" />
              <span className="truncate">Espelho Geral</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectRoleInternal('buiatte')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
              currentRole === 'buiatte'
                ? 'bg-cyan-500/20 text-cyan-200 font-bold border border-cyan-400/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white font-medium'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Users className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
              <span className="truncate">Time Buiatte</span>
            </span>
            {totalErrors > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white">
                {totalErrors}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectRoleInternal('midea')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
              currentRole === 'midea'
                ? 'bg-cyan-500/20 text-cyan-200 font-bold border border-cyan-400/30'
                : 'text-slate-300 hover:bg-white/5 hover:text-white font-medium'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              <span className="truncate">Time Midea</span>
            </span>
            {totalPending > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-400 text-slate-950">
                {totalPending}
              </span>
            )}
          </button>
        </div>

        {/* 4. Utilitários e Alertas PWA (Exibido na Gaveta Mobile para não poluir a Topbar) */}
        {isDrawer && (
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            <div className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Utilitários & Alertas PWA
            </div>

            <div className="px-1">
              <PWAInstallButton />
            </div>

            {onOpenSoundSelector && (
              <button
                type="button"
                onClick={() => {
                  onOpenSoundSelector();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span className="truncate">Som de Alerta</span>
                </span>
                <span className="text-[10px] text-cyan-200 font-bold">Trocar</span>
              </button>
            )}

            {(onEnablePushManager || onTestPush) && (
              <button
                type="button"
                onClick={() => {
                  if (isPushSubscribed && onTestPush) {
                    onTestPush();
                  } else if (onEnablePushManager) {
                    onEnablePushManager();
                  }
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <Bell
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isPushSubscribed ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  />
                  <span className="truncate">
                    {isPushSubscribed ? 'Testar Push Nativo' : 'Ativar Alertas Push'}
                  </span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    isPushSubscribed
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/25 text-amber-200'
                  }`}
                >
                  {isPushSubscribed ? 'Ativo' : 'Ativar'}
                </span>
              </button>
            )}

            {onExportCSV && (
              <button
                type="button"
                onClick={() => {
                  onExportCSV();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span className="truncate">Exportar Fila (CSV)</span>
                </span>
              </button>
            )}

            {currentUser?.role !== 'buiatte' && onOpenDatabaseDiagnostic && (
              <button
                type="button"
                onClick={() => {
                  onOpenDatabaseDiagnostic();
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <Radio
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isCloudConnected ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  />
                  <span className="truncate">Diagnóstico da Nuvem</span>
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isCloudConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rodapé Enxuto: Usuário Logado + Sair */}
      {currentUser && (
        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 ${
                  currentUser.role === 'midea' ? 'bg-blue-600' : 'bg-emerald-600'
                }`}
              >
                {currentUser.role === 'midea' ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <Truck className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="font-bold text-white text-xs truncate">
                  {currentUser.username}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {currentUser.role === 'midea' ? 'Admin SAP' : 'Prod WMS'}
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-rose-500/80 transition-colors cursor-pointer shrink-0"
                title="Sair / Trocar Usuário"
                aria-label="Sair"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 1. Sidebar Desktop Fixa (Intacta em telas lg+) */}
      <aside className="hidden lg:block w-[205px] shrink-0 min-h-screen self-stretch migou-sidebar-solid text-white select-none z-30">
        <div className="sticky top-0 h-screen">{renderNavigationContent(false)}</div>
      </aside>

      {/* 2. Gaveta Lateral Mobile (Drawer) para troca de Visão (Buiatte / Midea / Espelho), Utilitários PWA e Perfil */}
      {isMobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex"
          onClick={onCloseMobileDrawer}
        >
          <div
            className="w-[270px] max-w-[84vw] h-full overflow-y-auto migou-sidebar-solid text-white shadow-2xl animate-in slide-in-from-left duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {renderNavigationContent(true)}
          </div>
        </div>
      )}

      {/* 3. Barra de Navegação Inferior Nativa PWA Mobile (Flutter BottomNavigationBar - < lg) */}
      <nav
        aria-label="Navegação Mobile PWA"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#081b42]/95 backdrop-blur-xl border-t border-white/15 px-1 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] grid grid-cols-5 items-center gap-0.5 text-white shadow-[0_-8px_25px_rgba(0,0,0,0.35)] w-full max-w-full overflow-hidden"
      >
        <button
          type="button"
          onClick={() => onSelectMainTab('operacao')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl min-w-0 transition-all cursor-pointer active:scale-95 ${
            activeMainTab === 'operacao'
              ? 'bg-white text-[#002664] font-extrabold shadow-xs'
              : 'text-slate-300 hover:text-white font-semibold'
          }`}
        >
          <div className="relative">
            <ClipboardList className="w-4 h-4" />
            {totalPending > 0 && (
              <span className="absolute -top-1.5 -right-2.5 px-1 rounded-full text-[8px] font-black bg-amber-400 text-slate-950">
                {totalPending > 99 ? '99+' : totalPending}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 leading-tight truncate max-w-full">Fila SAP</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectMainTab('consulta_iq09')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl min-w-0 transition-all cursor-pointer active:scale-95 ${
            activeMainTab === 'consulta_iq09'
              ? 'bg-white text-[#002664] font-extrabold shadow-xs'
              : 'text-slate-300 hover:text-white font-semibold'
          }`}
        >
          <div className="relative">
            <Database className="w-4 h-4" />
            {iq09TotalItems > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 leading-tight truncate max-w-full">Base IQ09</span>
        </button>

        {onOpenNewModal && (
          <button
            type="button"
            onClick={onOpenNewModal}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl bg-gradient-to-r from-[#249ED5] to-[#0083CA] text-white font-extrabold shadow-md border border-cyan-300/40 active:scale-95 cursor-pointer min-w-0"
          >
            <PlusCircle className="w-4 h-4 text-white" />
            <span className="text-[9px] uppercase tracking-tight mt-0.5 truncate max-w-full">+ Solicitar</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onSelectMainTab('dashboard_executivo')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl min-w-0 transition-all cursor-pointer active:scale-95 ${
            activeMainTab === 'dashboard_executivo'
              ? 'bg-white text-[#002664] font-extrabold shadow-xs'
              : 'text-slate-300 hover:text-white font-semibold'
          }`}
        >
          <div className="relative">
            <BarChart3 className="w-4 h-4" />
            {wmsTotalItems > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-indigo-400" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 leading-tight truncate max-w-full">Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectMainTab('guia_depositos')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl min-w-0 transition-all cursor-pointer active:scale-95 ${
            activeMainTab === 'guia_depositos'
              ? 'bg-white text-[#002664] font-extrabold shadow-xs'
              : 'text-slate-300 hover:text-white font-semibold'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 leading-tight truncate max-w-full">Depósitos</span>
        </button>
      </nav>
    </>
  );
};
