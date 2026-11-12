import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Header 
} from './components/Header';
import {
  Sidebar
} from './components/Sidebar';
import { 
  KPIDashboard 
} from './components/KPIDashboard';
import { 
  TransferTable 
} from './components/TransferTable';
import { 
  NewRequestModal 
} from './components/NewRequestModal';
import { 
  BatchPasteModal 
} from './components/BatchPasteModal';
import { 
  SAPCopyModal 
} from './components/SAPCopyModal';
import { 
  ResolutionModal 
} from './components/ResolutionModal';
import {
  DatabaseDiagnosticModal
} from './components/DatabaseDiagnosticModal';
import { LoginModal } from './components/LoginModal';
import { SoundSelectorModal } from './components/SoundSelectorModal';
import { DepositsGuideTab } from './components/DepositsGuideTab';
import { IQ09ConsultTab } from './components/IQ09ConsultTab';
import { MigouLogo } from './components/MigouLogo';
import { Check, X } from 'lucide-react';
import { IQ09Snapshot } from './types/iq09';
import {
  loadIQ09SnapshotFromStorage,
  subscribeToIQ09Snapshot,
  getStoredIQ09Metadata,
} from './services/iq09Service';
import { 
  TransferItem, 
  TransferStatus, 
  TeamRole, 
  FilterOptions, 
  NewTransferInput 
} from './types/transfer';
import { AuthUser } from './types/auth';
import { getStoredUser, clearStoredUser } from './services/authService';
import { 
  fetchTransferItems, 
  getLocalCachedItems,
  saveTransferItems, 
  insertTransferItems,
  updateSpecificTransferItems,
  deleteSpecificTransferItems,
  createRequestsFromMultiSerial, 
  computeKPIs, 
  subscribeToRealtimeTransfers,
  registerLocallyRequestedItems
} from './services/storage';
import { 
  exportToCSV, 
  calculateSLA 
} from './utils/sapFormatter';
import { 
  playAlertChime, 
  unlockAudioNow,
  isAudioReady,
  requestNotificationPermission, 
  sendDesktopNotification,
  AlertSoundType,
  getSavedAlertSound,
  ALERT_SOUND_OPTIONS
} from './utils/audioAlert';
import { 
  subscribeToPushNotifications,
  getExistingPushSubscription,
  triggerPushTest,
  setupServiceWorkerMessageListener,
  isPushSupported
} from './services/pushNotification';

