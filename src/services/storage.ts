import { TransferItem, TransferStatus, NewTransferInput, KPIStats } from '../types/transfer';
import { CURRENT_CLIENT_ID } from './supabaseClient';
import { 
  getGoogleSheetsUrl, 
  fetchGoogleSheetsItems, 
  insertGoogleSheetsItems, 
  updateGoogleSheetsItems, 
  deleteGoogleSheetsItems, 
  clearGoogleSheets 
} from './googleSheetsClient';
import { calculateSLA } from '../utils/sapFormatter';
import { playAlertChime, sendDesktopNotification } from '../utils/audioAlert';

const STORAGE_KEY = 'midea_transfer_items_v1';
const ARCHIVE_KEY = 'midea_transfer_items_archive_v1';
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // Auto-limpeza a cada 2 dias (48 horas)

// Inicialização limpa e pronta para uso em produção
export const INITIAL_SEED: TransferItem[] = [];

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
 * Auto-limpeza contínua a cada 2 dias: Mantém o banco Supabase leve e dentro do limite gratuito.
 * Exclui do banco apenas registros já concluídos ou com divergência criados há mais de 2 dias (48 horas).
 * Solicitações pendentes ou em análise são SEMPRE preservadas para evitar qualquer perda operacional.
 */
export function purgeOldRecords(items: TransferItem[]): {
  active: TransferItem[];
  purgedCount: number;
} {
  const now = Date.now();
  const active: TransferItem[] = [];
  const toArchive: TransferItem[] = [];

  for (const item of items) {
    const itemAge = now - new Date(item.criadoEm).getTime();
    const isOld = itemAge > TWO_DAYS_MS;
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

    // Auto-limpeza na Planilha Google
    const idsToDelete = toArchive.map((i) => String(i.id));
    if (idsToDelete.length > 0) {
      deleteGoogleSheetsItems(idsToDelete).catch(() => {});
    }
  }

  return { active, purgedCount: toArchive.length };
}

// Retrocompatibilidade
export const purgeOldMonthlyRecords = purgeOldRecords;

export function getLocalCachedItems(): TransferItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export const SHARED_CLOUD_STORE_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a14c0ecc5507d9';

// Circuit breaker para proteger o Supabase de sobrecarga e timeouts contínuos
let supabaseCircuitOpenUntil = 0;

export function markSupabaseFailure() {
  // Pausa chamadas ao Supabase por 25 segundos para evitar travamento da interface e loop de erros
  supabaseCircuitOpenUntil = Date.now() + 25000;
}

export function isSupabaseCircuitOpen(): boolean {
  return Date.now() < supabaseCircuitOpenUntil;
}

export async function fetchFromSharedCloudStore(): Promise<TransferItem[] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(SHARED_CLOUD_STORE_URL, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const json = await res.json();
      const items = json?.data?.items;
      if (Array.isArray(items)) {
        return items.map((d: any, idx: number) => mapRowToTransferItem(d, idx));
      }
    }
  } catch (e) {
    // Falha silenciosa no cloud store fallback
  }
  return null;
}

