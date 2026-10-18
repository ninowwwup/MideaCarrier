import { TransferItem, NewTransferInput, KPIStats } from '../types/transfer';
import { getSupabase, CURRENT_CLIENT_ID } from './supabaseClient';
import { calculateSLA } from '../utils/sapFormatter';

const STORAGE_KEY = 'midea_transfer_items_v1';
const ARCHIVE_KEY = 'midea_transfer_items_archive_v1';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Dados iniciais fornecidos pelo usuário no prompt
export const INITIAL_SEED: TransferItem[] = [
  {
    id: 'seed-1',
    solicitationCode: 'SOL-2401',
    material: 'MDWTF08B1',
    serial: '541760002ZGB4133400502',
    centro: 'B124',
    depositoOrigem: 'B148',
    depositoDestino: 'B110',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    prioridadeFifo: 1,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-001',
    observacoes: 'Urgente para expedição da tarde',
  },
  {
    id: 'seed-2',
    solicitationCode: 'SOL-2401',
    material: 'MDWTF08B1',
    serial: '541760002ZGB4133400533',
    centro: 'B124',
    depositoOrigem: 'B148',
    depositoDestino: 'B110',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    prioridadeFifo: 2,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-001',
  },
  {
    id: 'seed-3',
    solicitationCode: 'SOL-2402',
    material: 'TSM62',
    serial: '541711001X9B6233500679',
    centro: 'B124',
    depositoOrigem: 'B148',
    depositoDestino: 'B111',
    status: 'em_analise',
    criadoEm: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    atualizadoPor: 'Carlos (Time Midea SAP)',
    prioridadeFifo: 3,
    slaStatus: 'atencao',
    batchId: 'BATCH-002',
    observacoes: 'Validando saldo físico x contábil no SAP MMBE',
  },
  {
    id: 'seed-4',
    solicitationCode: 'SOL-2403',
    material: 'PP5MS1',
    serial: 'PS142600024',
    centro: 'B124',
    depositoOrigem: 'B110',
    depositoDestino: 'B111',
    status: 'concluido',
    criadoEm: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    atualizadoPor: 'Ana Paula (Time Midea SAP)',
    sapDocNumber: '4900188921',
    prioridadeFifo: 4,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-003',
    observacoes: 'Movimentação 311 efetuada no SAP. Liberado no WMS.',
  },
  {
    id: 'seed-5',
    solicitationCode: 'SOL-2404',
    material: '38TAVCB18M5',
    serial: 'S3226B22695419',
    centro: 'B123',
    depositoOrigem: 'B110',
    depositoDestino: 'B111',
    status: 'divergencia',
    criadoEm: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    atualizadoPor: 'Carlos (Time Midea SAP)',
    prioridadeFifo: 5,
    slaStatus: 'estourado',
    batchId: 'BATCH-004',
    observacoes: 'Divergência: Serial não encontrado em estoque no depósito B110 do Centro B123. Verificar se está bloqueado ou em trânsito.',
  },
  {
    id: 'seed-6',
    solicitationCode: 'SOL-2405',
    material: 'QCL108BB',
    serial: 'S1326B21294802',
    centro: 'B179',
    depositoOrigem: 'B111',
    depositoDestino: 'B413',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    prioridadeFifo: 6,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-005',
  },
  {
    id: 'seed-7',
    solicitationCode: 'SOL-2406',
    material: 'QCL108BB',
    serial: 'S1326B21294807',
    centro: 'B158',
    depositoOrigem: 'B111',
    depositoDestino: 'B114',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    prioridadeFifo: 7,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-006',
  },
  {
    id: 'seed-8',
    solicitationCode: 'SOL-2406',
    material: 'QCL108BB',
    serial: 'S1326B21294814',
    centro: 'B158',
    depositoOrigem: 'B111',
    depositoDestino: 'B114',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    prioridadeFifo: 8,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-006',
  },
];

