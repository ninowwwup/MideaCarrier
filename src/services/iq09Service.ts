import {
  IQ09Item,
  IQ09Snapshot,
  IQ09SnapshotMetadata,
  IQ09BatchValidationItem,
  IQ09QueueItemAudit,
} from '../types/iq09';
import { TransferItem } from '../types/transfer';
import {
  SAP_CENTROS_CATALOG,
  SAP_DEPOSITOS_CATALOG,
  DEFINITIVE_DAMAGE_DEPOSITS,
  extractSerialsFromInput,
} from '../utils/sapFormatter';
import {
  getGoogleSheetsUrl,
  insertGoogleSheetsItems,
  deleteGoogleSheetsItems,
} from './googleSheetsClient';

const IDB_NAME = 'migou_iq09_database_v1';
const IDB_STORE = 'iq09_snapshot_store';
const IDB_KEY = 'active_snapshot';
const LOCAL_META_KEY = 'migou_iq09_meta_v1';
const LOCAL_ITEMS_FALLBACK_KEY = 'migou_iq09_items_fallback_v1';

// Prefixo especial para sincronizar snapshot compacto na nuvem (Google Sheets) sem misturar com TransferItem
export const IQ09_CLOUD_ROW_PREFIX = '__IQ09_SYNC_';
const MAX_CLOUD_CHUNKS = 12; // Até ~30.000 seriais sincronizados automaticamente na nuvem
const ITEMS_PER_CLOUD_CHUNK = 2200;

// Cache em memória ultra-rápido (O(1) por UII/Serial)
let memorySnapshot: IQ09Snapshot | null = null;
let memorySerialMap: Map<string, IQ09Item> = new Map();
let memoryEquipmentMap: Map<string, IQ09Item> = new Map();
const snapshotListeners = new Set<(snapshot: IQ09Snapshot | null) => void>();

function rebuildMemoryMaps(snapshot: IQ09Snapshot | null) {
  memorySnapshot = snapshot;
  memorySerialMap = new Map();
  memoryEquipmentMap = new Map();

  if (snapshot && Array.isArray(snapshot.items)) {
    for (const item of snapshot.items) {
      if (item.serial) {
        memorySerialMap.set(item.serial.toUpperCase(), item);
      }
      if (item.equipamento) {
        memoryEquipmentMap.set(item.equipamento.toUpperCase(), item);
      }
    }
  }
}

function notifySnapshotListeners() {
  snapshotListeners.forEach((cb) => {
    try {
      cb(memorySnapshot);
    } catch (e) {
      console.warn('Erro ao notificar listener IQ09:', e);
    }
  });
}

export function subscribeToIQ09Snapshot(
  callback: (snapshot: IQ09Snapshot | null) => void
): () => void {
  snapshotListeners.add(callback);
  if (memorySnapshot) {
    callback(memorySnapshot);
  }
  return () => {
    snapshotListeners.delete(callback);
  };
}

/**
 * Busca instantânea O(1) de um serial (UII) ou Equipamento na base IQ09 ativa em memória
 */
export function lookupSerialInIQ09(serialOrUii: string): IQ09Item | undefined {
  if (!serialOrUii) return undefined;
  const clean = serialOrUii.trim().toUpperCase();
  return memorySerialMap.get(clean) || memoryEquipmentMap.get(clean);
}

/**
 * Retorna o snapshot atual em memória (se carregado)
 */
export function getMemoryIQ09Snapshot(): IQ09Snapshot | null {
  return memorySnapshot;
}

/**
 * Retorna os metadados salvos localmente de forma síncrona (para renderização imediata no Header/Abas)
 */
export function getStoredIQ09Metadata(): IQ09SnapshotMetadata | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IQ09SnapshotMetadata;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// CAMADA INDEXEDDB (SUPORTA 50.000+ LINHAS DA IQ09 SEM ESTOURAR LOCALSTORAGE)
// ============================================================================

function openIQ09Database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB não suportado'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSnapshotToIndexedDB(snapshot: IQ09Snapshot): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(LOCAL_META_KEY, JSON.stringify(snapshot.metadata));
  } catch (e) {}

  // Salva no IndexedDB (capacidade de centenas de MBs)
  try {
    const db = await openIQ09Database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(snapshot, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (e) {
    // Fallback em localStorage caso IndexedDB esteja bloqueado em aba anônima restrita
    try {
      localStorage.setItem(LOCAL_ITEMS_FALLBACK_KEY, JSON.stringify(snapshot));
    } catch (err) {
      console.warn('Aviso: Base IQ09 muito grande para fallback localStorage, mantida em memória.');
    }
  }
}

export async function loadIQ09SnapshotFromStorage(): Promise<IQ09Snapshot | null> {
  if (memorySnapshot) return memorySnapshot;
  if (typeof window === 'undefined') return null;

  try {
    const db = await openIQ09Database();
    const snap = await new Promise<IQ09Snapshot | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_KEY);
      getReq.onsuccess = () => {
        db.close();
        resolve((getReq.result as IQ09Snapshot) || null);
      };
      getReq.onerror = () => {
        db.close();
        reject(getReq.error);
      };
    });

    if (snap && snap.metadata && Array.isArray(snap.items)) {
      rebuildMemoryMaps(snap);
      notifySnapshotListeners();
      return snap;
    }
  } catch (e) {}

  // Fallback localStorage
  try {
    const raw = localStorage.getItem(LOCAL_ITEMS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as IQ09Snapshot;
      if (parsed && parsed.metadata && Array.isArray(parsed.items)) {
        rebuildMemoryMaps(parsed);
        notifySnapshotListeners();
        return parsed;
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Limpa a base IQ09 local e na nuvem (caso o administrador queira zerar a fotografia)
 */
export async function clearIQ09Snapshot(): Promise<void> {
  rebuildMemoryMaps(null);
  notifySnapshotListeners();

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(LOCAL_META_KEY);
      localStorage.removeItem(LOCAL_ITEMS_FALLBACK_KEY);
    } catch (e) {}

    try {
      const db = await openIQ09Database();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      });
    } catch (e) {}

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('migou_sync_realtime');
        bc.postMessage({ type: 'IQ09_SNAPSHOT_CLEARED', timestamp: Date.now() });
        bc.close();
      }
    } catch (e) {}
  }

  // Remove chunks da nuvem
  const sheetsUrl = getGoogleSheetsUrl();
  if (sheetsUrl) {
    const chunkIds = Array.from({ length: MAX_CLOUD_CHUNKS }, (_, i) => `${IQ09_CLOUD_ROW_PREFIX}${i}__`);
    deleteGoogleSheetsItems(chunkIds).catch(() => {});
  }
}