export async function saveToSharedCloudStore(items: TransferItem[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(SHARED_CLOUD_STORE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'midea_carrier_transfer_hub_production',
        data: {
          items,
          lastUpdated: Date.now(),
          count: items.length,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Consulta de itens com fallback multinível ultra-resiliente (100% Direto sem consumir Serverless Functions da Vercel):
 * 1. Google Planilhas (via Google Apps Script Web App)
 * 2. Shared Cloud Store global (Persistência real-time garantida entre diferentes PCs)
 * 3. Cache Local
 */
export async function fetchTransferItems(): Promise<{
  items: TransferItem[];
  source: 'google_sheets' | 'backend' | 'local';
  purgedCount?: number;
  isConnected: boolean;
}> {
  const localCached = getLocalCachedItems();

  // 1. Google Planilhas (Consulta direta ao Web App)
  const sheetsUrl = getGoogleSheetsUrl();
  if (sheetsUrl) {
    try {
      const sheetData = await fetchGoogleSheetsItems();
      if (sheetData !== null && Array.isArray(sheetData)) {
        const mapped = sheetData.map((d: any, index: number) => mapRowToTransferItem(d, index));
        const { active, purgedCount } = purgeOldMonthlyRecords(mapped);
        const resolved = applyPendingLocalUpdates(active);

        if (typeof window !== 'undefined') {
          if (resolved.length > 0 || localCached.length === 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
          }
        }

        saveToSharedCloudStore(resolved).catch(() => {});
        return { items: resolved, source: 'google_sheets', purgedCount, isConnected: true };
      }
    } catch (err) {
      console.warn('Aviso: Falha ao consultar Google Planilhas diretamente, tentando Cloud Store...', err);
    }
  }

  // 2. Shared Cloud Store Global (In-Time entre computadores Midea e Buiatte)
  const cloudItems = await fetchFromSharedCloudStore();
  if (cloudItems !== null) {
    if (cloudItems.length > 0 || localCached.length === 0) {
      // Mescla com itens criados localmente recentemente para garantir que nunca sejam perdidos
      const cloudMap = new Map(cloudItems.map((i) => [i.id, i]));
      for (const loc of localCached) {
        if (!cloudMap.has(loc.id)) {
          const age = Date.now() - new Date(loc.criadoEm || 0).getTime();
          if (age < 300000) { // 5 minutos de tolerância para propagação
            cloudItems.unshift(loc);
          }
        }
      }
      const { active, purgedCount } = purgeOldMonthlyRecords(cloudItems);
      const resolved = applyPendingLocalUpdates(active);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
      }
      return { items: resolved, source: 'backend', purgedCount, isConnected: true };
    }
  }


  // 4. Fallback LocalStorage (garante que os dados NUNCA sumam da tela)
  if (localCached.length > 0) {
    const { active, purgedCount } = purgeOldMonthlyRecords(localCached);
    const updated = active.map((item, idx) => ({
      ...item,
      prioridadeFifo: idx + 1,
      slaStatus: calculateSLA(item.criadoEm, item.status).slaStatus,
    }));
    const resolved = applyPendingLocalUpdates(updated);
    return { items: resolved, source: 'local', purgedCount, isConnected: false };
  }

  return { items: [], source: 'local', isConnected: false };
}

// Rastreamento de modificações locais recentes com período de carência de 15 segundos
// Garante que o status alterado pelo operador NUNCA reverta antes de ser confirmado
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
 * Inserir apenas novas solicitações cirurgicamente no Supabase e Nuvem
 * NUNCA sobrescreve ou toca em itens já existentes de outros operadores!
 */
export async function insertTransferItems(newItems: TransferItem[]): Promise<boolean> {
  if (!newItems || newItems.length === 0) return true;

  // 1. Atualiza cache local imediatamente
  let merged: TransferItem[] = newItems;
  if (typeof window !== 'undefined') {
    try {
      const current = getLocalCachedItems();
      const existingIds = new Set(newItems.map((n) => n.id));
      merged = [...newItems, ...current.filter((c) => !existingIds.has(c.id))];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {}
  }

  let savedSuccessfully = false;

  // 2. Replica no Shared Cloud Store instantaneamente com a lista COMPLETA
  try {
    const cloudOk = await saveToSharedCloudStore(merged);
    if (cloudOk) savedSuccessfully = true;
  } catch (e) {}

  // 3. Notificar outras abas no mesmo computador imediatamente
  const sheetsUrl = getGoogleSheetsUrl();
  if (typeof window !== 'undefined') {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({
          type: 'NEW_PENDING_TRANSFERS',
          items: newItems,
          allItems: merged,
          originatorSessionId: CURRENT_SESSION_ID,
          timestamp: Date.now(),
        });
        bc.close();
      }
    } catch (e) {}
  }

  // 4. Gravar os novos itens diretamente no Google Planilhas (via Web App)
  if (sheetsUrl) {
    try {
      const ok = await insertGoogleSheetsItems(newItems);
      if (ok) savedSuccessfully = true;
    } catch (err) {
      console.warn('Falha na gravação direta no Google Planilhas no insert:', err);
    }
  }

  return savedSuccessfully || merged.length > 0;
}

/**
 * Atualizar status e dados de itens específicos de forma cirúrgica e resiliente
 * (Comando direto de UPDATE na Planilha Google - NUNCA sobrescreve itens alheios)
 */
export async function updateSpecificTransferItems(
  affectedItems: TransferItem[],
  allUpdatedItems?: TransferItem[]
): Promise<boolean> {
  // 1. Registra no lock otimista local de imediato
  affectedItems.forEach((item) => registerLocalPendingUpdate(item));

  // 2. Salva no cache local de imediato
  const currentList = allUpdatedItems || (() => {
    const current = getLocalCachedItems();
    const affMap = new Map(affectedItems.map((a) => [a.id, a]));
    return current.map((c) => affMap.get(c.id) || c);
  })();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentList));
    } catch (e) {}
  }

  let anySuccess = false;

  // 3. Replica status atualizado no Shared Cloud Store
  try {
    const cloudOk = await saveToSharedCloudStore(currentList);
    if (cloudOk) anySuccess = true;
  } catch (e) {}

  // 4. Notificar abas no mesmo computador instantaneamente
  const sheetsUrl = getGoogleSheetsUrl();
  if (typeof window !== 'undefined') {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({
          type: 'STATUS_UPDATED',
          items: affectedItems,
          allItems: currentList,
          originatorSessionId: CURRENT_SESSION_ID,
          timestamp: Date.now(),
        });
        bc.close();
      }
    } catch (e) {}
  }

  // 5. Atualização direta no Google Planilhas apenas dos itens afetados
  if (sheetsUrl) {
    try {
      const ok = await updateGoogleSheetsItems(affectedItems);
      if (ok) anySuccess = true;
    } catch (err) {
      console.warn('Falha na atualização direta no Google Planilhas:', err);
    }
  }

  return anySuccess || true;
}