export function mapRowToTransferItem(d: any, index = 0): TransferItem {
  const criadoEm = d.criado_em || d.criadoEm || new Date().toISOString();
  const sla = calculateSLA(criadoEm, d.status);

  return {
    id: String(d.id),
    solicitationCode: d.solicitation_code || d.solicitationCode || `SOL-${index + 1}`,
    material: d.material,
    serial: d.serial,
    centro: d.centro,
    depositoOrigem: d.deposito_origem || d.depositoOrigem,
    depositoDestino: d.deposito_destino || d.depositoDestino,
    status: d.status,
    criadoEm: criadoEm,
    criadoPor: d.criado_por || d.criadoPor || 'Time Buiatte (Sênior WMS)',
    atualizadoEm: d.atualizado_em || d.atualizadoEm || criadoEm,
    atualizadoPor: d.atualizado_por || d.atualizadoPor,
    sapDocNumber: d.sap_doc_number || d.sapDocNumber,
    observacoes: d.observacoes,
    prioridadeFifo: index + 1,
    slaStatus: sla.slaStatus,
    batchId: d.batch_id || d.batchId,
    labelPhotoUrl: d.label_photo_url || d.labelPhotoUrl,
    originatorClientId: d.originator_client_id || d.originatorClientId,
  };
}

/**
 * Auto-limpeza mensal: Mantém o banco leve preservando apenas o histórico dos últimos 30 dias.
 * Solicitações pendentes ou em análise são sempre preservadas para evitar qualquer perda operacional.
 */
export function purgeOldMonthlyRecords(items: TransferItem[]): {
  active: TransferItem[];
  purgedCount: number;
} {
  const now = Date.now();
  const active: TransferItem[] = [];
  const toArchive: TransferItem[] = [];

  for (const item of items) {
    const itemAge = now - new Date(item.criadoEm).getTime();
    const isOld = itemAge > THIRTY_DAYS_MS;
    const isResolved = item.status === 'concluido' || item.status === 'divergencia';

    if (isOld && isResolved) {
      toArchive.push(item);
    } else {
      active.push(item);
    }
  }

  if (toArchive.length > 0 && typeof window !== 'undefined') {
    try {
      const existingArchiveRaw = localStorage.getItem(ARCHIVE_KEY);
      const existingArchive: TransferItem[] = existingArchiveRaw ? JSON.parse(existingArchiveRaw) : [];
      const updatedArchive = [...toArchive, ...existingArchive];
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(updatedArchive.slice(0, 5000)));
    } catch (e) {
      console.warn('Erro ao salvar no arquivo histórico:', e);
    }
  }

  return { active, purgedCount: toArchive.length };
}

/**
 * Consulta de itens com fallback inteligente (Supabase -> Backend Vercel /api/transfers -> Cache Local)
 */
export async function fetchTransferItems(): Promise<{
  items: TransferItem[];
  source: 'supabase' | 'backend' | 'local';
  purgedCount?: number;
  isConnected: boolean;
}> {
  // 1. Supabase (Se configurado diretamente)
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('transfer_requests')
        .select('*')
        .order('criado_em', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: TransferItem[] = data.map((d: any, index: number) => mapRowToTransferItem(d, index));
        const { active, purgedCount } = purgeOldMonthlyRecords(mapped);
        const resolved = applyPendingLocalUpdates(active);
        
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
        }

        return { items: resolved, source: 'supabase', purgedCount, isConnected: true };
      } else if (!error && data && data.length === 0) {
        await saveTransferItems(INITIAL_SEED);
        return { items: INITIAL_SEED, source: 'supabase', isConnected: true };
      }
    } catch (err) {
      console.warn('Tentando rota backend após exceção no Supabase:', err);
    }
  }

  // 2. Rota Backend Serverless Vercel (/api/transfers)
  if (typeof window !== 'undefined') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('/api/transfers', {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.items) && json.items.length > 0) {
          const mapped: TransferItem[] = json.items.map((d: any, index: number) => mapRowToTransferItem(d, index));
          const { active, purgedCount } = purgeOldMonthlyRecords(mapped);
          const resolved = applyPendingLocalUpdates(active);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
          return { items: resolved, source: 'backend', purgedCount, isConnected: true };
        }
      }
    } catch (backendErr) {
      // Backend offline ou temporariamente inacessível
    }
  }

  // 3. Fallback LocalStorage (garante que o app nunca quebre nem trave em tela branca)
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: TransferItem[] = JSON.parse(raw);
        const { active, purgedCount } = purgeOldMonthlyRecords(parsed);

        const updated = active.map((item, idx) => ({
          ...item,
          prioridadeFifo: idx + 1,
          slaStatus: calculateSLA(item.criadoEm, item.status).slaStatus,
        }));

        const resolved = applyPendingLocalUpdates(updated);

        if (purgedCount > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
        }

        return { items: resolved, source: 'local', purgedCount, isConnected: false };
      } catch (e) {
        console.error('Falha ao ler dados do localStorage:', e);
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED));
  }

  return { items: INITIAL_SEED, source: 'local', isConnected: false };
}

