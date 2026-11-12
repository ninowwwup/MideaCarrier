import React from 'react';
import {
  ClipboardList,
  Database,
  Compass,
  PlusCircle,
  FileSpreadsheet,
  Layers,
  Users,
  Sparkles,
  ShieldCheck,
  Truck,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Zap,
  Radio,
  Download,
} from 'lucide-react';
import { TeamRole } from '../types/transfer';
import { AuthUser } from '../types/auth';
import { MigouLogo } from './MigouLogo';

export type MainTabType = 'operacao' | 'consulta_iq09' | 'guia_depositos';

interface SidebarProps {
  activeMainTab: MainTabType;
  onSelectMainTab: (tab: MainTabType) => void;
  currentRole: TeamRole;
  onSelectRole: (role: TeamRole) => void;
  onOpenNewModal: () => void;
  onOpenBatchPaste: () => void;
  onExportCSV: () => void;
  totalItemsCount: number;
  totalPending: number;
  totalErrors: number;
  iq09TotalItems: number;
  iq09UpdatedAt: string | null;
  isCloudConnected: boolean;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeMainTab,
  onSelectMainTab,
  currentRole,
  onSelectRole,
  onOpenNewModal,
  onOpenBatchPaste,
  onExportCSV,
  totalItemsCount,
  totalPending,
  totalErrors,
  iq09TotalItems,
  iq09UpdatedAt,
  isCloudConnected,
  currentUser,
  onLogout,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const handleSelectTab = (tab: MainTabType) => {
    onSelectMainTab(tab);
    onCloseMobile();
  };

  const handleSelectRoleInternal = (role: TeamRole) => {
    onSelectRole(role);
    onCloseMobile();
  };

  const renderSidebarContent = (forceExpanded = false) => {
    const collapsed = forceExpanded ? false : isCollapsed;

    return (
      <div className="flex flex-col h-full text-white select-none">
        {/* 1. TOPO DA SIDEBAR: IDENTIDADE MIGOU & BOTÃO RECOLHER */}
        <div
          className={`flex items-center ${
            collapsed ? 'justify-center px-2' : 'justify-between px-4'
          } h-16 border-b border-white/12 shrink-0`}
        >
          <div
            onClick={() => handleSelectTab('operacao')}
            className="flex items-center gap-3 cursor-pointer group min-w-0"
            title="MIGOU — Gestão de Transferências SAP & WMS"
          >
            <MigouLogo size="sm" animated />
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-lg tracking-tight text-white group-hover:text-cyan-200 transition-colors">
                    MIGOU
                  </span>
                  <span className="text-[9px] font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 text-slate-950 shadow-2xs">
                    SAP MIGO
                  </span>
                </div>
                <p className="text-[10px] text-cyan-100/70 font-medium truncate">
                  Midea Carrier • WMS ⟷ SAP
                </p>
              </div>
            )}
          </div>

