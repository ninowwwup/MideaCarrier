import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Header 
} from './components/Header';
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
  OutlookToastAlert,
  AlertNotification 
} from './components/OutlookToastAlert';
import { Check, X, Bell } from 'lucide-react';
import { 
  TransferItem, 
  TransferStatus, 
  TeamRole, 
  FilterOptions, 
  NewTransferInput 
} from './types/transfer';
import { 
  fetchTransferItems, 
  saveTransferItems, 
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
  requestNotificationPermission, 
  sendDesktopNotification 
} from './utils/audioAlert';
import { 
  subscribeToPushNotifications,
  getExistingPushSubscription,
  triggerPushTest,
  setupServiceWorkerMessageListener,
  isPushSupported
} from './services/pushNotification';
import { getSupabaseConfig } from './services/supabaseClient';

const BASE_PAGE_TITLE = 'MIGOU - Gestão de Transferências SAP';

export default function App() {
  const [items, setItems] = useState<TransferItem[]>([]);
  const [currentRole, setCurrentRole] = useState<TeamRole>('ambos');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);

  // Sistema de Alerta estilo Outlook (Canto Inferior Esquerdo)
  const [activeAlert, setActiveAlert] = useState<AlertNotification | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertNotification[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const titleIntervalRef = useRef<any>(null);

  // Modais Operacionais
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isBatchPasteOpen, setIsBatchPasteOpen] = useState(false);
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

  // Feedback visual de envio para o solicitante (sem disparar alerta ou som na própria tela)
  const [successNotice, setSuccessNotice] = useState<{ title: string; message: string } | null>(null);

  const showSuccessNotice = (title: string, message: string) => {
    setSuccessNotice({ title, message });
    setTimeout(() => {
      setSuccessNotice((curr) => (curr?.title === title ? null : curr));
    }, 4500);
  };

  // Status de permissão de notificação nativa para alertas em segundo plano
  const [desktopNotifPermission, setDesktopNotifPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  // Função central para disparar o Alerta estilo Outlook
  const triggerMideaAlert = useCallback((
    newItems: TransferItem[],
    solicitante: string,
    resumoMaterial: string,
    centro: string,
    depOrigem: string,
    depDestino: string
  ) => {
    const alertData: AlertNotification = {
      id: `alert-${Date.now()}`,
      timestamp: new Date().toISOString(),
      items: newItems,
      solicitante,
      resumoMaterial,
      centro,
      depOrigem,
      depDestino,
      totalSeriais: newItems.length,
    };

    if (isSoundEnabled) {
      playAlertChime();
    }

    sendDesktopNotification(
      `MIGOU: Nova Solicitação SAP (${centro})`,
      `${solicitante} solicitou transferência de ${resumoMaterial} (${depOrigem} ➔ ${depDestino}) com ${newItems.length} seriais`
    );

    setActiveAlert(alertData);
    setAlertHistory((prev) => [alertData, ...prev]);
  }, [isSoundEnabled]);

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
    if (desktopNotifPermission === 'granted') {
      sendDesktopNotification(
        'MIGOU: Teste de Notificação Outlook (5s)',
        'Som suave de gota d’água e pop-up de 5 segundos funcionando perfeitamente!'
      );
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setDesktopNotifPermission(Notification.permission);
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
        const first = payload.items[0];
        const materiaisUnicos = Array.from(new Set(payload.items.map((i: any) => i.material))).join(', ');
        triggerMideaAlert(
          payload.items,
          first.criadoPor || 'Time Buiatte (Sênior WMS)',
          materiaisUnicos,
          first.centro,
          first.depositoOrigem,
          first.depositoDestino
        );
      }
    });

    return () => unsubscribeSW();
  }, [triggerMideaAlert]);

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
        setActiveAlert(null);
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

  // Alternar título da aba quando houver novo alerta não lido (piscar na barra de tarefas)
  useEffect(() => {
    if (activeAlert) {
      let isFlashing = false;
      if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);

      titleIntervalRef.current = setInterval(() => {
        document.title = isFlashing
          ? `🔔 (1) Nova Solicitação - MIGOU! (${activeAlert.resumoMaterial})`
          : BASE_PAGE_TITLE;
        isFlashing = !isFlashing;
      }, 1200);
    } else {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      document.title = BASE_PAGE_TITLE;
    }

    return () => {
      if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
    };
  }, [activeAlert]);

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

  const triggerMideaAlertRef = useRef(triggerMideaAlert);
  useEffect(() => {
    triggerMideaAlertRef.current = triggerMideaAlert;
  }, [triggerMideaAlert]);

  // Assinatura em Tempo Real (Supabase Realtime WebSockets + SSE + Polling Infallible)
  useEffect(() => {
    loadData();

    const unsubscribe = subscribeToRealtimeTransfers((updatedItems, source, newIncomingPending) => {
      setItems(updatedItems);
      setIsCloudConnected(true);

      // Se novos itens pendentes chegaram de outro computador, DISPARAR O POP-UP OUTLOOK NO OUTRO COMPUTADOR!
      if (newIncomingPending && newIncomingPending.length > 0) {
        const first = newIncomingPending[0];
        const materiaisUnicos = Array.from(new Set(newIncomingPending.map((i) => i.material))).join(', ');
        triggerMideaAlertRef.current(
          newIncomingPending,
          first.criadoPor || 'Time Buiatte (Sênior WMS)',
          materiaisUnicos,
          first.centro,
          first.depositoOrigem,
          first.depositoDestino
        );
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadData]);

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
  const handleUpdateItems = async (newItems: TransferItem[]) => {
    setItems(newItems);
    await saveTransferItems(newItems);
  };

  // Criar nova solicitação com múltiplos seriais
  const handleCreateRequest = async (input: NewTransferInput) => {
    const created = createRequestsFromMultiSerial(input, items.length);
    registerLocallyRequestedItems(created);
    const nextList = [...created, ...items];
    await handleUpdateItems(nextList);

    // O pop-up e som NÃO aparecem na tela de quem solicita, apenas na de quem recebe!
    showSuccessNotice(
      'Solicitação enviada com sucesso!',
      `${created.length} serial(is) de ${input.material} sincronizado(s) em tempo real com o Time SAP.`
    );
  };

  // Importar em lote (Colar Tabela)
  const handleImportBatch = async (batchItems: TransferItem[]) => {
    registerLocallyRequestedItems(batchItems);
    const nextList = [...batchItems, ...items];
    await handleUpdateItems(nextList);

    // O pop-up e som NÃO aparecem na tela de quem solicita, apenas na de quem recebe!
    if (batchItems.length > 0) {
      showSuccessNotice(
        'Lote importado com sucesso!',
        `${batchItems.length} seriais sincronizados em tempo real com o Time SAP.`
      );
    }
  };

  // Alterar status individual rápido
  const handleUpdateStatusSingle = async (id: string, newStatus: TransferStatus) => {
    const now = new Date().toISOString();
    const updated = items.map((i) =>
      i.id === id
        ? {
            ...i,
            status: newStatus,
            atualizadoEm: now,
            atualizadoPor: 'Time Midea (SAP)',
          }
        : i
    );
    await handleUpdateItems(updated);
  };

  // Anexar foto da etiqueta/label diretamente do item
  const handleAttachLabelPhoto = async (itemId: string, photoUrl: string) => {
    const updated = items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            labelPhotoUrl: photoUrl,
            atualizadoEm: new Date().toISOString(),
          }
        : i
    );
    await handleUpdateItems(updated);
    showSuccessNotice(
      'Foto da Etiqueta Anexada!',
      'Comprovação da label salva com sucesso para conferência do Time Midea no SAP.'
    );
  };

  // Resolução de Conclusão ou Divergência
  const handleResolutionSubmit = async (data: {
    sapDocNumber?: string;
    observacoes: string;
    responsavel: string;
  }) => {
    if (!resolutionData) return;

    const idsToUpdate = new Set(resolutionData.items.map((i) => i.id));
    const now = new Date().toISOString();
    const isConcluir = resolutionData.mode === 'concluir';

    const updated = items.map((item) => {
      if (idsToUpdate.has(item.id)) {
        return {
          ...item,
          status: (isConcluir ? 'concluido' : 'divergencia') as TransferStatus,
          atualizadoEm: now,
          atualizadoPor: data.responsavel,
          sapDocNumber: isConcluir ? data.sapDocNumber || item.sapDocNumber : item.sapDocNumber,
          observacoes: data.observacoes || item.observacoes,
        };
      }
      return item;
    });

    await handleUpdateItems(updated);
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

  // Reabrir último alerta pelo sino no topo
  const handleOpenLatestAlert = () => {
    if (alertHistory.length > 0) {
      setActiveAlert(alertHistory[0]);
    } else if (items.length > 0) {
      const pendentes = items.filter((i) => i.status === 'pendente');
      const targetItems = pendentes.length > 0 ? [pendentes[0]] : [items[0]];
      const first = targetItems[0];
      setActiveAlert({
        id: `alert-recent`,
        timestamp: first.criadoEm,
        items: targetItems,
        solicitante: first.criadoPor,
        resumoMaterial: first.material,
        centro: first.centro,
        depOrigem: first.depositoOrigem,
        depDestino: first.depositoDestino,
        totalSeriais: targetItems.length,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071630] via-[#0E2A54] to-[#051026] flex flex-col text-slate-800 relative overflow-hidden font-sans selection:bg-[#249ED5] selection:text-white">
      {/* Elementos Mesh Ambientais de Glassmorfismo Moderno */}
      <div className="absolute top-[-10rem] left-[-10rem] w-[35rem] h-[35rem] rounded-full bg-[#0083CA]/25 blur-[130px] pointer-events-none" />
      <div className="absolute top-[25%] right-[-10rem] w-[38rem] h-[38rem] rounded-full bg-[#249ED5]/20 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10rem] left-[25%] w-[42rem] h-[42rem] rounded-full bg-indigo-600/15 blur-[160px] pointer-events-none" />

      {/* Header com Paleta Midea e Glassmorphism */}
      <Header
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        onOpenNewModal={() => setIsNewModalOpen(true)}
        onOpenBatchPaste={() => setIsBatchPasteOpen(true)}
        onExportCSV={handleExportCSV}
        totalPending={kpis.pendentes}
        totalErrors={kpis.divergencias}
        latestAlertCount={alertHistory.length}
        onOpenLatestAlert={handleOpenLatestAlert}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={() => setIsSoundEnabled((prev) => !prev)}
        onTestAlertSound={handleTestAlertSound}
        desktopNotifPermission={desktopNotifPermission}
        onRequestDesktopPermission={handleRequestDesktopPermission}
        isPushSubscribed={isPushSubscribed}
        onEnablePushManager={handleEnablePushManager}
        onTestPush={handleTestPush}
        autoPurgedCount={autoPurgedCount}
        isCloudConnected={isCloudConnected}
      />

      {/* Conteúdo Principal com Camadas Frosted Glass */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">

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
          onAttachLabelPhoto={handleAttachLabelPhoto}
        />
      </main>

      {/* Rodapé Corporativo com Estilo Glassmorphism */}
      <footer className="bg-[#002363]/90 backdrop-blur-md text-white border-t border-white/10 py-4 text-xs relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#C2DEEB] tracking-wide">MIGOU</span>
            <span>•</span>
            <span className="text-white/80">Gestão de Transferências SAP & WMS • Time Buiatte ⟷ Time Midea</span>
          </div>
          <div className="text-[#C2DEEB]/80 text-[11px]">
            Sincronização em tempo real (In-time) protegida por FIFO, SLA e comprovação de label.
          </div>
        </div>
      </footer>

      {/* NOTIFICAÇÃO ESTILO OUTLOOK: CANTO INFERIOR ESQUERDO */}
      <OutlookToastAlert
        alert={activeAlert}
        onClose={() => setActiveAlert(null)}
        onOpenSAPModal={(selected) => setSapModalItems(selected)}
        onFocusMideaView={handleFocusMideaView}
      />

      {/* Modal de Nova Solicitação (com Múltiplos Seriais) */}
      <NewRequestModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSubmit={handleCreateRequest}
      />

      {/* Modal de Importação em Lote (Colar Tabela Excel/WhatsApp) */}
      <BatchPasteModal
        isOpen={isBatchPasteOpen}
        onClose={() => setIsBatchPasteOpen(false)}
        onImportItems={handleImportBatch}
        currentCount={items.length}
      />

      {/* Modal de Assistente e Cópia para o SAP */}
      {sapModalItems && (
        <SAPCopyModal
          isOpen={Boolean(sapModalItems)}
          items={sapModalItems}
          onClose={() => setSapModalItems(null)}
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