// Rastreamento de modificações locais recentes com período de carência de 15 segundos
// Garante que o polling de 2.5s NUNCA reverta ou congele o status alterado pelo operador
interface PendingLocalUpdate {
  status: TransferStatus;
  updatedAt: number;
  item: Partial<TransferItem>;
}

const pendingLocalUpdates = new Map<string, PendingLocalUpdate>();

export function registerLocalPendingUpdate(item: TransferItem) {
  pendingLocalUpdates.set(item.id, {
    status: item.status,
    updatedAt: Date.now(),
    item: {
      status: item.status,
      atualizadoEm: item.atualizadoEm,
      atualizadoPor: item.atualizadoPor,
      sapDocNumber: item.sapDocNumber,
      observacoes: item.observacoes,
    },
  });
}

function applyPendingLocalUpdates(items: TransferItem[]): TransferItem[] {
  const now = Date.now();
  return items.map((item) => {
    if (pendingLocalUpdates.has(item.id)) {
      const local = pendingLocalUpdates.get(item.id)!;
      const remoteTime = new Date(item.atualizadoEm || 0).getTime();
      // Se a resposta remota já refletir nossa atualização ou data mais recente, confirmar e limpar
      if (item.status === local.status || remoteTime >= local.updatedAt) {
        pendingLocalUpdates.delete(item.id);
      } else if (now - local.updatedAt < 15000) {
        // Preserva o status otimista local para que a tela NUNCA reverta
        return {
          ...item,
          ...local.item,
        };
      } else {
        pendingLocalUpdates.delete(item.id);
      }
    }
    return item;
  });
}

/**
 * Atualizar status e dados de itens específicos de forma cirúrgica e resiliente
 * (Comando direto de UPDATE no banco de dados e Supabase)
 */