// ============================================================================
// SINCRONIZAÇÃO DE SNAPSHOT NA NUVEM (OVERWRITE SEM ACÚMULO)
// ============================================================================

function serializeItemsChunk(items: IQ09Item[]): string {
  return items
    .map((it) =>
      [
        it.material,
        it.serial,
        it.centro,
        it.deposito,
        it.tipoEstoque || '01',
        it.statusSistema || 'DEPS',
        it.modificadoEm || '',
        it.modificadoPor || '',
        it.equipamento || '',
        it.estqEspecial || '',
        it.ordemCliente || '',
      ].join('\t')
    )
    .join('\n');
}

function deserializeItemsChunk(raw: string): IQ09Item[] {
  if (!raw) return [];
  const lines = raw.split('\n');
  const out: IQ09Item[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const p = line.split('\t');
    if (p.length >= 4 && p[1]) {
      out.push({
        material: p[0] || '',
        serial: p[1] || '',
        centro: p[2] || '',
        deposito: p[3] || '',
        tipoEstoque: p[4] || '01',
        statusSistema: p[5] || 'DEPS',
        modificadoEm: p[6] || undefined,
        modificadoPor: p[7] || undefined,
        equipamento: p[8] || undefined,
        estqEspecial: p[9] || undefined,
        ordemCliente: p[10] || undefined,
      });
    }
  }
  return out;
}

/**
 * Grava o Snapshot sobrescrevendo os chunks anteriores na Planilha Google
 * para que outros computadores recebam a base IQ09 automaticamente sem precisar do WhatsApp.
 */
async function syncSnapshotToCloud(snapshot: IQ09Snapshot): Promise<void> {
  const sheetsUrl = getGoogleSheetsUrl();
  if (!sheetsUrl) return;

  try {
    // 1. Limpa chunks anteriores para garantir zero acúmulo
    const allPossibleIds = Array.from(
      { length: MAX_CLOUD_CHUNKS },
      (_, i) => `${IQ09_CLOUD_ROW_PREFIX}${i}__`
    );
    await deleteGoogleSheetsItems(allPossibleIds).catch(() => {});

    // 2. Divide os itens em blocos compactos (respeitando o limite de 50.000 chars por célula do Google Sheets)
    const itemsToSync = snapshot.items.slice(0, MAX_CLOUD_CHUNKS * ITEMS_PER_CLOUD_CHUNK);
    const totalChunks = Math.max(1, Math.ceil(itemsToSync.length / ITEMS_PER_CLOUD_CHUNK));
    const pseudoRows: TransferItem[] = [];

    for (let c = 0; c < totalChunks; c++) {
      const slice = itemsToSync.slice(c * ITEMS_PER_CLOUD_CHUNK, (c + 1) * ITEMS_PER_CLOUD_CHUNK);
      // Divide o slice em 2 colunas de texto grande (observacoes e labelPhotoUrl) para caber ~2.200 seriais por linha
      const mid = Math.ceil(slice.length / 2);
      const part1 = serializeItemsChunk(slice.slice(0, mid));
      const part2 = serializeItemsChunk(slice.slice(mid));

      pseudoRows.push({
        id: `${IQ09_CLOUD_ROW_PREFIX}${c}__`,
        solicitationCode: `IQ09-CHUNK-${c}/${totalChunks}`,
        material: '__IQ09_SYSTEM_SNAPSHOT__',
        serial: snapshot.metadata.snapshotId,
        centro: String(totalChunks),
        depositoOrigem: String(c),
        depositoDestino: String(snapshot.metadata.totalItems),
        status: 'concluido',
        criadoEm: snapshot.metadata.updatedAt,
        criadoPor: snapshot.metadata.updatedBy,
        atualizadoEm: snapshot.metadata.updatedAt,
        atualizadoPor: c === 0 ? JSON.stringify(snapshot.metadata) : snapshot.metadata.fileName,
        sapDocNumber: 'IQ09-SYNC',
        observacoes: part1,
        labelPhotoUrl: part2,
        prioridadeFifo: 99999 + c,
        slaStatus: 'no_prazo',
      });
    }

    await insertGoogleSheetsItems(pseudoRows);
  } catch (err) {
    console.warn('Aviso ao sincronizar snapshot IQ09 na nuvem:', err);
  }
}

/**
 * Reconstrói automaticamente a base IQ09 caso venham linhas __IQ09_SYNC_ da leitura da nuvem
 */
export async function processIncomingCloudIQ09Rows(rawCloudRows: any[]): Promise<void> {
  if (!rawCloudRows || rawCloudRows.length === 0) return;

  const sorted = [...rawCloudRows].sort((a, b) => {
    const idxA = Number(a.deposito_origem || a.depositoOrigem || 0);
    const idxB = Number(b.deposito_origem || b.depositoOrigem || 0);
    return idxA - idxB;
  });

  const first = sorted[0];
  const incomingSnapshotId = String(first.serial || '');
  if (!incomingSnapshotId) return;

  // Se já temos exatamente este snapshot carregado em memória, não precisa reprocessar
  if (memorySnapshot && memorySnapshot.metadata.snapshotId === incomingSnapshotId) {
    return;
  }

  // Se o snapshot em memória for mais recente que o da nuvem, preserva o mais recente
  const incomingTime = new Date(first.criado_em || first.criadoEm || 0).getTime();
  const currentMemoryTime = memorySnapshot
    ? new Date(memorySnapshot.metadata.updatedAt || 0).getTime()
    : 0;
  if (memorySnapshot && currentMemoryTime > incomingTime) {
    return;
  }

  let metadata: IQ09SnapshotMetadata | null = null;
  try {
    const rawMeta = first.atualizado_por || first.atualizadoPor;
    if (rawMeta && String(rawMeta).startsWith('{')) {
      metadata = JSON.parse(String(rawMeta));
    }
  } catch (e) {}

  const items: IQ09Item[] = [];
  for (const row of sorted) {
    const part1 = String(row.observacoes || '');
    const part2 = String(row.label_photo_url || row.labelPhotoUrl || '');
    if (part1) items.push(...deserializeItemsChunk(part1));
    if (part2) items.push(...deserializeItemsChunk(part2));
  }

  if (items.length === 0) return;

  if (!metadata) {
    metadata = buildSnapshotMetadata(
      items,
      String(first.criado_por || first.criadoPor || 'Time Midea (SAP)'),
      'IQ09_Nuvem.xlsx',
      'cloud_sync',
      incomingSnapshotId,
      String(first.criado_em || first.criadoEm || new Date().toISOString())
    );
  }

  const snapshot: IQ09Snapshot = { metadata, items };
  rebuildMemoryMaps(snapshot);
  await saveSnapshotToIndexedDB(snapshot);
  notifySnapshotListeners();
}

