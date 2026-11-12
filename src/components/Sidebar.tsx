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
  totalItemsCount: number;
  totalPending: number;
  totalErrors: number;
  iq09TotalItems: number;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
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
  currentUser,
  onLogout,
}) => {
  return (
    <aside className="w-[205px] shrink-0 min-h-screen self-stretch migou-sidebar-solid text-white select-none z-30">
      <div className="sticky top-0 h-screen flex flex-col justify-between p-3">
        {/* Topo: Marca + Menu Principal + Visão */}
        <div className="space-y-5">
          {/* 1. Identidade MIGOU */}
          <div className="flex items-center gap-2.5 px-1.5 pt-1 pb-3 border-b border-white/10">
            <MigouLogo
              size="sm"
              animated={false}
              onClick={() => onSelectMainTab('operacao')}
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

          {/* 2. Navegação Principal (Reduzida e Direta) */}
          <nav className="space-y-1" aria-label="Menu Principal">
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Módulos
            </div>

            <button
              type="button"
              onClick={() => onSelectMainTab('operacao')}
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
              onClick={() => onSelectMainTab('consulta_iq09')}
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
              onClick={() => onSelectMainTab('guia_depositos')}
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
              onClick={() => onSelectRole('ambos')}
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
              onClick={() => onSelectRole('buiatte')}
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
              onClick={() => onSelectRole('midea')}
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
    </aside>
  );
};