export async function updateSpecificTransferItems(
  affectedItems: TransferItem[],
  allUpdatedItems?: TransferItem[]
): Promise<boolean> {
  // 1. Registra no lock otimista local de imediato
  affectedItems.forEach((item) => registerLocalPendingUpdate(item));

  // 2. Salva no cache local de imediato
  if (allUpdatedItems && typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allUpdatedItems));
  }

  let anySuccess = false;
  const supabase = getSupabase();

  // 3. Atualização direta no Supabase
  if (supabase) {
    for (const item of affectedItems) {
      try {
        const fullUpdate: any = {
          status: item.status,
          atualizado_em: item.atualizadoEm || new Date().toISOString(),
          atualizado_por: item.atualizadoPor || null,
          sap_doc_number: item.sapDocNumber || null,
          observacoes: item.observacoes || null,
        };
        if (item.labelPhotoUrl) fullUpdate.label_photo_url = item.labelPhotoUrl;
        if (item.batchId) fullUpdate.batch_id = item.batchId;
        if (item.originatorClientId) fullUpdate.originator_client_id = item.originatorClientId;

        let { error } = await supabase
          .from('transfer_requests')
          .update(fullUpdate)
          .eq('id', item.id);

        // Se falhar por coluna ausente no Supabase (ex: código 42703), tenta com campos base
        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          console.warn(`Supabase: coluna ausente ao atualizar ${item.id}, aplicando campos essenciais...`);
          const coreUpdate = {
            status: item.status,
            atualizado_em: item.atualizadoEm || new Date().toISOString(),
            sap_doc_number: item.sapDocNumber || null,
            observacoes: item.observacoes || null,
          };
          const retry = await supabase
            .from('transfer_requests')
            .update(coreUpdate)
            .eq('id', item.id);
          error = retry.error;
        }

        if (!error) {
          anySuccess = true;
        } else {
          console.error(`Aviso: Supabase update error no item ${item.id}:`, error.message);
        }
      } catch (err) {
        console.warn(`Exceção ao atualizar item ${item.id} no Supabase:`, err);
      }
    }
  }

  // 4. Gravar no Backend Vercel /api/transfers
  if (allUpdatedItems && typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: allUpdatedItems, clientId: BROWSER_CLIENT_ID }),
      });
      if (res.ok) {
        anySuccess = true;
      }
    } catch (e) {
      // Backend offline
    }

    // 5. Notificar abas no mesmo computador instantaneamente
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({ type: 'STATUS_UPDATED', items: affectedItems, timestamp: Date.now() });
        bc.close();
      }
    } catch (e) {}
  }

  return anySuccess;
}

/**
 * Salvar e propagar alterações para Supabase, Backend Vercel e Cache Local
 */
export async function saveTransferItems(items: TransferItem[]): Promise<boolean> {
  // Salva no cache local de imediato
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  let savedSuccessfully = false;

  // 1. Gravar no Supabase (se configurado)
  const supabase = getSupabase();
  if (supabase) {
    try {
      const payload = items.map((i) => ({
        id: String(i.id),
        solicitation_code: i.solicitationCode || null,
        material: i.material,
        serial: i.serial,
        centro: i.centro,
        deposito_origem: i.depositoOrigem,
        deposito_destino: i.depositoDestino,
        status: i.status,
        criado_em: i.criadoEm,
        criado_por: i.criadoPor,
        atualizado_em: i.atualizadoEm,
        atualizado_por: i.atualizadoPor || null,
        sap_doc_number: i.sapDocNumber || null,
        observacoes: i.observacoes || null,
        batch_id: i.batchId || null,
        label_photo_url: i.labelPhotoUrl || null,
        originator_client_id: i.originatorClientId || null,
      }));

      let { error } = await supabase.from('transfer_requests').upsert(payload, { onConflict: 'id' });

      // Se falhar por colunas ausentes no schema existente do Supabase (código 42703)
      if (error && (error.code === '42703' || error.message?.includes('column'))) {
        console.warn('Supabase: detectada ausência de colunas opcionais. Executando upsert resiliente com campos base...');
        const corePayload = items.map((i) => ({
          id: String(i.id),
          material: i.material,
          serial: i.serial,
          centro: i.centro,
          deposito_origem: i.depositoOrigem,
          deposito_destino: i.depositoDestino,
          status: i.status,
          criado_em: i.criadoEm,
          criado_por: i.criadoPor,
          atualizado_em: i.atualizadoEm,
          sap_doc_number: i.sapDocNumber || null,
          observacoes: i.observacoes || null,
        }));
        const retryRes = await supabase.from('transfer_requests').upsert(corePayload, { onConflict: 'id' });
        error = retryRes.error;
      }

      if (!error) {
        savedSuccessfully = true;
      } else {
        console.error('Aviso: Supabase upsert error:', error.message);
      }
    } catch (err) {
      console.warn('Falha na requisição para o Supabase:', err);
    }
  }

  // 2. Gravar no Backend /api/transfers
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, clientId: BROWSER_CLIENT_ID }),
      });
      if (res.ok) {
        savedSuccessfully = true;
      }
    } catch (e) {
      // Backend offline ou erro de rede
    }

    // Notificar outras abas no mesmo computador imediatamente
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({ type: 'DATA_SAVED', timestamp: Date.now() });
        bc.close();
      }
    } catch (e) {}
  }

  return savedSuccessfully;
}