const BASE_PAGE_TITLE = 'MIGOU - Gestão de Transferências SAP';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => !getStoredUser());

  const [items, setItems] = useState<TransferItem[]>(() => getLocalCachedItems());
  const [currentRole, setCurrentRole] = useState<TeamRole>(() => {
    const stored = getStoredUser();
    return stored ? stored.role : 'ambos';
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);

  // Estado de liberação do áudio e piscar título
  const [isAudioActive, setIsAudioActive] = useState<boolean>(() => isAudioReady());
  const titleIntervalRef = useRef<any>(null);

  // Modais Operacionais e Abas Principais
  const [activeMainTab, setActiveMainTab] = useState<'operacao' | 'consulta_iq09' | 'guia_depositos'>('operacao');
  const [iq09Snapshot, setIq09Snapshot] = useState<IQ09Snapshot | null>(null);
  const [iq09CachedMeta, setIq09CachedMeta] = useState(() => getStoredIQ09Metadata());
  const [newRequestPreset, setNewRequestPreset] = useState<{
    material?: string;
    seriais?: string[];
    centro: string;
    depositoOrigem: string;
    depositoDestino: string;
  } | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isBatchPasteOpen, setIsBatchPasteOpen] = useState(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [isSoundSelectorOpen, setIsSoundSelectorOpen] = useState(false);
  const [currentAlertSound, setCurrentAlertSound] = useState<AlertSoundType>(() => getSavedAlertSound());
  const [sapModalItems, setSapModalItems] = useState<TransferItem[] | null>(null);
  const [resolutionData, setResolutionData] = useState<{
    items: TransferItem[];
    mode: 'concluir' | 'divergencia';
  } | null>(null);

  // Filtros de Busca e Status
  const [filters, setFilters] = useState<FilterOptions>({
    busca: '',
    status: 'todos',
    centro: 'todos',
    depositoOrigem: 'todos',
    depositoDestino: 'todos',
    periodo: 'todos',
    apenasDivergencias: false,
  });

  const [autoPurgedCount, setAutoPurgedCount] = useState<number>(0);
  const [selectionResetKey, setSelectionResetKey] = useState<number>(0);

  // Feedback visual de envio para o solicitante (sem disparar alerta ou som na própria tela)
  const [successNotice, setSuccessNotice] = useState<{ title: string; message: string } | null>(null);

  const showSuccessNotice = (title: string, message: string) => {
    setSuccessNotice({ title, message });
    setTimeout(() => {
      setSuccessNotice((curr) => (curr?.title === title ? null : curr));
    }, 4500);
  };

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setIsLoginModalOpen(false);
    setCurrentRole(user.role);
    showSuccessNotice(
      `Bem-vindo, ${user.displayName}!`,
      user.role === 'midea'
        ? 'Acesso Administrador: Central SAP MIGO, resolução com Doc SAP, diagnósticos e relatórios liberados.'
        : 'Acesso Produção: Criação de solicitações (individual e lote), seriais, fotos de etiquetas e WMS liberados.'
    );
  };

  const handleLogout = () => {
    clearStoredUser();
    setCurrentUser(null);
    setIsLoginModalOpen(true);
    setCurrentRole('ambos');
    showSuccessNotice('Sessão Finalizada', 'Você saiu com sucesso. Faça login novamente com sua credencial.');
  };

  // Status de permissão de notificação nativa para alertas em segundo plano
  const [desktopNotifPermission, setDesktopNotifPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  // Monitorar permissão e desbloqueio do áudio por gestos do usuário
  useEffect(() => {
    const handleReady = () => setIsAudioActive(true);
    window.addEventListener('migou_audio_ready', handleReady);

    const onUserInteraction = () => {
      if (isAudioReady()) {
        setIsAudioActive(true);
      }
    };

    window.addEventListener('click', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });

    return () => {
      window.removeEventListener('migou_audio_ready', handleReady);
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
    };
  }, []);

  // Piscar título da aba para chamar atenção do operador na barra de tarefas (sem pop-up na tela)
  const flashTitleNotification = useCallback((count: number) => {
    if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
    let isFlashing = false;
    let cycles = 0;
    titleIntervalRef.current = setInterval(() => {
      cycles++;
      document.title = isFlashing
        ? `💧 (${count}) Nova Solicitação - MIGOU!`
        : BASE_PAGE_TITLE;
      isFlashing = !isFlashing;

      if (cycles > 14) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
        document.title = BASE_PAGE_TITLE;
      }
    }, 1000);
  }, []);

  const handleEnablePushManager = async () => {
    await unlockAudioNow();
    const res = await subscribeToPushNotifications();
    if (res.success) {
      setIsPushSubscribed(true);
      setDesktopNotifPermission('granted');
      showSuccessNotice(
        'Push Manager Ativado!',
        'Notificações e som de gota d’água ativos mesmo com o navegador em segundo plano ou fechado.'
      );
    } else {
      showSuccessNotice('Status do Push', res.error || 'Não foi possível ativar Push no navegador.');
    }
  };

  const handleTestPush = async () => {
    await unlockAudioNow();
    const res = await triggerPushTest();
    showSuccessNotice('Disparo de Push', res.message);
  };

  const handleRequestDesktopPermission = async () => {
    await unlockAudioNow();
    await handleEnablePushManager();
  };

  const handleTestAlertSound = async () => {
    await unlockAudioNow();
    setIsAudioActive(true);
    const soundOpt = ALERT_SOUND_OPTIONS.find((s) => s.id === currentAlertSound) || ALERT_SOUND_OPTIONS[0];
    showSuccessNotice(
      `Som Testado (${soundOpt.shortName})!`,
      `Alerta sonoro ativo e configurado com o som "${soundOpt.name}".`
    );
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setDesktopNotifPermission(Notification.permission);
    }

    const handleSoundChange = (e: any) => {
      if (e?.detail?.sound) {
        setCurrentAlertSound(e.detail.sound);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('migou_sound_changed', handleSoundChange);
    }

    getExistingPushSubscription().then((sub) => {
      if (sub) {
        setIsPushSubscribed(true);
        setDesktopNotifPermission('granted');
      }
    });

    // Escuta eventos vindos do Service Worker quando um Push é recebido
    const unsubscribeSW = setupServiceWorkerMessageListener((payload) => {
      if (payload && payload.items && payload.items.length > 0) {
        playAlertChime();
        flashTitleNotification(payload.items.length);
      }
    });

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('migou_sound_changed', handleSoundChange);
      }
      unsubscribeSW();
    };
  }, [flashTitleNotification]);

  // Atalhos Globais de Teclado (Efeito de Teclas [N], [V], [/], [Esc])
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (e.key === 'Escape') {
        setIsNewModalOpen(false);
        setIsBatchPasteOpen(false);
        setSapModalItems(null);
        setResolutionData(null);
        return;
      }

      if (isInput) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsNewModalOpen(true);
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setIsBatchPasteOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Carregar dados e Iniciar Sincronização em Tempo Real (In-time entre computadores)
  const loadData = useCallback(async () => {
    setIsLoading(true);
    const { items: loadedItems, purgedCount, isConnected } = await fetchTransferItems();
    setItems(loadedItems);
    setIsCloudConnected(isConnected);
    if (purgedCount && purgedCount > 0) {
      setAutoPurgedCount(purgedCount);
    }
    setIsLoading(false);
  }, []);

  // Assinatura em Tempo Real (Supabase Realtime WebSockets + Polling Infallible + Snapshot IQ09)
  useEffect(() => {
    loadData();
    loadIQ09SnapshotFromStorage().then((snap) => {
      if (snap) {
        setIq09Snapshot(snap);
        setIq09CachedMeta(snap.metadata);
      }
    });

    const unsubIQ09 = subscribeToIQ09Snapshot((snap) => {
      setIq09Snapshot(snap);
      setIq09CachedMeta(snap ? snap.metadata : null);
    });

    const unsubscribe = subscribeToRealtimeTransfers((updatedItems, source, newIncomingPending) => {
      setItems(updatedItems);
      setIsCloudConnected(true);

      // Se novos itens pendentes chegaram de outro operador, tocar obrigatoriamente o som de gota d'água!
      if (newIncomingPending && newIncomingPending.length > 0) {
        playAlertChime();
        flashTitleNotification(newIncomingPending.length);
      }
    });

    return () => {
      unsubscribe();
      unsubIQ09();
    };
  }, [loadData, flashTitleNotification]);

  // Recalcular SLA a cada 60 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      setItems((prevItems) =>
        prevItems.map((item) => {
          if (item.status === 'concluido') return item;
          const { slaStatus } = calculateSLA(item.criadoEm, item.status);
          if (item.slaStatus !== slaStatus) {
            return { ...item, slaStatus };
          }
          return item;
        })
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // KPIs
  const kpis = useMemo(() => computeKPIs(items), [items]);

  // Salvar alterações e sincronizar com Supabase na nuvem
  const handleUpdateItems = async (newItems: TransferItem[]): Promise<boolean> => {
    setItems(newItems);
    return await saveTransferItems(newItems);
  };

  // Criar nova solicitação com múltiplos seriais (Insere apenas os novos itens)
  const handleCreateRequest = async (input: NewTransferInput) => {
    const created = createRequestsFromMultiSerial(input, items.length);
    registerLocallyRequestedItems(created);
    setItems((prev) => [...created, ...prev]);
    const isSaved = await insertTransferItems(created);

    if (isSaved) {
      showSuccessNotice(
        'Solicitação registrada com sucesso!',
        `${created.length} serial(is) de ${input.material} salvo(s) e sincronizado(s) em tempo real com o Time SAP.`
      );
    } else {
      showSuccessNotice(
        'Salvo localmente (Aviso de Conexão)',
        `${created.length} serial(is) salvo(s) na máquina. A sincronização em nuvem ocorrerá em segundo plano.`
      );
    }
  };

  // Importar em lote (Colar Tabela Excel/WhatsApp) (Insere apenas os novos itens)
  const handleImportBatch = async (batchItems: TransferItem[]) => {
    registerLocallyRequestedItems(batchItems);
    setItems((prev) => [...batchItems, ...prev]);
    const isSaved = await insertTransferItems(batchItems);

    if (batchItems.length > 0) {
      if (isSaved) {
        showSuccessNotice(
          'Lote importado com sucesso!',
          `${batchItems.length} seriais salvos e sincronizados em tempo real com o Time SAP.`
        );
      } else {
        showSuccessNotice(
          'Salvo localmente (Aviso de Conexão)',
          `${batchItems.length} seriais salvos na máquina. Sincronização pendente com a nuvem.`
        );
      }
    }
  };

  // Alterar status individual rápido (Comando direto e cirúrgico de UPDATE)
  const handleUpdateStatusSingle = async (id: string, newStatus: TransferStatus) => {
    const now = new Date().toISOString();
    const targetItem = items.find((i) => i.id === id);
    if (!targetItem) return;

    const updatedItem: TransferItem = {
      ...targetItem,
      status: newStatus,
      atualizadoEm: now,
      atualizadoPor: 'Time Midea (SAP)',
    };
    const updated = items.map((i) => (i.id === id ? updatedItem : i));
    setItems(updated);
    await updateSpecificTransferItems([updatedItem], updated);
  };

  // Anexar foto da etiqueta/label diretamente do item
  const handleAttachLabelPhoto = async (itemId: string, photoUrl: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const updatedItem: TransferItem = {
      ...targetItem,
      labelPhotoUrl: photoUrl,
      atualizadoEm: new Date().toISOString(),
    };
    const updated = items.map((i) => (i.id === itemId ? updatedItem : i));
    setItems(updated);
    await updateSpecificTransferItems([updatedItem], updated);
    showSuccessNotice(
      'Foto da Etiqueta Anexada!',
      'Comprovação da label salva com sucesso no Supabase para conferência do Time Midea no SAP.'
    );
  };

  // Excluir linhas selecionadas (para limpeza rápida de erros de digitação)
  const handleDeleteSelected = async (ids: string[]) => {
    const idSet = new Set(ids);
    const remaining = items.filter((item) => !idSet.has(item.id));
    setItems(remaining);
    await deleteSpecificTransferItems(ids, remaining);
    showSuccessNotice(
      'Solicitação(ões) Excluída(s)!',
      `${ids.length} linha(s) removida(s) com sucesso para limpeza de lançamentos incorretos.`
    );
  };

  // De-Para Automático IQ09 direto na Fila de Solicitações (corrige Material, Centro e Dep. Origem com 1 clique p/ não falhar na Macro MIGO)
  const handleApplyIQ09DePara = async (
    updates: Array<{
      id: string;
      material: string;
      centro: string;
      depositoOrigem: string;
      observacoes?: string;
    }>
  ) => {
    if (!updates || updates.length === 0) return;
    const now = new Date().toISOString();
    const updater =
      currentUser?.teamName ||
      (currentUser?.role === 'buiatte' ? 'Time Buiatte (Prod)' : 'Time Midea (SAP)');
    const updatesMap = new Map(updates.map((u) => [u.id, u]));
    const affectedItems: TransferItem[] = [];

    const updated = items.map((item) => {
      const fix = updatesMap.get(item.id);
      if (fix) {
        const up: TransferItem = {
          ...item,
          material: fix.material,
          centro: fix.centro,
          depositoOrigem: fix.depositoOrigem,
          observacoes: fix.observacoes !== undefined ? fix.observacoes : item.observacoes,
          atualizadoEm: now,
          atualizadoPor: updater,
        };
        affectedItems.push(up);
        return up;
      }
      return item;
    });

    setItems(updated);
    if (sapModalItems) {
      setSapModalItems((prev) =>
        prev ? prev.map((it) => updatesMap.get(it.id) ? (updated.find((u) => u.id === it.id) || it) : it) : null
      );
    }
    await updateSpecificTransferItems(affectedItems, updated);
    showSuccessNotice(
      'De-Para Automático IQ09 Aplicado!',
      `${affectedItems.length} solicitação(ões) sincronizada(s) com Material, Centro e Dep. Origem reais da base IQ09 (100% prontas para a Macro MIGO).`
    );
  };

  // Resolução de Conclusão ou Divergência (Atualização cirúrgica em lote no Supabase)
  const handleResolutionSubmit = async (data: {
    sapDocNumber?: string;
    observacoes: string;
    responsavel: string;
  }) => {
    if (!resolutionData) return;

    const idsToUpdate = new Set(resolutionData.items.map((i) => i.id));
    const now = new Date().toISOString();
    const isConcluir = resolutionData.mode === 'concluir';
    const affectedItems: TransferItem[] = [];

    const updated = items.map((item) => {
      if (idsToUpdate.has(item.id)) {
        const up: TransferItem = {
          ...item,
          status: (isConcluir ? 'concluido' : 'divergencia') as TransferStatus,
          atualizadoEm: now,
          atualizadoPor: data.responsavel,
          sapDocNumber: isConcluir ? data.sapDocNumber || item.sapDocNumber : item.sapDocNumber,
          observacoes: data.observacoes || item.observacoes,
        };
        affectedItems.push(up);
        return up;
      }
      return item;
    });

    setItems(updated);
    setSelectionResetKey((prev) => prev + 1);
    await updateSpecificTransferItems(affectedItems, updated);
  };

  // Exportar para CSV
  const handleExportCSV = () => {
    exportToCSV(items, `migou_transferencias_sap_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Ação ao clicar em "Tratar no SAP" na notificação Outlook
  const handleFocusMideaView = (alertItems: TransferItem[]) => {
    setCurrentRole('midea');
    if (alertItems.length > 0) {
      setFilters((prev) => ({
        ...prev,
        busca: alertItems[0].material,
        status: 'pendente',
      }));
    }
  };

  // Focar solicitações pendentes na visão do Time Midea pelo sino
  const handleOpenLatestAlert = () => {
    setCurrentRole('midea');
    setFilters((prev) => ({
      ...prev,
      status: 'pendente',
    }));
  };

  return (
    <div className="min-h-screen figma-aurora-bg flex items-stretch text-slate-800 relative font-sans selection:bg-[#249ED5] selection:text-white">
      {/* Sidebar Corporativa Fixa, Enxuta e Inteira até o Final da Página */}
      <Sidebar
        activeMainTab={activeMainTab}
        onSelectMainTab={setActiveMainTab}
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        totalItemsCount={items.length}
        totalPending={kpis.pendentes}
        totalErrors={kpis.divergencias}
        iq09TotalItems={iq09Snapshot?.metadata.totalItems || iq09CachedMeta?.totalItems || 0}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Coluna Principal de Trabalho */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Topbar Enxuta e Leve */}
        <Header
          onOpenNewModal={() => {
            setNewRequestPreset(null);
            setIsNewModalOpen(true);
          }}
          onOpenBatchPaste={() => setIsBatchPasteOpen(true)}
          onExportCSV={handleExportCSV}
          latestAlertCount={kpis.pendentes}
          onOpenLatestAlert={handleOpenLatestAlert}
          onTestAlertSound={handleTestAlertSound}
          currentAlertSound={currentAlertSound}
          onOpenSoundSelector={() => setIsSoundSelectorOpen(true)}
          isPushSubscribed={isPushSubscribed}
          onEnablePushManager={handleEnablePushManager}
          onTestPush={handleTestPush}
          isCloudConnected={isCloudConnected}
          onOpenDatabaseDiagnostic={() => setIsDiagnosticOpen(true)}
          currentUser={currentUser}
          activeMainTab={activeMainTab}
          onSelectMainTab={setActiveMainTab}
          iq09TotalItems={iq09Snapshot?.metadata.totalItems || iq09CachedMeta?.totalItems || 0}
          iq09UpdatedAt={iq09Snapshot?.metadata.updatedAt || iq09CachedMeta?.updatedAt || null}
        />

        {/* Conteúdo Principal */}
        <main className="flex-1 max-w-[1680px] w-full mx-auto px-4 lg:px-6 py-4 sm:py-5 relative z-10">
          {activeMainTab === 'guia_depositos' ? (
            <DepositsGuideTab
              onStartRequestWithRoute={(preset) => {
                setNewRequestPreset(preset);
                setIsNewModalOpen(true);
              }}
            />
          ) : activeMainTab === 'consulta_iq09' ? (
            <IQ09ConsultTab
              snapshot={iq09Snapshot}
              queueItems={items}
              defaultSolicitante={currentUser?.teamName || 'Time Buiatte (Prod)'}
              currentRole={currentRole}
              onImportBatchRequests={handleImportBatch}
              onOpenNewRequestWithPreset={(preset) => {
                setNewRequestPreset(preset);
                setIsNewModalOpen(true);
              }}
              onSwitchToQueueTab={() => setActiveMainTab('operacao')}
            />
          ) : (
            <>
              {/* Dashboard de Indicadores Glassmorphism (FIFO, SLA, Concluídos, Divergências) */}
              <KPIDashboard
                stats={kpis}
                activeStatusFilter={filters.status}
                onFilterByStatus={(st) => setFilters({ ...filters, status: st })}
              />

              {/* Tabela Operacional de Movimentações (AppSheet Responsive Grid) */}
              <TransferTable
                items={items}
                currentRole={currentRole}
                filters={filters}
                onFilterChange={setFilters}
                onOpenSAPModal={(selected) => setSapModalItems(selected)}
                onOpenResolutionModal={(selected, mode) =>
                  setResolutionData({ items: selected, mode })
                }
                onUpdateStatusSingle={handleUpdateStatusSingle}
                onBatchUpdateStatus={async (ids, newStatus) => {
                  const now = new Date().toISOString();
                  const affectedItems: TransferItem[] = [];
                  const updater = currentUser?.teamName || (currentUser?.role === 'buiatte' ? 'Time Buiatte (Prod)' : 'Time Midea (SAP)');
                  const updated = items.map((item) => {
                    if (ids.includes(item.id)) {
                      const up: TransferItem = {
                        ...item,
                        status: newStatus,
                        atualizadoEm: now,
                        atualizadoPor: updater,
                      };
                      affectedItems.push(up);
                      return up;
                    }
                    return item;
                  });
                  setItems(updated);
                  setSelectionResetKey((prev) => prev + 1);
                  await updateSpecificTransferItems(affectedItems, updated);
                }}
                selectionResetKey={selectionResetKey}
                onAttachLabelPhoto={handleAttachLabelPhoto}
                onOpenNewModal={() => {
                  setNewRequestPreset(null);
                  setIsNewModalOpen(true);
                }}
                onOpenBatchPaste={() => setIsBatchPasteOpen(true)}
                onDeleteSelected={handleDeleteSelected}
                iq09SnapshotVersion={iq09Snapshot?.metadata.snapshotId || null}
                iq09TotalItems={iq09Snapshot?.metadata.totalItems || iq09CachedMeta?.totalItems || 0}
                onApplyIQ09DePara={handleApplyIQ09DePara}
                onOpenIQ09Tab={() => setActiveMainTab('consulta_iq09')}
              />
            </>
          )}
        </main>

        {/* Rodapé Corporativo com Estilo Glassmorphism e Passarinho Azul */}
        <footer className="bg-slate-950/35 backdrop-blur-xl text-white border-t border-white/15 py-3.5 text-xs relative z-10">
          <div className="max-w-[1680px] mx-auto px-2.5 sm:px-4 lg:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <MigouLogo size="sm" animated={false} />
              <span className="font-extrabold text-[#C2DEEB] tracking-wide">MIGOU</span>
              <span>•</span>
              <span className="text-white/80">Gestão de Transferências SAP & WMS • Time Buiatte ⟷ Time Midea</span>
            </div>
            <div className="text-white/70 text-[11px]">
              Sincronização em tempo real (In-time) protegida por FIFO, SLA e comprovação de label.
            </div>
          </div>
        </footer>
      </div>

      {/* Alerta de Desbloqueio de Áudio (surge apenas se o navegador ainda não recebeu interação) */}
      {!isAudioActive && (
        <button
          type="button"
          onClick={async () => {
            await unlockAudioNow();
            setIsAudioActive(true);
          }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#002664]/95 text-white border border-[#249ED5]/60 px-5 py-2.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl flex items-center gap-3 cursor-pointer hover:bg-[#003380] transition-all duration-200 animate-bounce text-xs font-medium"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-semibold text-cyan-200">💧 Alerta Sonoro de Gota d'Água:</span>
          <span className="text-white/90">Clique aqui para liberar o som no seu navegador</span>
        </button>
      )}

      {/* Modal de Autenticação / Login Obrigatório */}
      <LoginModal
        isOpen={!currentUser || isLoginModalOpen}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Modal de Nova Solicitação (com Múltiplos Seriais e Inteligência de Rota SAP) */}
      <NewRequestModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSubmit={(input) => {
          handleCreateRequest(input);
          setActiveMainTab('operacao');
        }}
        defaultSolicitante={currentUser?.teamName || 'Time Buiatte (Prod)'}
        initialPreset={newRequestPreset}
        onOpenDepositsGuide={() => setActiveMainTab('guia_depositos')}
      />

      {/* Modal de Importação em Lote (Colar Tabela Excel/WhatsApp) */}
      <BatchPasteModal
        isOpen={isBatchPasteOpen}
        onClose={() => setIsBatchPasteOpen(false)}
        onImportItems={handleImportBatch}
        currentCount={items.length}
        defaultSolicitante={currentUser?.teamName || 'Time Buiatte (Prod)'}
      />

      {/* Modal de Assistente e Cópia para o SAP */}
      {sapModalItems && (
        <SAPCopyModal
          isOpen={Boolean(sapModalItems)}
          items={sapModalItems}
          onClose={() => setSapModalItems(null)}
          iq09SnapshotVersion={iq09Snapshot?.metadata.snapshotId || null}
          onApplyIQ09DePara={handleApplyIQ09DePara}
        />
      )}

      {/* Modal de Resolução (Doc SAP ou Divergência) */}
      {resolutionData && (
        <ResolutionModal
          isOpen={Boolean(resolutionData)}
          items={resolutionData.items}
          mode={resolutionData.mode}
          onClose={() => setResolutionData(null)}
          onSubmit={handleResolutionSubmit}
        />
      )}

      {/* Modal de Diagnóstico do Banco de Dados e Supabase */}
      {isDiagnosticOpen && (
        <DatabaseDiagnosticModal
          isOpen={isDiagnosticOpen}
          onClose={() => setIsDiagnosticOpen(false)}
          isCloudConnected={isCloudConnected}
          onRecordsCleared={() => {
            setItems([]);
            showSuccessNotice(
              'Banco de Dados Zerado!',
              'Todos os registros foram limpos com sucesso. O sistema está pronto para a operação oficial.'
            );
          }}
        />
      )}

      {/* Modal de Escolha do Som de Alerta */}
      <SoundSelectorModal
        isOpen={isSoundSelectorOpen}
        onClose={() => setIsSoundSelectorOpen(false)}
        onSoundSelected={(sound) => {
          setCurrentAlertSound(sound);
          const opt = ALERT_SOUND_OPTIONS.find((o) => o.id === sound);
          showSuccessNotice(
            `Som de Alerta: ${opt?.shortName || sound}`,
            `O som "${opt?.name}" foi salvo e tocará para novas solicitações.`
          );
        }}
      />

      {/* Notificação Toast de Sucesso/Feedback do Sistema */}
      {successNotice && (
        <div className="fixed top-20 right-6 z-50 bg-[#002664] text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#249ED5]/50 flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-200 max-w-md">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <div className="font-bold text-white text-[13px]">{successNotice.title}</div>
            <div className="text-white/80 mt-0.5">{successNotice.message}</div>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-white/60 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