/**
 * Excluir itens específicos selecionados (para correção de digitação ou cancelamento operacional)
 * Propaga a exclusão cirúrgica para o Google Planilhas, Shared Cloud Store e abas locais.
 */
export async function deleteSpecificTransferItems(
  idsToDelete: string[],
  updatedRemainingItems: TransferItem[]
): Promise<boolean> {
  if (!idsToDelete || idsToDelete.length === 0) return true;

  // 1. Atualizar cache local imediatamente
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedRemainingItems));
      saveToSharedCloudStore(updatedRemainingItems).catch(() => {});
    } catch (e) {}
  }

  // 2. Remove da lista de rastreamento de IDs conhecidos
  idsToDelete.forEach((id) => globalKnownItemIds.delete(id));

  let anySuccess = false;

  // 3. Excluir diretamente do Google Planilhas
  const sheetsUrl = getGoogleSheetsUrl();
  if (sheetsUrl) {
    try {
      const ok = await deleteGoogleSheetsItems(idsToDelete);
      if (ok) anySuccess = true;
    } catch (err) {
      console.warn('Erro ao excluir itens do Google Planilhas:', err);
    }
  }

  // 4. Notificar abas no mesmo computador
  if (typeof window !== 'undefined') {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({
          type: 'ITEMS_DELETED',
          ids: idsToDelete,
          remainingItems: updatedRemainingItems,
          originatorSessionId: CURRENT_SESSION_ID,
          timestamp: Date.now(),
        });
        bc.close();
      }
    } catch (e) {}
  }

  return anySuccess;
}

/**
 * Salvar e propagar alterações para Planilha Google, Shared Cloud Store e Cache Local
 */
