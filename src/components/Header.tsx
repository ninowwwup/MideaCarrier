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
} from 'lucide-react';
import { AuthUser } from '../types/auth';
import { PWAInstallButton } from './PWAInstallButton';
import { AlertSoundType, ALERT_SOUND_OPTIONS, getSavedAlertSound } from '../utils/audioAlert';

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
  activeMainTab?: 'operacao' | 'consulta_iq09' | 'guia_depositos';
  onSelectMainTab?: (tab: 'operacao' | 'consulta_iq09' | 'guia_depositos') => void;
  iq09TotalItems?: number;
  iq09UpdatedAt?: string | null;
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
}) => {
  const activeSound =
    ALERT_SOUND_OPTIONS.find((s) => s.id === (currentAlertSound || getSavedAlertSound())) ||
    ALERT_SOUND_OPTIONS[0];

  const moduleMeta = {
    operacao: {
      title: 'Fila de Solicitações & Operação SAP',
      subtitle: 'Movimentação MIGO 311 • Batimento Automático IQ09',
      icon: ClipboardList,
    },
    consulta_iq09: {
      title: 'Central Base IQ09 & Validador De-Para',
      subtitle: 'Consulta Instantânea SAP (UII = Serial)',
      icon: Database,
    },
    guia_depositos: {
      title: 'Guia de Depósitos & Regras SAP',
      subtitle: 'Rotas Oficiais B179/B170 • Livre, Contagem, Faltas e Avarias',
      icon: Compass,
    },
  }[activeMainTab];

  const ActiveModuleIcon = moduleMeta.icon;

  return (
    <header className="bg-[#081b42]/90 border-b border-white/15 sticky top-0 z-20">
      <div className="max-w-[1680px] mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between py-2.5 gap-3">
          {/* Esquerda: Título da Tela Ativa + Indicador da Base IQ09 */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ActiveModuleIcon className="w-4 h-4 text-cyan-300 shrink-0" />
                <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white truncate">
                  {moduleMeta.title}
                </h1>

                {iq09TotalItems > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectMainTab &&
                      onSelectMainTab(activeMainTab === 'consulta_iq09' ? 'operacao' : 'consulta_iq09')
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
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
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
                    title="Clique para importar a planilha IQ09 do SAP"
                  >
                    <Database className="w-3 h-3 text-cyan-300" />
                    <span>Importar IQ09</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-cyan-100/75 font-medium truncate">
                {moduleMeta.subtitle}
              </p>
            </div>
          </div>

          {/* Direita: Ações Rápidas + Utilitários */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenBatchPaste}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/25 transition-colors cursor-pointer whitespace-nowrap"
              title="Colar tabela do Excel ou mensagem do WhatsApp diretamente (Atalho: V)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-200 shrink-0" />
              <span>Colar Tabela</span>
            </button>

            <button
              type="button"
              onClick={onOpenNewModal}
              className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-slate-900 bg-white hover:bg-slate-100 border border-white transition-colors cursor-pointer whitespace-nowrap"
              title="Nova Solicitação com múltiplos seriais (Atalho: N)"
            >
              <PlusCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Nova Solicitação</span>
            </button>

            <div className="h-5 w-px bg-white/15 mx-0.5" />

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