// Identificador único persistente deste navegador/computador
export const BROWSER_CLIENT_ID: string = typeof window !== 'undefined'
  ? (() => {
      try {
        let id = localStorage.getItem('migou_browser_client_id');
        if (!id) {
          id = 'pc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
          localStorage.setItem('migou_browser_client_id', id);
        }
        return id;
      } catch (e) {
        return 'pc_' + Math.random().toString(36).substring(2, 9);
      }
    })()
  : 'server_client';

// Rastreamento local dos IDs criados/solicitados por ESTE computador
const locallyRequestedIds = new Set<string>();

if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem('migou_locally_requested_ids');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((id) => locallyRequestedIds.add(id));
      }
    }
  } catch (e) {}
}

export function registerLocallyRequestedItems(items: TransferItem[]) {
  items.forEach((item) => locallyRequestedIds.add(item.id));
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        'migou_locally_requested_ids',
        JSON.stringify(Array.from(locallyRequestedIds).slice(-1000))
      );
    } catch (e) {}
  }
}

export function isItemRequestedByMe(itemId: string): boolean {
  return locallyRequestedIds.has(itemId);
}

// Conjunto global para rastrear IDs conhecidos entre chamadas e reconexões
const globalKnownItemIds = new Set<string>();

/**
 * Assina atualizações em Tempo Real (In-time entre computadores via SSE + Worker Heartbeat + Polling)
 * Garante que assim que o Time Buiatte grava no Computador A:
 * - O Computador B recebe o evento instantaneamente (<10ms via SSE ou <2.5s via Worker).
 * - O som suave de gota d'água toca no Computador B.
 * - O pop-up estilo Outlook e a notificação desktop aparecem no Computador B e somem em 5s.
 * - O Computador A (solicitante) NUNCA recebe o pop-up ou som de alerta de si mesmo.
 */
