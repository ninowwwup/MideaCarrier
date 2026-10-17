import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  NewRequestAlertModal,
  AlertNotification 
} from './components/NewRequestAlertModal';
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
  computeKPIs 
} from './services/storage';
import { 
  exportToCSV, 
  calculateSLA 
} from './utils/sapFormatter';
import { 
  playAlertChime 
} from './utils/audioAlert';

export default function App() {
  const [items, setItems] = useState<TransferItem[]>([]);
  const [currentRole, setCurrentRole] = useState<TeamRole>('ambos');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sistema de Alerta Pop-up para o Time Midea
  const [activeAlert, setActiveAlert] = useState<AlertNotification | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertNotification[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);

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

  // Carregar dados iniciais
  const loadData = useCallback(async () => {
    setIsLoading(true);
    const { items: loadedItems } = await fetchTransferItems();
    setItems(loadedItems);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
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

  // Salvar alterações
  const handleUpdateItems = async (newItems: TransferItem[]) => {
    setItems(newItems);
    await saveTransferItems(newItems);
  };

  // Disparar Alerta Pop-up para o Time Midea
  const triggerMideaAlert = (
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

    // Tocar sinal sonoro
    if (isSoundEnabled) {
      playAlertChime();
    }

    // Exibir Pop-up
    setActiveAlert(alertData);
    setAlertHistory((prev) => [alertData, ...prev]);
  };

  // Criar nova solicitação com múltiplos seriais
  const handleCreateRequest = async (input: NewTransferInput) => {
    const created = createRequestsFromMultiSerial(input, items.length);
    const nextList = [...created, ...items];
    await handleUpdateItems(nextList);

    // Dispara pop-up imediato de alerta para o Time Midea!
    triggerMideaAlert(
      created,
      input.solicitante || 'Time Buiatte (Sênior WMS)',
      input.material,
      input.centro,
      input.depositoOrigem,
      input.depositoDestino
    );
  };

  // Importar em lote (Colar Tabela)
  const handleImportBatch = async (batchItems: TransferItem[]) => {
    const nextList = [...batchItems, ...items];
    await handleUpdateItems(nextList);

    if (batchItems.length > 0) {
      const first = batchItems[0];
      const materiaisUnicos = Array.from(new Set(batchItems.map((b) => b.material))).join(', ');
      triggerMideaAlert(
        batchItems,
        first.criadoPor || 'Time Buiatte (Sênior WMS)',
        materiaisUnicos,
        first.centro,
        first.depositoOrigem,
        first.depositoDestino
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
    exportToCSV(items, `midea_transferencias_sap_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Ação ao clicar em "Tratar no SAP Agora" no Pop-up de Alerta
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

  // Reabrir último alerta pelo sino
  const handleOpenLatestAlert = () => {
    if (alertHistory.length > 0) {
      setActiveAlert(alertHistory[0]);
    } else if (items.length > 0) {
      // Cria alerta com a solicitação mais recente pendente
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
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* Header com Navegação, Controle de Alertas e Ações Rápidas */}
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
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Dashboard de Indicadores (FIFO, SLA, Concluídos, Divergências) */}
        <KPIDashboard
          stats={kpis}
          activeStatusFilter={filters.status}
          onFilterByStatus={(st) => setFilters({ ...filters, status: st })}
        />

        {/* Tabela Operacional de Movimentações */}
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
        />
      </main>

      {/* Rodapé Corporativo */}
      <footer className="bg-white border-t border-slate-200 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#00609C]">Midea Carrier</span>
            <span>•</span>
            <span>Operação Logística & Integração Sênior WMS ⟷ SAP</span>
          </div>
          <div>
            Fluxo protegido por FIFO e controle de SLA de transferências de depósitos.
          </div>
        </div>
      </footer>

      {/* POP-UP DE ALERTA PARA O TIME MIDEA */}
      <NewRequestAlertModal
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
    </div>
  );
}