          {/* Botão Fechar no Mobile ou Recolher no Desktop */}
          {forceExpanded ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Fechar menu"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            !collapsed && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1.5 rounded-xl bg-white/8 hover:bg-white/18 text-white/70 hover:text-white border border-white/10 transition-all cursor-pointer"
                title="Recolher menu lateral para ampliar a tabela"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        {/* Botão para expandir quando estiver recolhida no desktop */}
        {collapsed && !forceExpanded && (
          <div className="px-2 pt-2.5 flex justify-center">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-full py-2 rounded-xl bg-white/8 hover:bg-white/18 text-cyan-200 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer"
              title="Expandir menu lateral"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. CORPO ROLÁVEL DA SIDEBAR */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
          {/* BLOCO A: AÇÕES RÁPIDAS (NOVA SOLICITAÇÃO & COLAR LOTE) */}
          <div className="space-y-1.5">
            {!collapsed && (
              <div className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-cyan-200/70">
                Lançamento Rápido
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                onOpenNewModal();
                onCloseMobile();
              }}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3.5 py-2.5'
              } rounded-xl bg-white hover:bg-cyan-50 text-[#002664] font-extrabold text-xs shadow-[0_6px_20px_rgba(0,0,0,0.22)] hover:shadow-[0_8px_25px_rgba(36,158,213,0.35)] transition-all duration-150 active:scale-95 cursor-pointer group`}
              title="Criar Nova Solicitação de Transferência (Atalho: N)"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <PlusCircle className="w-4 h-4 text-[#0083CA] shrink-0 group-hover:rotate-90 transition-transform duration-200" />
                {!collapsed && <span className="truncate">Nova Solicitação</span>}
              </div>
              {!collapsed && (
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-700 rounded border border-slate-300 shrink-0">
                  N
                </kbd>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenBatchPaste();
                onCloseMobile();
              }}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3.5 py-2'
              } rounded-xl bg-white/10 hover:bg-white/18 text-white font-bold text-xs border border-white/20 transition-all duration-150 active:scale-95 cursor-pointer`}
              title="Colar Tabela do Excel ou WhatsApp em Lote (Atalho: V)"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileSpreadsheet className="w-4 h-4 text-cyan-300 shrink-0" />
                {!collapsed && <span className="truncate">Colar Tabela (Excel)</span>}
              </div>
              {!collapsed && (
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white/15 text-cyan-100 rounded border border-white/25 shrink-0">
                  V
                </kbd>
              )}
            </button>
          </div>

          {/* BLOCO B: NAVEGAÇÃO PRINCIPAL (MÓDULOS / ABAS DO SISTEMA) */}
          <div className="space-y-1">
            {!collapsed && (
              <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-cyan-200/70">
                Módulos & Operação
              </div>
            )}

            {/* Aba 1: Fila de Solicitações & Operação SAP */}
            <button
              type="button"
              onClick={() => handleSelectTab('operacao')}
              className={`relative w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
              } rounded-xl text-xs font-extrabold transition-all duration-150 cursor-pointer group ${
                activeMainTab === 'operacao'
                  ? 'bg-gradient-to-r from-[#249ED5] to-[#00609C] text-white shadow-[0_6px_18px_rgba(36,158,213,0.35)] border border-cyan-300/40'
                  : 'text-white/80 hover:text-white hover:bg-white/10 border border-transparent'
              }`}
              title={`Fila de Solicitações & Operação SAP (${totalItemsCount} registros)`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ClipboardList
                  className={`w-4 h-4 shrink-0 ${
                    activeMainTab === 'operacao' ? 'text-white' : 'text-cyan-300'
                  }`}
                />
                {!collapsed && (
                  <div className="text-left min-w-0">
                    <div className="truncate leading-tight">Fila & Operação SAP</div>
                    <div
                      className={`text-[10px] font-medium truncate ${
                        activeMainTab === 'operacao' ? 'text-cyan-100' : 'text-white/55'
                      }`}
                    >
                      FIFO, SLA & De-Para Auto
                    </div>
                  </div>
                )}
              </div>

              {!collapsed ? (
                <div className="flex items-center gap-1 shrink-0">
                  {totalPending > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-amber-400 text-slate-950">
                      {totalPending}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      activeMainTab === 'operacao'
                        ? 'bg-white/25 text-white'
                        : 'bg-white/12 text-white/85'
                    }`}
                  >
                    {totalItemsCount}
                  </span>
                </div>
              ) : (
                totalPending > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
                )
              )}
            </button>

            {/* Aba 2: Central Base IQ09 & Validador De-Para */}
            <button
              type="button"
              onClick={() => handleSelectTab('consulta_iq09')}
              className={`relative w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
              } rounded-xl text-xs font-extrabold transition-all duration-150 cursor-pointer group ${
                activeMainTab === 'consulta_iq09'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_6px_18px_rgba(16,185,129,0.35)] border border-emerald-300/40'
                  : 'text-white/80 hover:text-white hover:bg-white/10 border border-transparent'
              }`}
              title={
                iq09TotalItems > 0
                  ? `Central Base IQ09 SAP (${iq09TotalItems.toLocaleString('pt-BR')} UIIs ativas)`
                  : 'Central Base IQ09 & Validador De-Para (UII = Serial)'
              }
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Database
                  className={`w-4 h-4 shrink-0 ${
                    activeMainTab === 'consulta_iq09' ? 'text-white' : 'text-emerald-300'
                  }`}
                />
                {!collapsed && (
                  <div className="text-left min-w-0">
                    <div className="truncate leading-tight">Central Base IQ09</div>
                    <div
                      className={`text-[10px] font-medium truncate ${
                        activeMainTab === 'consulta_iq09' ? 'text-emerald-100' : 'text-white/55'
                      }`}
                    >
                      Validador & Consulta (UII)
                    </div>
                  </div>
                )}
              </div>

              {!collapsed ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                    activeMainTab === 'consulta_iq09'
                      ? 'bg-white text-emerald-950'
                      : iq09TotalItems > 0
                      ? 'bg-emerald-400/25 text-emerald-200 border border-emerald-400/40'
                      : 'bg-white/12 text-white/75'
                  }`}
                >
                  {iq09TotalItems > 0 ? iq09TotalItems.toLocaleString('pt-BR') : 'UII'}
                </span>
              ) : (
                iq09TotalItems > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
                )
              )}
            </button>

            {/* Aba 3: Guia Interativo de Depósitos & Regras SAP */}
            <button
              type="button"
              onClick={() => handleSelectTab('guia_depositos')}
              className={`relative w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
              } rounded-xl text-xs font-extrabold transition-all duration-150 cursor-pointer group ${
                activeMainTab === 'guia_depositos'
                  ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 shadow-[0_6px_18px_rgba(251,191,36,0.35)] border border-amber-200'
                  : 'text-white/80 hover:text-white hover:bg-white/10 border border-transparent'
              }`}
              title="Guia Interativo de Depósitos & Regras SAP (Livre, Faltas e Avarias)"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Compass
                  className={`w-4 h-4 shrink-0 ${
                    activeMainTab === 'guia_depositos' ? 'text-slate-950' : 'text-amber-300'
                  }`}
                />
                {!collapsed && (
                  <div className="text-left min-w-0">
                    <div className="truncate leading-tight">Guia de Depósitos</div>
                    <div
                      className={`text-[10px] font-medium truncate ${
                        activeMainTab === 'guia_depositos' ? 'text-slate-800' : 'text-white/55'
                      }`}
                    >
                      Regras & Rotas MIGO 311
                    </div>
                  </div>
                )}
              </div>

              {!collapsed && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold shrink-0 ${
                    activeMainTab === 'guia_depositos'
                      ? 'bg-slate-950/15 text-slate-950'
                      : 'bg-amber-400/20 text-amber-200 border border-amber-300/30'
                  }`}
                >
                  SAP
                </span>
              )}
            </button>
          </div>

          {/* BLOCO C: PERSPECTIVA OPERACIONAL (VISÃO POR TIME) */}
          <div className="space-y-1 pt-2 border-t border-white/10">
            {!collapsed && (
              <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-cyan-200/70">
                Visão Operacional
              </div>
            )}

            <button
              type="button"
              onClick={() => handleSelectRoleInternal('ambos')}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
              } rounded-xl text-xs transition-all cursor-pointer ${
                currentRole === 'ambos'
                  ? 'bg-white/18 text-white font-extrabold border border-white/25 shadow-2xs'
                  : 'text-white/70 hover:text-white hover:bg-white/8 font-medium'
              }`}
              title="Espelho Geral: Visualizar todas as solicitações"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers className={`w-4 h-4 shrink-0 ${currentRole === 'ambos' ? 'text-cyan-300' : 'text-white/60'}`} />
                {!collapsed && <span className="truncate">Espelho Geral</span>}
              </div>
              {!collapsed && currentRole === 'ambos' && (
                <span className="w-2 h-2 rounded-full bg-cyan-300" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSelectRoleInternal('buiatte')}
              className={`relative w-full flex items-center ${
                collapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
              } rounded-xl text-xs transition-all cursor-pointer ${
                currentRole === 'buiatte'
                  ? 'bg-white/18 text-white font-extrabold border border-white/25 shadow-2xs'
                  : 'text-white/70 hover:text-white hover:bg-white/8 font-medium'
              }`}
              title="Visão Time Buiatte (WMS - Solicitações e Divergências)"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Users className={`w-4 h-4 shrink-0 ${currentRole === 'buiatte' ? 'text-emerald-300' : 'text-white/60'}`} />
                {!collapsed && <span className="truncate">Time Buiatte (WMS)</span>}
              </div>
              {!collapsed && totalErrors > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white">
                  {totalErrors}
                </span>
              )}
              {collapsed && totalErrors > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSelectRoleInternal('midea')}
              className={`relative w-full flex items-center ${
                collapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
              } rounded-xl text-xs transition-all cursor-pointer ${
                currentRole === 'midea'
                  ? 'bg-white/18 text-white font-extrabold border border-white/25 shadow-2xs'
                  : 'text-white/70 hover:text-white hover:bg-white/8 font-medium'
              }`}
              title="Visão Time Midea (SAP MIGO - Atendimento FIFO)"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className={`w-4 h-4 shrink-0 ${currentRole === 'midea' ? 'text-amber-300' : 'text-white/60'}`} />
                {!collapsed && <span className="truncate">Time Midea (SAP)</span>}
              </div>
              {!collapsed && totalPending > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-400 text-slate-950">
                  {totalPending}
                </span>
              )}
              {collapsed && totalPending > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
          </div>

          {/* BLOCO D: CARD DE STATUS DO MOTOR DE-PARA IQ09 & EXPORTAÇÃO */}
          {!collapsed && (
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div
                onClick={() => handleSelectTab('consulta_iq09')}
                className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                  iq09TotalItems > 0
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/35'
                    : 'bg-white/5 hover:bg-white/10 border-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-200">
                    <Zap className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Motor De-Para IQ09</span>
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      iq09TotalItems > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                </div>
                <div className="text-xs font-black text-white mt-1">
                  {iq09TotalItems > 0
                    ? `${iq09TotalItems.toLocaleString('pt-BR')} UIIs Indexadas`
                    : 'Nenhuma base ativa'}
                </div>
                <div className="text-[10px] text-white/65 mt-0.5 leading-snug">
                  {iq09TotalItems > 0
                    ? iq09UpdatedAt
                      ? `Atualizada em ${new Date(iq09UpdatedAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })} • Batimento ativo na fila`
                      : 'Batimento ativo na fila SAP'
                    : 'Clique para subir a planilha .xlsx da IQ09'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onExportCSV();
                  onCloseMobile();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/6 hover:bg-white/14 border border-white/12 text-xs font-semibold text-white/85 hover:text-white transition-all cursor-pointer"
                title="Exportar fila completa para Excel (.CSV)"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Exportar Fila (.CSV)</span>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* 3. RODAPÉ DA SIDEBAR: PERFIL DO USUÁRIO & CONEXÃO */}
        <div className="p-2.5 border-t border-white/12 bg-black/25 shrink-0">
          {currentUser ? (
            <div
              className={`flex items-center ${
                collapsed ? 'justify-center' : 'justify-between'
              } gap-2 p-2 rounded-xl bg-white/8 border border-white/12`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white shrink-0 shadow-xs ${
                    currentUser.role === 'midea' ? 'bg-blue-600' : 'bg-emerald-600'
                  }`}
                  title={`${currentUser.displayName} (${currentUser.username})`}
                >
                  {currentUser.role === 'midea' ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <Truck className="w-4 h-4" />
                  )}
                </div>

                {!collapsed && (
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-white truncate">
                        {currentUser.username}
                      </span>
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shrink-0 ${
                          currentUser.role === 'midea'
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-emerald-400 text-slate-950'
                        }`}
                      >
                        {currentUser.role === 'midea' ? 'Admin' : 'Prod'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-white/65 truncate mt-0.5">
                      <Radio className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                      <span className="truncate">
                        {isCloudConnected ? 'Online em Tempo Real' : 'Sincronização Ativa'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {!collapsed && onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-500/85 text-white/75 hover:text-white transition-all cursor-pointer shrink-0"
                  title="Sair / Trocar Usuário"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* SIDEBAR DESKTOP FIXA/COLAPSÁVEL (lg e acima) */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 migou-sidebar-glass backdrop-blur-2xl sticky top-0 h-screen z-40 transition-all duration-200 ease-out ${
          isCollapsed ? 'w-[76px]' : 'w-[268px]'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* DRAWER MOBILE & TABLET (< lg) */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={onCloseMobile}
          />
          <aside className="relative w-[280px] max-w-[85vw] h-full migou-sidebar-glass backdrop-blur-2xl z-10 animate-in slide-in-from-left duration-200">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