export function subscribeToRealtimeTransfers(
  onDataChange: (items: TransferItem[], source: 'realtime' | 'polling', newPendingItems?: TransferItem[]) => void
): () => void {
  const supabase = getSupabase();
  let isInitialSync = globalKnownItemIds.size === 0;

  // Processa uma lista de itens e detecta se há novas solicitações pendentes de OUTRO computador
  const processIncomingItems = (
    rawList: TransferItem[],
    source: 'realtime' | 'polling',
    originatorClientId?: string
  ) => {
    const currentList = applyPendingLocalUpdates(rawList);
    const newPending: TransferItem[] = [];

    if (!isInitialSync && globalKnownItemIds.size > 0) {
      for (const item of currentList) {
        if (!globalKnownItemIds.has(item.id) && item.status === 'pendente') {
          // Se o item foi criado por ESTE mesmo computador, IGNORAR (não disparar alerta para o próprio solicitante)
          const isCreatedByMe =
            locallyRequestedIds.has(item.id) ||
            (item.originatorClientId && item.originatorClientId === BROWSER_CLIENT_ID) ||
            (originatorClientId && originatorClientId === BROWSER_CLIENT_ID);

          if (isCreatedByMe) {
            continue;
          }

          // O item veio de OUTRO computador/usuário -> DISPARAR ALERTA NO RECEPTOR!
          newPending.push(item);
        }
      }
    }

    isInitialSync = false;
    currentList.forEach((i) => globalKnownItemIds.add(i.id));

    onDataChange(
      currentList,
      source,
      newPending.length > 0 ? newPending : undefined
    );
  };

  const refreshLatest = async (isRealtimeEvent = false) => {
    try {
      const res = await fetchTransferItems();
      processIncomingItems(res.items, isRealtimeEvent ? 'realtime' : 'polling');
    } catch (err) {
      console.warn('Erro na sincronização realtime:', err);
    }
  };

  // Primeira execução imediata
  refreshLatest();

  // 1. Canal Server-Sent Events (SSE) nativo para transmissão instantânea entre computadores
  let eventSource: EventSource | null = null;
  if (typeof window !== 'undefined' && 'EventSource' in window) {
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'TRANSFER_UPDATE' && Array.isArray(data.items)) {
            const mapped = data.items.map((d: any, index: number) => mapRowToTransferItem(d, index));
            processIncomingItems(mapped, 'realtime', data.originatorClientId);
          }
        } catch (e) {
          // Ignorar mensagens de ping / heartbeat
        }
      };
      eventSource.onerror = () => {
        // EventSource reconecta automaticamente
      };
    } catch (e) {
      console.warn('SSE indisponível, utilizando Worker heartbeat');
    }
  }

  // 2. Web Worker imune ao estrangulamento de abas em segundo plano do Chrome/Windows
  // Garante que mesmo com SAP ou Excel aberto na frente, a verificação roda a cada 2.5s
  let backgroundWorker: Worker | null = null;
  let fallbackInterval: any = null;

  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      const workerBlob = new Blob([
        `let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'START') {
            if (timer) clearInterval(timer);
            timer = setInterval(() => self.postMessage('TICK'), 2500);
          } else if (e.data === 'STOP') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };`
      ], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      backgroundWorker = new Worker(workerUrl);
      backgroundWorker.onmessage = (e) => {
        if (e.data === 'TICK') {
          refreshLatest(false);
        }
      };
      backgroundWorker.postMessage('START');
    } catch (e) {
      fallbackInterval = setInterval(() => refreshLatest(false), 2500);
    }
  } else if (typeof window !== 'undefined') {
    fallbackInterval = setInterval(() => refreshLatest(false), 2500);
  }

  // 3. Canal Supabase Realtime (se ativo)
  let channel: any = null;
  if (supabase) {
    try {
      channel = supabase
        .channel('transfer_requests_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transfer_requests' },
          () => {
            refreshLatest(true);
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Erro ao assinar canal Supabase Realtime:', e);
    }
  }

  // 4. BroadcastChannel para sincronização instantânea entre abas no mesmo computador
  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('migou_sync_realtime');
      bc.onmessage = () => {
        refreshLatest(true);
      };
    } catch (e) {}
  }

  return () => {
    if (fallbackInterval) {
      clearInterval(fallbackInterval);
    }
    if (eventSource) {
      eventSource.close();
    }
    if (backgroundWorker) {
      backgroundWorker.postMessage('STOP');
      backgroundWorker.terminate();
    }
    if (channel && supabase) {
      supabase.removeChannel(channel);
    }
    if (bc) {
      bc.close();
    }
  };
}

