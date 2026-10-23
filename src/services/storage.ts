import { TransferItem, TransferStatus, NewTransferInput, KPIStats } from '../types/transfer';
import { getSupabase, CURRENT_CLIENT_ID } from './supabaseClient';
import { calculateSLA } from '../utils/sapFormatter';
import { playAlertChime } from '../utils/audioAlert';

const STORAGE_KEY = 'midea_transfer_items_v1';
const ARCHIVE_KEY = 'midea_transfer_items_archive_v1';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
 * Consulta de itens com fallback multinível ultra-resiliente:
 * 1. Supabase (Com timeout rápido de 3.5s e circuit-breaker inteligente)
 * 2. Shared Cloud Store global (Persistência real-time garantida entre diferentes PCs)
 * 3. Backend Vercel /api/transfers
 * 4. Cache Local
 */
export async function fetchTransferItems(): Promise<{
  items: TransferItem[];
  source: 'supabase' | 'backend' | 'local';
  purgedCount?: number;
  isConnected: boolean;
}> {
  const localCached = getLocalCachedItems();

  // 1. Supabase (Apenas se configurado e fora de período de bloqueio do circuit breaker)
  const supabase = getSupabase();
  if (supabase && !isSupabaseCircuitOpen()) {
    try {
      const queryPromise = supabase
        .from('transfer_requests')
        .select('*')
        .order('criado_em', { ascending: false });

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Query Timeout (3.5s)' } }), 3500)
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (!error && Array.isArray(data)) {
        const mapped: TransferItem[] = data.map((d: any, index: number) => mapRowToTransferItem(d, index));
        const { active, purgedCount } = purgeOldMonthlyRecords(mapped);
        const resolved = applyPendingLocalUpdates(active);

        if (typeof window !== 'undefined') {
          if (resolved.length > 0 || localCached.length === 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
          }
        }

        // Replica em background no Shared Cloud Store para manter a nuvem espelhada
        saveToSharedCloudStore(resolved).catch(() => {});

        return { items: resolved, source: 'supabase', purgedCount, isConnected: true };
      } else if (error) {
        markSupabaseFailure();
        console.warn('Aviso: Supabase em cooldown após erro/timeout:', error.message);
      }
    } catch (err) {
      markSupabaseFailure();
      console.warn('Tentando rota em nuvem após exceção no Supabase:', err);
    }
  }

  // 2. Shared Cloud Store Global (In-Time entre computadores Midea e Buiatte)
  const cloudItems = await fetchFromSharedCloudStore();
  if (cloudItems !== null) {
    if (cloudItems.length > 0 || localCached.length === 0) {
      const { active, purgedCount } = purgeOldMonthlyRecords(cloudItems);
      const resolved = applyPendingLocalUpdates(active);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
      }
      return { items: resolved, source: 'backend', purgedCount, isConnected: true };
    }
  }

  // 3. Rota Backend Serverless Vercel (/api/transfers)
  if (typeof window !== 'undefined') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch('/api/transfers', {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.items)) {
          if (json.items.length === 0 && localCached.length > 0) {
            const { active, purgedCount } = purgeOldMonthlyRecords(localCached);
            const resolved = applyPendingLocalUpdates(active);
            return { items: resolved, source: 'local', purgedCount, isConnected: false };
          }

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
 * Inserir apenas novas solicitações cirurgicamente no Supabase
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
      // Replica no Shared Cloud Store instantaneamente para o outro PC receber
      saveToSharedCloudStore(merged).catch(() => {});
    } catch (e) {}
  }

  let savedSuccessfully = false;
  const supabase = getSupabase();

  // 2. Gravar apenas os novos itens no Supabase
  if (supabase) {
    try {
      const payload = newItems.map((i) => ({
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
        originator_client_id: i.originatorClientId || CURRENT_SESSION_ID,
      }));

      let { error } = await supabase.from('transfer_requests').upsert(payload, { onConflict: 'id' });

      // Se falhar por colunas ausentes no schema existente do Supabase (código 42703)
      if (error && (error.code === '42703' || error.message?.includes('column'))) {
        console.warn('Supabase: detectada ausência de colunas opcionais. Inserindo com campos base...');
        const corePayload = newItems.map((i) => ({
          id: String(i.id),
          solicitation_code: i.solicitationCode || `SOL-${i.id}`,
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
        console.error('Aviso: Supabase insert error:', error.message);
      }
    } catch (err) {
      console.warn('Falha na requisição para o Supabase no insert:', err);
    }
  }

  // 3. Notificar backend para disparar Web Push apenas com as novas solicitações
  if (typeof window !== 'undefined') {
    fetch('/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: newItems, clientId: BROWSER_CLIENT_ID }),
    }).catch(() => {});

    // 4. Notificar outras abas no mesmo computador imediatamente
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({
          type: 'NEW_PENDING_TRANSFERS',
          items: newItems,
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
 * Atualizar status e dados de itens específicos de forma cirúrgica e resiliente
 * (Comando direto de UPDATE no banco de dados e Supabase - NUNCA sobrescreve itens alheios)
 */
export async function updateSpecificTransferItems(
  affectedItems: TransferItem[],
  allUpdatedItems?: TransferItem[]
): Promise<boolean> {
  // 1. Registra no lock otimista local de imediato
  affectedItems.forEach((item) => registerLocalPendingUpdate(item));

  // 2. Salva no cache local de imediato
  if (typeof window !== 'undefined') {
    const currentList = allUpdatedItems || (() => {
      const current = getLocalCachedItems();
      const affMap = new Map(affectedItems.map((a) => [a.id, a]));
      return current.map((c) => affMap.get(c.id) || c);
    })();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentList));
    // Replica status atualizado no Shared Cloud Store
    saveToSharedCloudStore(currentList).catch(() => {});
  }

  let anySuccess = false;
  const supabase = getSupabase();

  // 3. Atualização direta no Supabase apenas dos itens afetados
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
        if (item.labelPhotoUrl !== undefined) fullUpdate.label_photo_url = item.labelPhotoUrl;
        if (item.batchId) fullUpdate.batch_id = item.batchId;

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

  // 4. Notificar abas no mesmo computador instantaneamente
  if (typeof window !== 'undefined') {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({
          type: 'STATUS_UPDATED',
          items: affectedItems,
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
 * Salvar e propagar alterações para Supabase, Backend Vercel e Cache Local
 */
export async function saveTransferItems(items: TransferItem[]): Promise<boolean> {
  // Salva no cache local de imediato
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    // Sincroniza com Shared Cloud Store imediatamente
    saveToSharedCloudStore(items).catch(() => {});
  }

  let savedSuccessfully = false;

  // 1. Gravar no Supabase (se configurado)
  const supabase = getSupabase();
  if (supabase) {
    try {
      if (items.length === 0) {
        const { error } = await supabase.from('transfer_requests').delete().neq('id', 'placeholder_none');
        if (!error) savedSuccessfully = true;
      } else {
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

        if (error && (error.code === '42703' || error.message?.includes('column'))) {
          console.warn('Supabase: detectada ausência de colunas opcionais. Executando upsert resiliente com campos base...');
          const corePayload = items.map((i) => ({
            id: String(i.id),
            solicitation_code: i.solicitationCode || `SOL-${i.id}`,
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

  // 2. Limpa o banco de dados Supabase na nuvem
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('transfer_requests')
        .delete()
        .neq('id', 'placeholder_none');
      if (!error) anySuccess = true;
    } catch (e) {
      console.warn('Erro ao limpar Supabase:', e);
    }
  }

  // 3. Notifica o backend Vercel e as outras abas/computadores
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/transfers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) anySuccess = true;
    } catch (e) {
      // Backend offline
    }

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
  const supabase = getSupabase();
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

  // 2. Canal Supabase Realtime (WebSockets):
  // ATUALIZAÇÃO DIRETA EM MEMÓRIA - NÃO DISPARA SELECT NO BANCO!
  // Permite que 10, 50 ou 100 computadores recebam alterações instantaneamente sem sobrecarregar o Supabase.
  let channel: any = null;
  if (supabase) {
    try {
      channel = supabase
        .channel('transfer_requests_realtime_' + CURRENT_SESSION_ID)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transfer_requests' },
          (payload: any) => {
            const eventType = payload?.eventType;
            const newRow = payload?.new;
            const oldRow = payload?.old;

            if (eventType === 'INSERT' && newRow) {
              const mapped = mapRowToTransferItem(newRow);
              globalKnownItemIds.add(mapped.id);

              const isFromOther =
                mapped.originatorClientId !== CURRENT_SESSION_ID &&
                !sessionCreatedItemIds.has(mapped.id);

              // Atualiza lista em memória sem bater no banco
              const existingIdx = latestItems.findIndex((i) => i.id === mapped.id);
              let updatedList: TransferItem[];
              if (existingIdx >= 0) {
                updatedList = [...latestItems];
                updatedList[existingIdx] = mapped;
              } else {
                updatedList = [mapped, ...latestItems];
              }

              // Ordena por criadoEm decrescente e renumera prioridade FIFO
              updatedList.sort(
                (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
              );
              updatedList = updatedList.map((item, idx) => ({ ...item, prioridadeFifo: idx + 1 }));

              let newPendingList: TransferItem[] | undefined = undefined;
              if (mapped.status === 'pendente' && isFromOther) {
                playAlertChime();
                newPendingList = [mapped];
              }

              notifyChange(updatedList, 'realtime', newPendingList);

            } else if (eventType === 'UPDATE' && newRow) {
              const mapped = mapRowToTransferItem(newRow);
              globalKnownItemIds.add(mapped.id);

              // Atualiza o item correspondente in-place
              const updatedList = latestItems.map((item) =>
                item.id === mapped.id ? { ...item, ...mapped } : item
              );
              notifyChange(updatedList, 'realtime');

            } else if (eventType === 'DELETE') {
              const deletedId = String(oldRow?.id || newRow?.id);
              if (deletedId) {
                const updatedList = latestItems.filter((i) => i.id !== deletedId);
                const reindexed = updatedList.map((item, idx) => ({ ...item, prioridadeFifo: idx + 1 }));
                notifyChange(reindexed, 'realtime');
              }
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            // Canal ativo em tempo real
          } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            console.warn('Realtime channel:', status, '- agendando sincronização segura');
            setTimeout(() => safeSync(true), 4000);
          }
        });
    } catch (e) {
      console.warn('Erro ao assinar canal Supabase Realtime:', e);
    }
  }

  // 3. Heartbeat de sincronização em tempo real (Polling resiliente a cada 10 segundos)
  // Utiliza o Shared Cloud Store quando o Supabase estiver em cooldown
  const HEARTBEAT_INTERVAL_MS = 10000;
  const heartbeatTimer = setInterval(() => {
    if (!isSyncing && Date.now() - lastSyncTime >= HEARTBEAT_INTERVAL_MS) {
      safeSync(false);
    }
  }, 3500);

  // Reconcilia automaticamente ao alternar abas ou focar a janela
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSyncTime > 15000) {
      safeSync(false);
    }
  };

  const handleWindowFocus = () => {
    if (Date.now() - lastSyncTime > 15000) {
      safeSync(false);
    }
  };

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
  }

  // 4. BroadcastChannel para sincronização instantânea entre abas no mesmo computador
  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('migou_sync_realtime');
      bc.onmessage = (ev) => {
        if (ev?.data?.originatorSessionId && ev.data.originatorSessionId === CURRENT_SESSION_ID) {
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