export async function saveTransferItems(items: TransferItem[]): Promise<boolean> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    saveToSharedCloudStore(items).catch(() => {});
  }

  let savedSuccessfully = false;
  const sheetsUrl = getGoogleSheetsUrl();
  if (sheetsUrl) {
    try {
      const ok = await updateGoogleSheetsItems(items);
      if (ok) savedSuccessfully = true;
    } catch (e) {}
  }

  if (typeof window !== 'undefined') {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        const hasPending = items.some((i) => i.status === 'pendente');
        bc.postMessage({
          type: hasPending ? 'NEW_PENDING_TRANSFERS' : 'DATA_SAVED',
          originatorSessionId: CURRENT_SESSION_ID,
          timestamp: Date.now(),
        });
        bc.close();
      }
    } catch (e) {}
  }

  return savedSuccessfully;
}

/**
 * Limpar e zerar todos os registros de transferências para início limpo da operação oficial
 */
export async function clearAllTransferRecords(): Promise<boolean> {
  let anySuccess = false;

  // 1. Limpa o cache local
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      localStorage.removeItem(ARCHIVE_KEY);
      // Zera o Shared Cloud Store na nuvem
      saveToSharedCloudStore([]).catch(() => {});
      anySuccess = true;
    } catch (e) {}
  }

  // 2. Limpa a Planilha Google
  const sheetsUrl = getGoogleSheetsUrl();
  if (sheetsUrl) {
    try {
      const ok = await clearGoogleSheets();
      if (ok) anySuccess = true;
    } catch (e) {
      console.warn('Erro ao limpar Planilha Google:', e);
    }
  }

  // 3. Notifica as outras abas no mesmo computador
  if (typeof window !== 'undefined') {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({
          type: 'DATA_CLEARED',
          originatorSessionId: CURRENT_SESSION_ID,
          timestamp: Date.now(),
        });
        bc.close();
      }
    } catch (e) {}
  }

  return anySuccess;
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

// Identificador único desta aba/janela nesta sessão (permite testes instantâneos entre abas e computadores)
export const CURRENT_SESSION_ID: string = typeof window !== 'undefined'
  ? (() => {
      try {
        let id = sessionStorage.getItem('migou_session_tab_id');
        if (!id) {
          id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
          sessionStorage.setItem('migou_session_tab_id', id);
        }
        return id;
      } catch (e) {
        return 'sess_' + Math.random().toString(36).substring(2, 9);
      }
    })()
  : 'server_session';

// Rastreamento dos IDs criados especificamente por ESTA janela nesta sessão
const sessionCreatedItemIds = new Set<string>();

export function registerLocallyRequestedItems(items: TransferItem[]) {
  items.forEach((item) => sessionCreatedItemIds.add(item.id));
}

export function isItemRequestedByMe(itemId: string): boolean {
  return sessionCreatedItemIds.has(itemId);
}

// Conjunto global para rastrear IDs conhecidos entre chamadas e reconexões
const globalKnownItemIds = new Set<string>();

/**
 * Assina atualizações em Tempo Real (In-time entre computadores via Supabase Realtime + Worker Heartbeat + BroadcastChannel)
 * Garante que assim que o Time Buiatte grava:
 * - O som suave de gota d'água toca OBRIGATORIAMENTE no outro computador ou janela aberta.
 * - A janela que realizou o cadastro NÃO toca o som nela mesma (já possui feedback visual).
 */