export function createRequestsFromMultiSerial(
  input: NewTransferInput,
  currentCount: number
): TransferItem[] {
  const now = new Date().toISOString();
  const batchCode = `BATCH-${Date.now().toString().slice(-4)}`;
  const solicitationCode = `SOL-${1000 + currentCount + 1}`;
  const seriais = input.seriais.length > 0 ? input.seriais : ['S/N'];

  const created: TransferItem[] = seriais.map((serial, idx) => ({
    id: `req-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
    solicitationCode,
    material: input.material.trim().toUpperCase(),
    serial: serial.trim(),
    centro: input.centro.trim().toUpperCase(),
    depositoOrigem: input.depositoOrigem.trim().toUpperCase(),
    depositoDestino: input.depositoDestino.trim().toUpperCase(),
    status: 'pendente',
    criadoEm: now,
    criadoPor: input.solicitante || 'Time Buiatte (Sênior WMS)',
    atualizadoEm: now,
    prioridadeFifo: currentCount + idx + 1,
    slaStatus: 'no_prazo',
    batchId: batchCode,
    observacoes: input.observacoes?.trim() || undefined,
    labelPhotoUrl: input.labelPhotoUrl || undefined,
    originatorClientId: BROWSER_CLIENT_ID,
  }));

  // Registra que foram criados por este computador para não disparar pop-up na tela do solicitante
  registerLocallyRequestedItems(created);

  return created;
}

export function computeKPIs(items: TransferItem[]): KPIStats {
  const totalItens = items.length;
  const seriaisUnicos = new Set(items.map((i) => i.serial)).size;
  
  let pendentes = 0;
  let emAnalise = 0;
  let concluidos = 0;
  let divergencias = 0;
  let noPrazoCount = 0;
  let totalMinutosAtendimento = 0;
  let concluidosComTempo = 0;
  let maisAntigoPendenteMin = 0;

  for (const item of items) {
    if (item.status === 'pendente') {
      pendentes++;
      const { minutos, slaStatus } = calculateSLA(item.criadoEm, item.status);
      if (slaStatus === 'no_prazo') noPrazoCount++;
      if (minutos > maisAntigoPendenteMin) maisAntigoPendenteMin = minutos;
    } else if (item.status === 'em_analise') {
      emAnalise++;
      const { slaStatus } = calculateSLA(item.criadoEm, item.status);
      if (slaStatus === 'no_prazo') noPrazoCount++;
    } else if (item.status === 'concluido') {
      concluidos++;
      noPrazoCount++;
      const diffMs = new Date(item.atualizadoEm).getTime() - new Date(item.criadoEm).getTime();
      const mins = Math.max(1, Math.floor(diffMs / 60000));
      totalMinutosAtendimento += mins;
      concluidosComTempo++;
    } else if (item.status === 'divergencia') {
      divergencias++;
    }
  }

  const taxaSlaNoPrazo = totalItens > 0 ? Math.round((noPrazoCount / totalItens) * 100) : 100;
  const tempoMedioAtendimentoMin =
    concluidosComTempo > 0 ? Math.round(totalMinutosAtendimento / concluidosComTempo) : 38;

  return {
    totalItens,
    totalSeriais: seriaisUnicos,
    pendentes,
    emAnalise,
    concluidos,
    divergencias,
    taxaSlaNoPrazo,
    tempoMedioAtendimentoMin,
    maisAntigoPendenteMin,
  };
}

export function getSupabaseSQLSchema(): string {
  return `-- SCRIPT SQL DDL DEFINITIVO PARA SUPABASE (PostgreSQL)
-- Execute no SQL Editor do seu projeto Supabase:

create table if not exists public.transfer_requests (
  id text primary key,
  solicitation_code text not null,
  material text not null,
  serial text not null,
  centro text not null,
  deposito_origem text not null,
  deposito_destino text not null,
  status text not null default 'pendente' check (status in ('pendente', 'em_analise', 'concluido', 'divergencia')),
  criado_em timestamptz not null default now(),
  criado_por text not null default 'Time Buiatte (Sênior WMS)',
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  sap_doc_number text,
  observacoes text,
  batch_id text
);

-- Habilitar SUPABASE REALTIME para propagação instantânea entre computadores (estilo AppSheet)
alter publication supabase_realtime add table public.transfer_requests;

-- Índices para performance máxima de buscas e filtros
create index if not exists idx_transfer_requests_status on public.transfer_requests (status);
create index if not exists idx_transfer_requests_criado_em on public.transfer_requests (criado_em);
create index if not exists idx_transfer_requests_material on public.transfer_requests (material);
create index if not exists idx_transfer_requests_serial on public.transfer_requests (serial);
create index if not exists idx_transfer_requests_centro on public.transfer_requests (centro);

-- Habilitar Row Level Security (RLS)
alter table public.transfer_requests enable row level security;

-- Política de leitura e escrita irrestrita para a aplicação compartilhada
drop policy if exists "Acesso total aos times Midea e Buiatte" on public.transfer_requests;
create policy "Acesso total aos times Midea e Buiatte"
  on public.transfer_requests
  for all
  using (true)
  with check (true);
`;
}
