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
  SupabaseConfigModal 
} from './components/SupabaseConfigModal';
import { 
  ArchitectureInsights 
} from './components/ArchitectureInsights';
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
  getSupabase 
} from './services/supabaseClient';

export default function App() {
  const [items, setItems] = useState<TransferItem[]>([]);
  const [currentRole, setCurrentRole] = useState<TeamRole>('ambos');
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isBatchPasteOpen, setIsBatchPasteOpen] = useState(false);
  const [isSupabaseConfigOpen, setIsSupabaseConfigOpen] = useState(false);
  const [sapModalItems, setSapModalItems] = useState<TransferItem[] | null>(null);
  const [resolutionData, setResolutionData] = useState<{
    items: TransferItem[];
    mode: 'concluir' | 'divergencia';
  } | null>(null);

  // Filtros
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
    const { items: loadedItems, source } = await fetchTransferItems();
    setItems(loadedItems);
    setIsSupabaseConnected(source === 'supabase');
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

  // Criar nova solicitação com múltiplos seriais
  const handleCreateRequest = async (input: NewTransferInput) => {
    const created = createRequestsFromMultiSerial(input, items.length);
    const nextList = [...created, ...items];
    await handleUpdateItems(nextList);
  };

  // Importar em lote
  const handleImportBatch = async (batchItems: TransferItem[]) => {
    const nextList = [...batchItems, ...items];
    await handleUpdateItems(nextList);
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* Header com Navegação e Ações Rápidas */}
      <Header
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        onOpenNewModal={() => setIsNewModalOpen(true)}
        onOpenBatchPaste={() => setIsBatchPasteOpen(true)}
        onOpenSupabaseConfig={() => setIsSupabaseConfigOpen(true)}
        onExportCSV={handleExportCSV}
        isSupabaseConnected={isSupabaseConnected}
        totalPending={kpis.pendentes}
        totalErrors={kpis.divergencias}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner de Diagnóstico e Melhorias da Operação Midea Carrier */}
        <ArchitectureInsights />

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

      {/* Modais do Sistema */}
      <NewRequestModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSubmit={handleCreateRequest}
      />

      <BatchPasteModal
        isOpen={isBatchPasteOpen}
        onClose={() => setIsBatchPasteOpen(false)}
        onImportItems={handleImportBatch}
        currentCount={items.length}
      />

      {sapModalItems && (
        <SAPCopyModal
          isOpen={Boolean(sapModalItems)}
          items={sapModalItems}
          onClose={() => setSapModalItems(null)}
        />
      )}

      {resolutionData && (
        <ResolutionModal
          isOpen={Boolean(resolutionData)}
          items={resolutionData.items}
          mode={resolutionData.mode}
          onClose={() => setResolutionData(null)}
          onSubmit={handleResolutionSubmit}
        />
      )}

      <SupabaseConfigModal
        isOpen={isSupabaseConfigOpen}
        onClose={() => setIsSupabaseConfigOpen(false)}
        onConfigUpdated={loadData}
      />
    </div>
  );
}