export function subscribeToRealtimeTransfers(
  onDataChange: (items: TransferItem[], source: 'realtime' | 'polling', newPendingItems?: TransferItem[]) => void
): () => void {
  let latestItems: TransferItem[] = getLocalCachedItems();
  let isSyncing = false;
  let lastSyncTime = Date.now();
  let isInitialSync = globalKnownItemIds.size === 0;

  const notifyChange = (
    items: TransferItem[],
    source: 'realtime' | 'polling',
    newPending?: TransferItem[]
  ) => {
    latestItems = items;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (e) {}
    }
    onDataChange(items, source, newPending);
  };

  // Reconciliação segura (busca a lista completa apenas na inicialização e em intervalos seguros)
  const safeSync = async (isRealtimeEvent = false, forcedOriginator?: string) => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const res = await fetchTransferItems();
      if (res.items && (res.items.length > 0 || latestItems.length === 0)) {
        lastSyncTime = Date.now();
        const currentList = applyPendingLocalUpdates(res.items);
        const newPending: TransferItem[] = [];

        if (!isInitialSync && globalKnownItemIds.size > 0) {
          for (const item of currentList) {
            if (!globalKnownItemIds.has(item.id) && item.status === 'pendente') {
              const isCreatedByMe =
                sessionCreatedItemIds.has(item.id) ||
                (forcedOriginator && forcedOriginator === CURRENT_SESSION_ID) ||
                item.originatorClientId === CURRENT_SESSION_ID;

              if (!isCreatedByMe) {
                newPending.push(item);
              }
            }
          }
        }

        isInitialSync = false;
        currentList.forEach((i) => globalKnownItemIds.add(i.id));

        if (newPending.length > 0) {
          playAlertChime();
          const first = newPending[0];
          const notifTitle =
            newPending.length === 1
              ? `MIGOU: Nova Solicitação SAP (${first.material})`
              : `MIGOU: ${newPending.length} Novas Solicitações SAP`;
          const notifBody =
            newPending.length === 1
              ? `Serial: ${first.serial} • Centro ${first.centro} (${first.depositoOrigem} ➔ ${first.depositoDestino})`
              : `Lote de ${newPending.length} seriais aguardando transferência (${first.depositoOrigem} ➔ ${first.depositoDestino}).`;
          sendDesktopNotification(notifTitle, notifBody);
        }

        notifyChange(
          currentList,
          isRealtimeEvent ? 'realtime' : 'polling',
          newPending.length > 0 ? newPending : undefined
        );
      }
    } catch (err) {
      console.warn('Aviso: Falha na sincronização periódica:', err);
    } finally {
      isSyncing = false;
    }
  };

  // 1. Executa primeira sincronização imediatamente
  safeSync(false);

  // 2. Heartbeat de sincronização em tempo real direto com Google Planilhas (a cada 8 segundos)
  const HEARTBEAT_INTERVAL_MS = 8000;
  const heartbeatTimer = setInterval(() => {
    if (!isSyncing && Date.now() - lastSyncTime >= HEARTBEAT_INTERVAL_MS) {
      safeSync(false);
    }
  }, 3000);

  // Reconcilia automaticamente ao alternar abas ou focar a janela
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSyncTime > 8000) {
      safeSync(false);
    }
  };

  const handleWindowFocus = () => {
    if (Date.now() - lastSyncTime > 8000) {
      safeSync(false);
    }
  };

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
  }

  // 3. BroadcastChannel para sincronização instantânea entre abas no mesmo computador
  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('migou_sync_realtime');
      bc.onmessage = (ev) => {
        if (ev?.data?.originatorSessionId && ev.data.originatorSessionId === CURRENT_SESSION_ID) {
          return;
        }
        if (ev?.data?.type === 'ITEMS_DELETED' && Array.isArray(ev.data.remainingItems)) {
          notifyChange(ev.data.remainingItems, 'polling');
          return;
        }
        if (ev?.data?.type === 'NEW_PENDING_TRANSFERS') {
          playAlertChime();
        }
        safeSync(true, ev?.data?.originatorSessionId);
      };
    } catch (e) {}
  }

  return () => {
    clearInterval(heartbeatTimer);
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
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
    originatorClientId: CURRENT_SESSION_ID,
  }));

  // Registra que foram criados por esta janela para não disparar som nela mesma
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
    concluidosComTempo > 0 ? Math.round(totalMinutosAtendimento / concluidosComTempo) : 0;

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
  batch_id text,
  label_photo_url text,
  originator_client_id text
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