// ============================================================================
// CONSTRUTOR DE METADADOS E PERSISTÊNCIA DO SNAPSHOT ATIVO
// ============================================================================

function buildSnapshotMetadata(
  items: IQ09Item[],
  updatedBy: string,
  fileName: string,
  sourceType: IQ09SnapshotMetadata['sourceType'],
  customId?: string,
  customUpdatedAt?: string
): IQ09SnapshotMetadata {
  const centrosCount: Record<string, number> = {};
  const depositosCount: Record<string, number> = {};
  const materialsSet = new Set<string>();

  for (const item of items) {
    if (item.material) materialsSet.add(item.material);
    if (item.centro) {
      centrosCount[item.centro] = (centrosCount[item.centro] || 0) + 1;
    }
    if (item.deposito) {
      depositosCount[item.deposito] = (depositosCount[item.deposito] || 0) + 1;
    }
  }

  return {
    snapshotId: customId || `iq09_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    updatedAt: customUpdatedAt || new Date().toISOString(),
    updatedBy: updatedBy || 'Time Midea (SAP)',
    fileName: fileName || 'Base_IQ09_SAP.xlsx',
    totalItems: items.length,
    uniqueMaterials: materialsSet.size,
    centrosCount,
    depositosCount,
    sourceType,
  };
}

/**
 * Substitui 100% a base IQ09 anterior pela nova fotografia importada (Snapshot Overwrite)
 */
export async function saveAndActivateIQ09Snapshot(
  items: IQ09Item[],
  options: {
    updatedBy: string;
    fileName: string;
    sourceType: IQ09SnapshotMetadata['sourceType'];
  }
): Promise<IQ09Snapshot> {
  // Deduplica por UII/Serial mantendo a última ocorrência na planilha
  const dedupMap = new Map<string, IQ09Item>();
  for (const item of items) {
    const key = item.serial.trim().toUpperCase();
    if (key) {
      dedupMap.set(key, {
        ...item,
        serial: key,
        material: item.material.trim().toUpperCase(),
        centro: item.centro.trim().toUpperCase(),
        deposito: item.deposito.trim().toUpperCase(),
        tipoEstoque: (item.tipoEstoque || '01').trim(),
        statusSistema: (item.statusSistema || 'DEPS').trim().toUpperCase(),
      });
    }
  }

  const cleanItems = Array.from(dedupMap.values());
  const metadata = buildSnapshotMetadata(
    cleanItems,
    options.updatedBy,
    options.fileName,
    options.sourceType
  );

  const snapshot: IQ09Snapshot = {
    metadata,
    items: cleanItems,
  };

  rebuildMemoryMaps(snapshot);
  await saveSnapshotToIndexedDB(snapshot);
  notifySnapshotListeners();

  // Notifica outras abas no mesmo PC imediatamente
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      const bc = new BroadcastChannel('migou_sync_realtime');
      bc.postMessage({
        type: 'IQ09_SNAPSHOT_UPDATED',
        snapshotId: metadata.snapshotId,
        timestamp: Date.now(),
      });
      bc.close();
    } catch (e) {}
  }

  // Sincroniza em segundo plano para a nuvem
  syncSnapshotToCloud(snapshot).catch(() => {});

  return snapshot;
}

// ============================================================================
// LEITOR NATIVO DE ARQUIVOS EXCEL (.XLSX), CSV, TXT SAP E COLAGEM (ZERO DEPENDÊNCIAS)
// ============================================================================

function unescapeXml(str: string): string {
  if (!str || !str.includes('&')) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function colLettersToIndex(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      col = col * 26 + (code - 64);
    } else if (code >= 97 && code <= 122) {
      col = col * 26 + (code - 96);
    }
  }
  return col - 1;
}

/**
 * Converte número serial de data do Excel (ex: 46176 -> 03/06/2026) se aplicável
 */
function formatExcelDateIfNumber(val: string): string {
  const trimmed = (val || '').trim();
  if (!trimmed || trimmed.includes('#')) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [y, m, d] = trimmed.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const num = Number(trimmed);
  if (!Number.isNaN(num) && num >= 35000 && num <= 65000) {
    // 25569 = 01/01/1970 no calendário Excel
    const utcDays = Math.floor(num - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return trimmed;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Seu navegador não suporta descompactação nativa de arquivos .xlsx. Salve como .csv ou cole os dados.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressed as unknown as BufferSource).catch(() => {});
  writer.close().catch(() => {});

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLen += value.byteLength;
    }
  }

  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const ch of chunks) {
    merged.set(ch, offset);
    offset += ch.byteLength;
  }

  return new TextDecoder('utf-8').decode(merged);
}

/**
 * Descompacta arquivo .XLSX (ZIP Office Open XML) direto no navegador via C++ DecompressionStream
 */
async function extractXlsxRowsFromArrayBuffer(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // 1. Localizar End of Central Directory (PK\x05\x06 = 0x06054b50)
  let eocdOffset = -1;
  const minSearch = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Arquivo .xlsx inválido ou corrompido (EOCD não encontrado).');
  }

  const cdEntriesCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const entries = new Map<
    string,
    { compressionMethod: number; compressedSize: number; localHeaderOffset: number }
  >();

  let ptr = cdOffset;
  const nameDecoder = new TextDecoder('utf-8');

  for (let i = 0; i < cdEntriesCount; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = nameDecoder.decode(bytes.subarray(ptr + 46, ptr + 46 + fileNameLen));
    entries.set(fileName, { compressionMethod, compressedSize, localHeaderOffset });

    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  const readZipEntryText = async (entryName: string): Promise<string | null> => {
    const info = entries.get(entryName);
    if (!info) return null;
    const lho = info.localHeaderOffset;
    if (lho + 30 > bytes.length || view.getUint32(lho, true) !== 0x04034b50) return null;
    const localNameLen = view.getUint16(lho + 26, true);
    const localExtraLen = view.getUint16(lho + 28, true);
    const dataStart = lho + 30 + localNameLen + localExtraLen;
    const slice = bytes.subarray(dataStart, dataStart + info.compressedSize);

    if (info.compressionMethod === 0) {
      return new TextDecoder('utf-8').decode(slice);
    } else if (info.compressionMethod === 8) {
      return await inflateRawBytes(slice);
    }
    return null;
  };

  // 2. Ler tabela de strings compartilhadas (xl/sharedStrings.xml)
  const sharedStrings: string[] = [];
  const sharedStringsXml = await readZipEntryText('xl/sharedStrings.xml');
  if (sharedStringsXml) {
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(sharedStringsXml)) !== null) {
      const inner = siMatch[1];
      let text = '';
      let tMatch: RegExpExecArray | null;
      tRegex.lastIndex = 0;
      while ((tMatch = tRegex.exec(inner)) !== null) {
        text += unescapeXml(tMatch[1]);
      }
      sharedStrings.push(text);
    }
  }

  // 3. Encontrar a aba principal (sheet1.xml ou primeira worksheet disponível)
  let sheetEntryName = 'xl/worksheets/sheet1.xml';
  if (!entries.has(sheetEntryName)) {
    const found = Array.from(entries.keys())
      .filter((k) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'))
      .sort()[0];
    if (found) sheetEntryName = found;
  }

  const sheetXml = await readZipEntryText(sheetEntryName);
  if (!sheetXml) {
    throw new Error('Planilha interna (sheet1.xml) não encontrada dentro do arquivo .xlsx.');
  }

  // 4. Extrair linhas e células respeitando a coordenada exata da coluna (A=0, B=1, ..., P=15)
  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const refAttrRegex = /\br="([A-Za-z]+)\d+"/;
  const typeAttrRegex = /\bt="([^"]+)"/;
  const vTagRegex = /<v>([\s\S]*?)<\/v>/;
  const inlineTRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowInner = rowMatch[1];
    const currentRow: string[] = [];
    let nextFallbackCol = 0;

    cellRegex.lastIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowInner)) !== null) {
      const attrs = cellMatch[1] || '';
      const cellContent = cellMatch[2] || '';

      const refMatch = refAttrRegex.exec(attrs);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : nextFallbackCol;
      nextFallbackCol = colIdx + 1;

      if (!cellContent) {
        currentRow[colIdx] = '';
        continue;
      }

      const typeMatch = typeAttrRegex.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      let cellValue = '';
      if (cellType === 's') {
        const vMatch = vTagRegex.exec(cellContent);
        if (vMatch) {
          const strIdx = parseInt(vMatch[1], 10);
          cellValue = sharedStrings[strIdx] ?? '';
        }
      } else if (cellType === 'inlineStr') {
        inlineTRegex.lastIndex = 0;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = inlineTRegex.exec(cellContent)) !== null) {
          cellValue += unescapeXml(tMatch[1]);
        }
      } else {
        const vMatch = vTagRegex.exec(cellContent);
        if (vMatch) {
          cellValue = unescapeXml(vMatch[1]);
        }
      }

      currentRow[colIdx] = cellValue.trim();
    }

    if (currentRow.some((c) => c && c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normaliza nome de cabeçalho para mapeamento inteligente das colunas da IQ09
 */
function normalizeHeaderName(h: string): string {
  return (h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Converte matriz de células (de .XLSX, .CSV ou Colagem) em registros estruturados IQ09Item[]
 * Reconhece nativamente o formato real da Midea Carrier:
 * Material | UII | Centro | Depósito | Tipo de estoque | Status sistema | ... | Modificado em | Modificado por | ... | Equipamento
 */
export function mapMatrixToIQ09Items(rows: string[][]): IQ09Item[] {
  if (!rows || rows.length === 0) return [];

  let headerRowIdx = -1;
  let colMap = {
    material: 0,
    serial: 1, // UII
    centro: 2,
    deposito: 3,
    tipoEstoque: 4,
    statusSistema: 5,
    estqEspecial: 8,
    ordemCliente: 9,
    modificadoEm: 11,
    modificadoPor: 12,
    equipamento: 15,
  };

  // Procura linha de cabeçalho nas primeiras 15 linhas (caso o relatório do SAP tenha linhas de título no topo)
  const searchLimit = Math.min(rows.length, 15);
  for (let r = 0; r < searchLimit; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;
    const normalizedCols = row.map((c) => normalizeHeaderName(c));

    const hasMaterial = normalizedCols.some((c) => c === 'material' || c === 'matnr' || c.includes('material'));
    const hasSerialOrUii = normalizedCols.some(
      (c) =>
        c === 'uii' ||
        c === 'serial' ||
        c === 'sernr' ||
        c.includes('numeroserie') ||
        c.includes('ndeserie') ||
        c.includes('nserie')
    );

    if (hasMaterial || hasSerialOrUii) {
      headerRowIdx = r;
      const detected = {
        material: -1,
        serial: -1,
        centro: -1,
        deposito: -1,
        tipoEstoque: -1,
        statusSistema: -1,
        estqEspecial: -1,
        ordemCliente: -1,
        modificadoEm: -1,
        modificadoPor: -1,
        equipamento: -1,
      };

      normalizedCols.forEach((colName, idx) => {
        if (!colName) return;
        if (detected.material === -1 && (colName === 'material' || colName === 'matnr')) {
          detected.material = idx;
        } else if (
          detected.serial === -1 &&
          (colName === 'uii' ||
            colName === 'serial' ||
            colName === 'sernr' ||
            colName === 'ndeserie' ||
            colName === 'numeroserie' ||
            colName === 'nserie')
        ) {
          detected.serial = idx;
        } else if (detected.centro === -1 && (colName === 'centro' || colName === 'werks' || colName === 'cen')) {
          detected.centro = idx;
        } else if (
          detected.deposito === -1 &&
          (colName === 'deposito' || colName === 'dep' || colName === 'lgort')
        ) {
          detected.deposito = idx;
        } else if (
          detected.tipoEstoque === -1 &&
          (colName.includes('tipodeestoque') || colName === 'tpestoque' || colName === 'tipoestoque')
        ) {
          detected.tipoEstoque = idx;
        } else if (
          detected.statusSistema === -1 &&
          (colName.includes('statussistema') || colName.includes('statusdosistema') || colName === 'status')
        ) {
          detected.statusSistema = idx;
        } else if (detected.estqEspecial === -1 && colName.includes('estqespecial')) {
          detected.estqEspecial = idx;
        } else if (detected.ordemCliente === -1 && colName === 'ordemcliente') {
          detected.ordemCliente = idx;
        } else if (detected.modificadoEm === -1 && colName.includes('modificadoem')) {
          detected.modificadoEm = idx;
        } else if (detected.modificadoPor === -1 && colName.includes('modificadopo')) {
          detected.modificadoPor = idx;
        } else if (detected.equipamento === -1 && colName.includes('equipamento')) {
          detected.equipamento = idx;
        }
      });

      colMap = {
        material: detected.material !== -1 ? detected.material : 0,
        serial: detected.serial !== -1 ? detected.serial : 1,
        centro: detected.centro !== -1 ? detected.centro : 2,
        deposito: detected.deposito !== -1 ? detected.deposito : 3,
        tipoEstoque: detected.tipoEstoque !== -1 ? detected.tipoEstoque : 4,
        statusSistema: detected.statusSistema !== -1 ? detected.statusSistema : 5,
        estqEspecial: detected.estqEspecial !== -1 ? detected.estqEspecial : 8,
        ordemCliente: detected.ordemCliente !== -1 ? detected.ordemCliente : 9,
        modificadoEm: detected.modificadoEm !== -1 ? detected.modificadoEm : 11,
        modificadoPor: detected.modificadoPor !== -1 ? detected.modificadoPor : 12,
        equipamento: detected.equipamento !== -1 ? detected.equipamento : 15,
      };
      break;
    }
  }

  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
  const items: IQ09Item[] = [];

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rawMaterial = (row[colMap.material] || '').trim().toUpperCase();
    const rawSerial = (row[colMap.serial] || '').trim().toUpperCase();
    const rawCentro = (row[colMap.centro] || '').trim().toUpperCase();
    const rawDeposito = (row[colMap.deposito] || '').trim().toUpperCase();

    // Ignora linhas em branco, linhas de subtotais do SAP ("*", "---") ou repetição de cabeçalho
    if (!rawSerial || !rawMaterial) continue;
    if (
      rawSerial === 'UII' ||
      rawSerial === 'SERIAL' ||
      rawMaterial === 'MATERIAL' ||
      rawMaterial.startsWith('---') ||
      rawMaterial.startsWith('*')
    ) {
      continue;
    }

    let rawTipoEstoque = (row[colMap.tipoEstoque] || '01').trim().replace(/^'/, '');
    if (rawTipoEstoque === '1') rawTipoEstoque = '01';

    const rawStatusSistema = (row[colMap.statusSistema] || 'DEPS').trim().toUpperCase();
    const rawModificadoEm = formatExcelDateIfNumber(row[colMap.modificadoEm] || '');
    const rawModificadoPor = (row[colMap.modificadoPor] || '').trim().toUpperCase();
    const rawEquipamento = (row[colMap.equipamento] || '').trim().replace(/^'/, '');
    const rawEstqEspecial = (row[colMap.estqEspecial] || '').trim();
    const rawOrdemCliente = (row[colMap.ordemCliente] || '').trim();

    items.push({
      material: rawMaterial,
      serial: rawSerial,
      centro: rawCentro || 'B179',
      deposito: rawDeposito || '',
      tipoEstoque: rawTipoEstoque || '01',
      statusSistema: rawStatusSistema || 'DEPS',
      modificadoEm: rawModificadoEm || undefined,
      modificadoPor: rawModificadoPor || undefined,
      equipamento: rawEquipamento || undefined,
      estqEspecial: rawEstqEspecial || undefined,
      ordemCliente: rawOrdemCliente && rawOrdemCliente !== '000000' ? rawOrdemCliente : undefined,
    });
  }

  return items;
}

/**
 * Faz o parse de texto bruto (CSV, TSV do SAP GUI ou Ctrl+V direto do Excel)
 */
export function parseRawIQ09Text(rawText: string): IQ09Item[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  // Detecta o separador predominante na primeira linha útil
  const firstLine = lines[0];
  let delimiter = '\t';
  if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes(';')) {
    delimiter = ';';
  } else if (firstLine.includes('|')) {
    // Formato texto SAP GUI "| Material | UII | Centro | ..."
    delimiter = '|';
  } else if (firstLine.includes(',')) {
    delimiter = ',';
  }

  const matrix: string[][] = lines.map((line) => {
    let cleaned = line;
    if (delimiter === '|' && cleaned.startsWith('|')) {
      cleaned = cleaned.slice(1, cleaned.endsWith('|') ? -1 : undefined);
    }
    return cleaned.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, '').replace(/^'/, ''));
  });

  return mapMatrixToIQ09Items(matrix);
}

/**
 * Lê qualquer arquivo exportado da IQ09 do SAP (.xlsx, .csv, .txt, .xls texto/UTF-16)
 */
export async function parseIQ09File(file: File): Promise<IQ09Item[]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 1. Verifica assinatura ZIP (PK\x03\x04) -> Arquivo .XLSX nativo do Excel / SAP
  if (
    bytes.length > 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    const matrix = await extractXlsxRowsFromArrayBuffer(buffer);
    return mapMatrixToIQ09Items(matrix);
  }

  // 2. Verifica BOM UTF-16LE / UTF-16BE (comum quando o SAP exporta "Planilha" como texto Unicode .xls/.txt)
  let text = '';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(buffer);
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(buffer);
  } else {
    text = new TextDecoder('utf-8').decode(buffer);
    // Se houver muitos caracteres de substituição (arquivo salvo em ANSI / Windows-1252 pelo SAP), decodifica em windows-1252
    if (text.includes('\uFFFD')) {
      try {
        text = new TextDecoder('windows-1252').decode(buffer);
      } catch (e) {}
    }
  }

  return parseRawIQ09Text(text);
}

// ============================================================================
// MOTOR DE VALIDAÇÃO E DE-PARA EM LOTE (TIME BUIATTE ➔ SAP MIGO 311)
// ============================================================================

/**
 * Cruza uma lista de seriais (UII) com a base IQ09 ativa, as regras de Centros/Depósitos
 * e a fila atual do MIGOU, devolvendo tudo "mastigado" para o Time Buiatte.
 */
export function validateSerialsBatchAgainstIQ09(
  rawSerialsInput: string,
  targetDepositOption: string, // 'AUTO_LIVRE' | 'AUTO_FALTA' | código específico ex: 'B413', 'B110', 'B114', 'B136'
  activeQueueItems: TransferItem[]
): IQ09BatchValidationItem[] {
  const inputSerials = extractSerialsFromInput(rawSerialsInput);
  if (inputSerials.length === 0) return [];

  // Mapa de seriais que já estão Pendentes ou Em Análise na fila do MIGOU
  const activeQueueBySerial = new Map<string, TransferItem>();
  for (const qItem of activeQueueItems) {
    if (qItem.status === 'pendente' || qItem.status === 'em_analise') {
      activeQueueBySerial.set(qItem.serial.trim().toUpperCase(), qItem);
    }
  }

  return inputSerials.map((rawSn) => {
    const cleanSn = rawSn.trim().toUpperCase();
    const iq09 = lookupSerialInIQ09(cleanSn);
    const activeReq = activeQueueBySerial.get(cleanSn);

    // 1. Não localizado na Base IQ09
    if (!iq09) {
      return {
        inputSerial: cleanSn,
        status: 'nao_encontrado_iq09',
        suggestedMaterial: '',
        suggestedCentro: '',
        suggestedOrigem: '',
        suggestedDestino: '',
        statusTitle: 'Não Localizado na Base IQ09',
        statusDetail:
          'Este UII (Serial) não consta na fotografia atual da IQ09. Verifique se foi digitado corretamente ou se está em outro centro.',
        canCreateRequest: false,
      };
    }

    const centroInfo = SAP_CENTROS_CATALOG[iq09.centro];
    const originDepositInfo = SAP_DEPOSITOS_CATALOG[iq09.deposito];

    // Determina qual seria o Depósito de Destino ideal para este serial
    let resolvedDestino = targetDepositOption;
    if (targetDepositOption === 'AUTO_LIVRE') {
      if (originDepositInfo?.application === 'PEÇAS' && centroInfo?.freeStockPartsDeposit) {
        resolvedDestino = centroInfo.freeStockPartsDeposit;
      } else {
        resolvedDestino = centroInfo?.freeStockProductDeposit || 'B110';
      }
    } else if (targetDepositOption === 'AUTO_FALTA') {
      if (originDepositInfo?.application === 'PEÇAS' && centroInfo?.inventoryShortagePartsDeposit) {
        resolvedDestino = centroInfo.inventoryShortagePartsDeposit;
      } else {
        resolvedDestino = centroInfo?.inventoryShortageProductDeposit || 'B111';
      }
    }

    const destDepositInfo = SAP_DEPOSITOS_CATALOG[resolvedDestino];

    // 2. Já está no Depósito de Destino na própria IQ09! (Evita solicitação redundante)
    if (iq09.deposito === resolvedDestino) {
      const modInfo = iq09.modificadoEm
        ? ` (última mov. em ${iq09.modificadoEm}${iq09.modificadoPor ? ` por ${iq09.modificadoPor}` : ''})`
        : '';
      return {
        inputSerial: cleanSn,
        status: 'ja_no_destino',
        iq09Item: iq09,
        suggestedMaterial: iq09.material,
        suggestedCentro: iq09.centro,
        suggestedOrigem: iq09.deposito,
        suggestedDestino: resolvedDestino,
        statusTitle: `Já está no depósito ${resolvedDestino} no SAP!`,
        statusDetail: `O UII já se encontra alocado em ${resolvedDestino} (${destDepositInfo?.shortTitle || 'Destino'}) no centro ${iq09.centro}${modInfo}. Não é necessário solicitar MIGO 311.`,
        canCreateRequest: false,
      };
    }

    // 3. Já possui solicitação Pendente ou Em Análise na fila do MIGOU
    if (activeReq) {
      return {
        inputSerial: cleanSn,
        status: 'ja_na_fila_migou',
        iq09Item: iq09,
        existingQueueItem: {
          solicitationCode: activeReq.solicitationCode,
          status: activeReq.status,
          depositoOrigem: activeReq.depositoOrigem,
          depositoDestino: activeReq.depositoDestino,
          criadoEm: activeReq.criadoEm,
        },
        suggestedMaterial: iq09.material,
        suggestedCentro: iq09.centro,
        suggestedOrigem: iq09.deposito,
        suggestedDestino: resolvedDestino,
        statusTitle: `Já Solicitado (${activeReq.solicitationCode})`,
        statusDetail: `Já existe uma solicitação ${activeReq.status === 'em_analise' ? 'Em Validação SAP' : 'Pendente na Fila'} para este serial (${activeReq.depositoOrigem} ➔ ${activeReq.depositoDestino}).`,
        canCreateRequest: false,
      };
    }

    // 4. Serial está alocado em Depósito de Avaria Definitiva (B136, B149, B137) tentando ir para outro depósito
    const damageOriginInfo = DEFINITIVE_DAMAGE_DEPOSITS[iq09.deposito];
    if (damageOriginInfo && resolvedDestino !== iq09.deposito) {
      return {
        inputSerial: cleanSn,
        status: 'bloqueado_avaria_origem',
        iq09Item: iq09,
        suggestedMaterial: iq09.material,
        suggestedCentro: iq09.centro,
        suggestedOrigem: iq09.deposito,
        suggestedDestino: resolvedDestino,
        statusTitle: `Bloqueado: Origem ${iq09.deposito} (${damageOriginInfo.shortTitle})`,
        statusDetail: `Na IQ09 este serial está no depósito de Avaria Definitiva ${iq09.deposito} (${damageOriginInfo.definition}). Produtos avariados não devem voltar para o estoque livre.`,
        canCreateRequest: false,
      };
    }

    // 5. Status do Sistema no SAP impeditivo (ex: EDEL = Preso em Remessa/Delivery, Ordem Cliente, ou não está em DEPS/ESTC)
    const statusUpper = (iq09.statusSistema || 'DEPS').toUpperCase();
    const isBlockedByDeliveryOrStatus =
      statusUpper.includes('EDEL') ||
      statusUpper.includes('LKD') ||
      statusUpper.includes('BLQ') ||
      (!statusUpper.includes('DEPS') && !statusUpper.includes('ESTC') && !statusUpper.includes('AVLB'));

    if (isBlockedByDeliveryOrStatus || Boolean(iq09.ordemCliente)) {
      const reason = iq09.ordemCliente
        ? `Vinculado à Ordem de Cliente ${iq09.ordemCliente}`
        : `Status do sistema no SAP é "${iq09.statusSistema}" (diferente de DEPS)`;
      return {
        inputSerial: cleanSn,
        status: 'bloqueado_status_sap',
        iq09Item: iq09,
        suggestedMaterial: iq09.material,
        suggestedCentro: iq09.centro,
        suggestedOrigem: iq09.deposito,
        suggestedDestino: resolvedDestino,
        statusTitle: `Impedimento Status SAP (${iq09.statusSistema})`,
        statusDetail: `${reason}. A MIGO 311 pode ser recusada pelo SAP até a liberação do status.`,
        canCreateRequest: false,
      };
    }

    // 6. Depósito de Destino incompatível com o Centro real do serial na IQ09
    if (destDepositInfo && !destDepositInfo.allowedCentros.includes(iq09.centro)) {
      const recFree = centroInfo?.freeStockProductDeposit || 'B110';
      return {
        inputSerial: cleanSn,
        status: 'divergencia_rota_centro',
        iq09Item: iq09,
        suggestedMaterial: iq09.material,
        suggestedCentro: iq09.centro,
        suggestedOrigem: iq09.deposito,
        suggestedDestino: recFree,
        statusTitle: `Destino ${resolvedDestino} não pertence ao Centro ${iq09.centro}`,
        statusDetail: `Na IQ09 o serial pertence ao centro ${iq09.centro} (depósito atual ${iq09.deposito}), onde o estoque livre padrão é ${recFree} (não ${resolvedDestino}).`,
        canCreateRequest: true, // Permite criar corrigindo automaticamente para o depósito do centro
      };
    }

    // 7. 100% APTO PARA TRANSFERÊNCIA!
    return {
      inputSerial: cleanSn,
      status: 'apto_transferir',
      iq09Item: iq09,
      suggestedMaterial: iq09.material,
      suggestedCentro: iq09.centro,
      suggestedOrigem: iq09.deposito,
      suggestedDestino: resolvedDestino,
      statusTitle: `Apto: ${iq09.deposito} ➔ ${resolvedDestino} (${iq09.centro})`,
      statusDetail: `Material ${iq09.material} localizado em ${iq09.deposito} com status ${iq09.statusSistema} (Tp. Estoque ${iq09.tipoEstoque}). Pronto para MIGO 311!`,
      canCreateRequest: true,
    };
  });
}

// ============================================================================
// BATIMENTO AUTOMÁTICO EM TEMPO REAL NA FILA SAP (DE-PARA & PRÉ-MACRO MIGO 311)
// ============================================================================

/**
 * Audita instantaneamente (O(1)) uma solicitação da Fila SAP contra a Base IQ09 ativa.
 * Verifica divergências de Material, Centro, Depósito de Origem, Status Sistema (DEPS)
 * e Avaria Definitiva, preparando o registro para execução segura via Macro Excel / SAP Scripting.
 */
export function auditTransferItemAgainstIQ09(item: TransferItem): IQ09QueueItemAudit {
  const hasBase = Boolean(memorySnapshot && memorySnapshot.items && memorySnapshot.items.length > 0);
  if (!hasBase) {
    return {
      hasIQ09Base: false,
      serialFound: false,
      materialMismatch: false,
      centroMismatch: false,
      origemMismatch: false,
      hasAnyFieldMismatch: false,
      alreadyAtDestination: false,
      statusSapInvalid: false,
      definitiveDamageBlocked: false,
      macroStatus: 'sem_base_iq09',
      canAutoFixDePara: false,
      isReadyForMacroAfterDePara: false,
      badgeLabel: 'Aguardando IQ09',
      summaryMessage: 'Importe a base IQ09 para habilitar o batimento automático.',
      mismatchDetails: [],
    };
  }

  const reqSerial = (item.serial || '').trim().toUpperCase();
  const reqMaterial = (item.material || '').trim().toUpperCase();
  const reqCentro = (item.centro || '').trim().toUpperCase();
  const reqOrigem = (item.depositoOrigem || '').trim().toUpperCase();
  const reqDestino = (item.depositoDestino || '').trim().toUpperCase();

  const iq09 = lookupSerialInIQ09(reqSerial);

  // 1. UII / Serial não encontrado na base IQ09
  if (!iq09) {
    return {
      hasIQ09Base: true,
      serialFound: false,
      materialMismatch: false,
      centroMismatch: false,
      origemMismatch: false,
      hasAnyFieldMismatch: false,
      alreadyAtDestination: false,
      statusSapInvalid: false,
      definitiveDamageBlocked: false,
      macroStatus: 'erro_critico_macro',
      canAutoFixDePara: false,
      isReadyForMacroAfterDePara: false,
      badgeLabel: '🔴 S/ Saldo IQ09',
      summaryMessage: `Serial (UII) ${reqSerial} não localizado na base IQ09 ativa. A Macro MIGO falhará por falta de equipamento/saldo no SAP.`,
      mismatchDetails: [`Serial ${reqSerial} ausente na IQ09`],
    };
  }

  const iqMaterial = (iq09.material || '').trim().toUpperCase();
  const iqCentro = (iq09.centro || '').trim().toUpperCase();
  const iqOrigem = (iq09.deposito || '').trim().toUpperCase();
  const iqStatus = (iq09.statusSistema || 'DEPS').trim().toUpperCase();

  const materialMismatch = Boolean(iqMaterial && reqMaterial !== iqMaterial);
  const centroMismatch = Boolean(iqCentro && reqCentro !== iqCentro);
  const origemMismatch = Boolean(iqOrigem && reqOrigem !== iqOrigem);
  const hasAnyFieldMismatch = materialMismatch || centroMismatch || origemMismatch;

  const mismatchDetails: string[] = [];
  if (materialMismatch) {
    mismatchDetails.push(`Material: ${reqMaterial} ➔ IQ09: ${iqMaterial}`);
  }
  if (centroMismatch) {
    mismatchDetails.push(`Centro: ${reqCentro} ➔ IQ09: ${iqCentro}`);
  }
  if (origemMismatch) {
    mismatchDetails.push(`Dep. Origem: ${reqOrigem} ➔ IQ09: ${iqOrigem}`);
  }

  // 2. Verifica se na IQ09 o serial JÁ ESTÁ no Depósito de Destino solicitado
  const alreadyAtDestination = iqOrigem === reqDestino && (!centroMismatch || iqCentro === reqCentro);
  if (alreadyAtDestination) {
    return {
      hasIQ09Base: true,
      serialFound: true,
      iq09Item: iq09,
      materialMismatch,
      centroMismatch,
      origemMismatch,
      hasAnyFieldMismatch,
      alreadyAtDestination: true,
      statusSapInvalid: false,
      definitiveDamageBlocked: false,
      macroStatus: 'ja_no_destino_sap',
      canAutoFixDePara: false,
      isReadyForMacroAfterDePara: false,
      badgeLabel: `🔵 Já em ${iqOrigem} (IQ09)`,
      summaryMessage: `Na IQ09 este serial já se encontra no depósito destino ${iqOrigem} (${iqCentro}). Não deve ser enviado para a Macro MIGO 311.`,
      mismatchDetails,
    };
  }

  // 3. Verifica se na IQ09 o serial está em Avaria Definitiva (B136, B149, B137) tentando sair para livre
  const damageOriginInfo = DEFINITIVE_DAMAGE_DEPOSITS[iqOrigem];
  const definitiveDamageBlocked = Boolean(damageOriginInfo && reqDestino !== iqOrigem && !DEFINITIVE_DAMAGE_DEPOSITS[reqDestino]);
  if (definitiveDamageBlocked) {
    return {
      hasIQ09Base: true,
      serialFound: true,
      iq09Item: iq09,
      materialMismatch,
      centroMismatch,
      origemMismatch,
      hasAnyFieldMismatch,
      alreadyAtDestination: false,
      statusSapInvalid: false,
      definitiveDamageBlocked: true,
      macroStatus: 'erro_critico_macro',
      canAutoFixDePara: false,
      isReadyForMacroAfterDePara: false,
      badgeLabel: `🛑 IQ09: Avaria ${iqOrigem}`,
      summaryMessage: `Na IQ09 o serial está em ${iqOrigem} (${damageOriginInfo?.shortTitle}) — Avaria Definitiva bloqueada para retorno ao estoque livre.`,
      mismatchDetails,
    };
  }

  // 4. Verifica Status do Sistema SAP (EDEL, Ordem de Cliente, etc.)
  const isBlockedByDeliveryOrStatus =
    iqStatus.includes('EDEL') ||
    iqStatus.includes('LKD') ||
    iqStatus.includes('BLQ') ||
    (!iqStatus.includes('DEPS') && !iqStatus.includes('ESTC') && !iqStatus.includes('AVLB')) ||
    Boolean(iq09.ordemCliente);

  if (isBlockedByDeliveryOrStatus) {
    return {
      hasIQ09Base: true,
      serialFound: true,
      iq09Item: iq09,
      materialMismatch,
      centroMismatch,
      origemMismatch,
      hasAnyFieldMismatch,
      alreadyAtDestination: false,
      statusSapInvalid: true,
      definitiveDamageBlocked: false,
      macroStatus: 'erro_critico_macro',
      canAutoFixDePara: false,
      isReadyForMacroAfterDePara: false,
      badgeLabel: `🔴 Status SAP: ${iqStatus}`,
      summaryMessage: iq09.ordemCliente
        ? `Serial preso na Ordem de Cliente ${iq09.ordemCliente} (Status ${iqStatus}). A Macro MIGO recusará a transferência.`
        : `Status SAP na IQ09 é "${iqStatus}" (diferente de DEPS). A Macro MIGO recusará a transferência.`,
      mismatchDetails,
    };
  }

  // 5. Possui divergência de Material, Centro ou Depósito de Origem em relação à IQ09 -> Corrigível via De-Para Automático!
  if (hasAnyFieldMismatch) {
    return {
      hasIQ09Base: true,
      serialFound: true,
      iq09Item: iq09,
      materialMismatch,
      centroMismatch,
      origemMismatch,
      hasAnyFieldMismatch: true,
      alreadyAtDestination: false,
      statusSapInvalid: false,
      definitiveDamageBlocked: false,
      macroStatus: 'corrigivel_depara',
      canAutoFixDePara: true,
      isReadyForMacroAfterDePara: true,
      badgeLabel: '🟠 De-Para IQ09',
      summaryMessage: `Divergência detectada c/ IQ09 (${mismatchDetails.join(' • ')}). Clique em "Aplicar De-Para IQ09" para corrigir antes de rodar a Macro!`,
      mismatchDetails,
    };
  }

  // 6. 100% BATIDO COM A BASE IQ09 (Material, Serial/UII, Centro, Dep. Origem e Status DEPS) -> PRONTO PARA MACRO!
  return {
    hasIQ09Base: true,
    serialFound: true,
    iq09Item: iq09,
    materialMismatch: false,
    centroMismatch: false,
    origemMismatch: false,
    hasAnyFieldMismatch: false,
    alreadyAtDestination: false,
    statusSapInvalid: false,
    definitiveDamageBlocked: false,
    macroStatus: 'pronto_macro_100',
    canAutoFixDePara: false,
    isReadyForMacroAfterDePara: true,
    badgeLabel: '🟢 IQ09 100% OK',
    summaryMessage: `100% batido c/ IQ09: Material ${iqMaterial}, Centro ${iqCentro}, Origem ${iqOrigem} (Status ${iqStatus}). Pronto p/ Macro MIGO 311!`,
    mismatchDetails: [],
  };
}


// ============================================================================
// AMOSTRA OFICIAL DA IQ09 (ESPELHO FIEL DO PRINT ENVIADO PELO USUÁRIO + CENÁRIOS)
// ============================================================================

export function getOfficialSampleIQ09Items(): IQ09Item[] {
  return [
    // Linhas exatas do print da IQ09 enviado pelo usuário (Centro B179, Depósito B413, Status DEPS, Tipo 01)
    { material: 'QQI075BB', serial: 'S4221B10960628', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50416234' },
    { material: 'QQI075BB', serial: 'S4221B10960732', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50416882' },
    { material: 'QQI075BB', serial: 'S4221B10960734', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50416884' },
    { material: 'QQI075BB', serial: 'S4521B11119242', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50719269' },
    { material: 'QQJ105BB', serial: 'S4621B11175122', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '28/05/2026', modificadoPor: 'FPIRES', equipamento: '50796373' },
    { material: 'QQJ105BB', serial: 'S4621B11175124', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '28/05/2026', modificadoPor: 'FPIRES', equipamento: '50796374' },
    { material: 'MXSA27S2', serial: 'S4621B23675109', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50862155' },
    { material: 'MXSA27S2', serial: 'S4621B23675108', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50862156' },
    { material: 'MXSA27S2', serial: 'S4621B23675110', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50862279' },
    { material: 'MXSA27B2', serial: 'S4721B23682879', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50900211' },
    { material: 'MXSA27B2', serial: 'S4721B23682880', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50900212' },
    { material: 'MXSA27B2', serial: 'S4721B23682888', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50901296' },
    { material: 'MXSA27B2', serial: 'S4721B23682891', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50901632' },
    { material: 'MXSA27B2', serial: 'S4721B23682887', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50901634' },
    { material: 'MM2-EM27PA(WH)', serial: 'S4721B23690128', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50938929' },
    { material: 'MM2-EM27PA(WH)', serial: 'S4721B23690123', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '50938933' },
    { material: '38TVQB12S5', serial: 'S4021B10850559', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '51070805' },
    { material: 'MXSA27E2', serial: 'S4821B23707385', centro: 'B179', deposito: 'B413', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '03/06/2026', modificadoPor: 'APEREIRA', equipamento: '51082632' },
    // Exemplos operacionais em B148 (Triagem) e B111 (Falta) prontos para solicitação de transferência para Estoque Livre
    { material: 'MDWTF08B1', serial: '541760002ZGB4133400502', centro: 'B124', deposito: 'B148', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '06/11/2026', modificadoPor: 'APEREIRA', equipamento: '51090101' },
    { material: 'MDWTF08B1', serial: '541760002ZGB4133400533', centro: 'B124', deposito: 'B148', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '06/11/2026', modificadoPor: 'APEREIRA', equipamento: '51090102' },
    { material: 'QCL108BB', serial: 'S1326B21294802', centro: 'B179', deposito: 'B111', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '06/11/2026', modificadoPor: 'FPIRES', equipamento: '51090205' },
    { material: 'QCL108BB', serial: 'S1326B21294807', centro: 'B158', deposito: 'B111', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '06/11/2026', modificadoPor: 'FPIRES', equipamento: '51090206' },
    // Exemplo em Avaria Definitiva (B136) para demonstrar o bloqueio inteligente
    { material: 'TSM62', serial: '541711001X9B6233500679', centro: 'B124', deposito: 'B136', tipoEstoque: '01', statusSistema: 'DEPS', modificadoEm: '05/11/2026', modificadoPor: 'APEREIRA', equipamento: '51090399' },
  ];
}

