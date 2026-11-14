import {
  WMSBatimentoItem,
  WMSBatimentoMetadata,
  WMSBatimentoSnapshot,
  WMSBreakerVerdict,
} from '../types/wmsBatimento';
import { IQ09Item } from '../types/iq09';
import {
  lookupSerialInIQ09,
  getMemoryIQ09Snapshot,
  saveAndActivateIQ09Snapshot,
} from './iq09Service';
import { SAP_CENTROS_CATALOG, SAP_DEPOSITOS_CATALOG } from '../utils/sapFormatter';

const IDB_NAME = 'migou_wms_batimento_db_v1';
const IDB_STORE = 'wms_batimento_store';
const IDB_KEY = 'active_wms_snapshot';
const LOCAL_META_KEY = 'migou_wms_batimento_meta_v1';
const WMS_CLEARED_FLAG_KEY = 'migou_wms_batimento_cleared_flag_v1';

// Cache O(1) em memória para busca instantânea (< 1ms mesmo para 75.000+ seriais)
let memoryWmsSnapshot: WMSBatimentoSnapshot | null = null;
let memoryWmsSerialMap: Map<string, WMSBatimentoItem> = new Map();
const wmsListeners = new Set<(snapshot: WMSBatimentoSnapshot | null) => void>();

function normalizeWmsSnapshot(snapshot: WMSBatimentoSnapshot | null): WMSBatimentoSnapshot | null {
  if (!snapshot) return null;
  const items = Array.isArray(snapshot.items)
    ? snapshot.items.map((it) => ({
        ...it,
        lote: it.lote || it.loteWms || '',
        loteWms: it.loteWms || it.lote || '',
        localWms: it.localWms || '',
        depositoWms: it.depositoWms || '',
        analise: it.analise || 'OK',
      }))
    : [];

  const meta = snapshot.metadata || ({} as WMSBatimentoMetadata);
  const fileName =
    meta.fileName ||
    (Array.isArray(meta.fileNames) && meta.fileNames.length > 0
      ? meta.fileNames.join(' + ')
      : 'Batimento_Estoque.xlsx');
  const fileNames =
    Array.isArray(meta.fileNames) && meta.fileNames.length > 0
      ? meta.fileNames
      : fileName.split(' + ').filter(Boolean);
  const totalItems = meta.totalItems ?? meta.totalSerials ?? items.length;
  const b111Falta = meta.b111FaltaDesconsiderarCount ?? meta.b111InFaltaWmsCount ?? 0;
  const divWms = meta.divergenciasWmsCount ?? meta.divergenciaWmsCount ?? 0;

  return {
    metadata: {
      ...meta,
      snapshotId: meta.snapshotId || `WMS-BAT-${Date.now()}`,
      updatedAt: meta.updatedAt || new Date().toISOString(),
      updatedBy: meta.updatedBy || 'Supervisor WMS/SAP',
      fileName,
      fileNames,
      totalItems,
      totalSerials: totalItems,
      okCount: meta.okCount ?? 0,
      b111FaltaDesconsiderarCount: b111Falta,
      b111InFaltaWmsCount: b111Falta,
      moverParaB111Count: meta.moverParaB111Count ?? 0,
      apenasNoSapCount: meta.apenasNoSapCount ?? 0,
      apenasNoWmsCount: meta.apenasNoWmsCount ?? 0,
      divergenciasWmsCount: divWms,
      divergenciaWmsCount: divWms,
      validarFisicoCount: meta.validarFisicoCount ?? 0,
      analiseBreakdown: meta.analiseBreakdown || {},
      depositosWmsCount: meta.depositosWmsCount || {},
      sourceType: meta.sourceType || 'batimento_xlsx',
    },
    items,
  };
}

function rebuildWmsMemoryMap(snapshot: WMSBatimentoSnapshot | null) {
  const normalized = normalizeWmsSnapshot(snapshot);
  memoryWmsSnapshot = normalized;
  memoryWmsSerialMap = new Map();

  if (normalized && Array.isArray(normalized.items)) {
    for (const item of normalized.items) {
      if (item.serial) {
        memoryWmsSerialMap.set(item.serial.trim().toUpperCase(), item);
      }
    }
  }
}

function notifyWmsListeners() {
  wmsListeners.forEach((cb) => {
    try {
      cb(memoryWmsSnapshot);
    } catch (e) {
      console.warn('Erro ao notificar listener WMS Batimento:', e);
    }
  });
}

export function subscribeToWMSBatimentoSnapshot(
  callback: (snapshot: WMSBatimentoSnapshot | null) => void
): () => void {
  wmsListeners.add(callback);
  if (memoryWmsSnapshot) {
    callback(memoryWmsSnapshot);
  }
  return () => {
    wmsListeners.delete(callback);
  };
}

export function getMemoryWMSBatimentoSnapshot(): WMSBatimentoSnapshot | null {
  return memoryWmsSnapshot;
}

export function hasActiveWMSBatimentoBase(): boolean {
  return Boolean(memoryWmsSnapshot && memoryWmsSnapshot.items.length > 0);
}

export function lookupSerialInWMSBatimento(serial: string): WMSBatimentoItem | undefined {
  if (!serial) return undefined;
  return memoryWmsSerialMap.get(serial.trim().toUpperCase());
}

export function getStoredWMSBatimentoMetadata(): WMSBatimentoMetadata | null {
  if (typeof window === 'undefined') return null;
  try {
    if (localStorage.getItem(WMS_CLEARED_FLAG_KEY) === 'true') return null;
    const raw = localStorage.getItem(LOCAL_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WMSBatimentoMetadata;
    if (!parsed || parsed.sourceType === 'sample') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// CAMADA INDEXEDDB (SUPORTA 75.000+ LINHAS DO BATIMENTO SÊNIOR WMS X SAP)
// ============================================================================

function openWMSDatabase(): Promise<IDBDatabase> {
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

export async function saveWMSBatimentoToStorage(snapshot: WMSBatimentoSnapshot): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(WMS_CLEARED_FLAG_KEY);
      localStorage.setItem(LOCAL_META_KEY, JSON.stringify(snapshot.metadata));
    } catch (e) {}
  }

  rebuildWmsMemoryMap(snapshot);
  notifyWmsListeners();

  if (typeof window === 'undefined') return;

  try {
    const db = await openWMSDatabase();
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
    console.warn('Aviso ao salvar Batimento WMS no IndexedDB:', e);
  }

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('migou_sync_realtime');
      bc.postMessage({
        type: 'WMS_BATIMENTO_UPDATED',
        snapshotId: snapshot.metadata.snapshotId,
        timestamp: Date.now(),
      });
      bc.close();
    }
  } catch (e) {}
}

export async function loadWMSBatimentoFromStorage(): Promise<WMSBatimentoSnapshot | null> {
  if (typeof window === 'undefined') return null;

  try {
    if (localStorage.getItem(WMS_CLEARED_FLAG_KEY) === 'true') {
      rebuildWmsMemoryMap(null);
      notifyWmsListeners();
      return null;
    }
  } catch (e) {}

  if (memoryWmsSnapshot && memoryWmsSnapshot.metadata.sourceType !== 'sample') {
    return memoryWmsSnapshot;
  }

  try {
    const db = await openWMSDatabase();
    const snap = await new Promise<WMSBatimentoSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_KEY);
      getReq.onsuccess = () => {
        db.close();
        resolve((getReq.result as WMSBatimentoSnapshot) || null);
      };
      getReq.onerror = () => {
        db.close();
        reject(getReq.error);
      };
    });

    if (snap && snap.metadata && Array.isArray(snap.items) && snap.items.length > 0) {
      if (snap.metadata.sourceType === 'sample') {
        await clearWMSBatimentoSnapshot();
        return null;
      }
      rebuildWmsMemoryMap(snap);
      notifyWmsListeners();
      return memoryWmsSnapshot;
    }
  } catch (e) {}

  // Retorna null quando nenhuma base foi importada (nunca trava em amostras pré-carregadas)
  rebuildWmsMemoryMap(null);
  notifyWmsListeners();
  return null;
}

export async function clearWMSBatimentoSnapshot(): Promise<void> {
  rebuildWmsMemoryMap(null);
  notifyWmsListeners();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(WMS_CLEARED_FLAG_KEY, 'true');
      localStorage.removeItem(LOCAL_META_KEY);
    } catch (e) {}

    try {
      const db = await openWMSDatabase();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
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
        bc.postMessage({ type: 'WMS_BATIMENTO_CLEARED', timestamp: Date.now() });
        bc.close();
      }
    } catch (e) {}
  }
}

export function buildWMSSnapshotFromItems(
  items: WMSBatimentoItem[],
  fileName: string,
  updatedBy: string,
  sourceType: WMSBatimentoMetadata['sourceType'] = 'batimento_xlsx'
): WMSBatimentoSnapshot {
  // Deduplica por serial mantendo o registro mais rico
  const map = new Map<string, WMSBatimentoItem>();
  for (const it of items) {
    if (!it.serial) continue;
    const key = it.serial.trim().toUpperCase();
    const existing = map.get(key);
    const loteVal = it.lote || it.loteWms || '';
    if (!existing) {
      map.set(key, { ...it, serial: key, lote: loteVal, loteWms: loteVal });
    } else {
      const mergedLote = loteVal || existing.lote || existing.loteWms || '';
      map.set(key, {
        ...existing,
        ...it,
        serial: key,
        materialSap: it.materialSap || existing.materialSap,
        materialWms: it.materialWms || existing.materialWms,
        centroSap: it.centroSap || existing.centroSap,
        depositoSap: it.depositoSap || existing.depositoSap,
        centroWms: it.centroWms || existing.centroWms,
        depositoWms: it.depositoWms || existing.depositoWms,
        localWms: it.localWms || existing.localWms,
        lote: mergedLote,
        loteWms: mergedLote,
        analise: it.analise || existing.analise,
      });
    }
  }

  const deduped = Array.from(map.values());
  let okCount = 0;
  let b111FaltaDesconsiderarCount = 0;
  let moverParaB111Count = 0;
  let apenasNoSapCount = 0;
  let apenasNoWmsCount = 0;
  let divergenciasWmsCount = 0;
  let validarFisicoCount = 0;

  const analiseBreakdown: Record<string, number> = {};
  const depositosWmsCount: Record<string, number> = {};

  for (const item of deduped) {
    const an = item.analise || 'Sem classificação';
    analiseBreakdown[an] = (analiseBreakdown[an] || 0) + 1;

    const depW = item.depositoWms || '(Sem Saldo WMS)';
    depositosWmsCount[depW] = (depositosWmsCount[depW] || 0) + 1;

    const anUpper = an.toUpperCase();
    if (anUpper === 'OK' || anUpper.startsWith('OK -')) {
      okCount++;
    } else if (anUpper.includes('FALTA - DESCONSIDERAR')) {
      b111FaltaDesconsiderarCount++;
    } else if (anUpper.includes('MOVER NO SAP PARA B111')) {
      moverParaB111Count++;
    } else if (anUpper.includes('APENAS NO SAP') || anUpper.includes('EXTRAVIO NO SAP')) {
      apenasNoSapCount++;
    } else if (anUpper.includes('APENAS NO WMS')) {
      apenasNoWmsCount++;
    } else if (anUpper.includes('VALIDAR NO FÍSICO') || anUpper.includes('VALIDAR NO FISICO')) {
      validarFisicoCount++;
    } else {
      divergenciasWmsCount++;
    }
  }

  const cleanFileName = fileName || 'Batimento_Estoque.xlsx';
  const metadata: WMSBatimentoMetadata = {
    snapshotId: `WMS-BAT-${Date.now()}`,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'Supervisor WMS/SAP',
    fileName: cleanFileName,
    fileNames: cleanFileName.split(' + ').filter(Boolean),
    totalItems: deduped.length,
    totalSerials: deduped.length,
    okCount,
    b111FaltaDesconsiderarCount,
    b111InFaltaWmsCount: b111FaltaDesconsiderarCount,
    moverParaB111Count,
    apenasNoSapCount,
    apenasNoWmsCount,
    divergenciasWmsCount,
    divergenciaWmsCount: divergenciasWmsCount,
    validarFisicoCount,
    analiseBreakdown,
    depositosWmsCount,
    sourceType,
  };

  return {
    metadata,
    items: deduped,
  };
}

/**
 * Salva o snapshot do Batimento WMS e, opcionalmente, se a base IQ09 estiver vazia (ou se solicitado),
 * sincroniza também os dados SAP contidos no próprio Batimento para a memória IQ09!
 */
export async function saveAndActivateWMSBatimento(
  items: WMSBatimentoItem[],
  fileNameOrOptions:
    | string
    | {
        updatedBy?: string;
        fileName?: string;
        fileNames?: string[];
        sourceMode?: WMSBatimentoMetadata['sourceType'];
        sourceType?: WMSBatimentoMetadata['sourceType'];
        alsoSyncIQ09IfEmpty?: boolean;
      },
  updatedByArg?: string,
  sourceTypeArg: WMSBatimentoMetadata['sourceType'] = 'batimento_xlsx',
  alsoSyncIQ09IfEmptyArg = true
): Promise<WMSBatimentoSnapshot> {
  let fileName = 'Batimento_Estoque.xlsx';
  let updatedBy = 'Supervisor WMS/SAP';
  let sourceType: WMSBatimentoMetadata['sourceType'] = 'batimento_xlsx';
  let alsoSyncIQ09IfEmpty = true;

  if (typeof fileNameOrOptions === 'string') {
    fileName = fileNameOrOptions;
    updatedBy = updatedByArg || 'Supervisor WMS/SAP';
    sourceType = sourceTypeArg;
    alsoSyncIQ09IfEmpty = alsoSyncIQ09IfEmptyArg;
  } else if (fileNameOrOptions && typeof fileNameOrOptions === 'object') {
    fileName =
      fileNameOrOptions.fileName ||
      (fileNameOrOptions.fileNames && fileNameOrOptions.fileNames.join(' + ')) ||
      'Batimento_Estoque.xlsx';
    updatedBy = fileNameOrOptions.updatedBy || 'Supervisor WMS/SAP';
    sourceType =
      fileNameOrOptions.sourceType || fileNameOrOptions.sourceMode || 'batimento_xlsx';
    alsoSyncIQ09IfEmpty = fileNameOrOptions.alsoSyncIQ09IfEmpty ?? true;
  }

  const snapshot = buildWMSSnapshotFromItems(items, fileName, updatedBy, sourceType);
  await saveWMSBatimentoToStorage(snapshot);

  const currentIq09 = getMemoryIQ09Snapshot();
  const isIq09EmptyOrSample =
    !currentIq09 ||
    currentIq09.items.length < 50 ||
    currentIq09.metadata.sourceType === 'sample';

  if (alsoSyncIQ09IfEmpty && isIq09EmptyOrSample) {
    const extractedIq09: IQ09Item[] = [];
    for (const it of snapshot.items) {
      if (it.serial && it.materialSap && it.depositoSap) {
        extractedIq09.push({
          serial: it.serial,
          material: it.materialSap,
          centro: it.centroSap || 'B124',
          deposito: it.depositoSap,
          tipoEstoque: '01',
          statusSistema: 'DEPS',
        });
      }
    }
    if (extractedIq09.length > 0) {
      await saveAndActivateIQ09Snapshot(extractedIq09, {
        updatedBy,
        fileName: `${fileName} (Espelho SAP)`,
        sourceType: 'xlsx_upload',
      });
    }
  }

  return snapshot;
}

// ============================================================================
// MOTOR DE LEITURA NATIVA (.XLSX E .CSV COM ASPAS) PARA AS 3 BASES:
// 1. Batimento_Estoque_*.xlsx (72.600+ linhas)
// 2. Gerenciador de Informações Específicas (.xlsx / .csv)
// 3. Estoque Local por Lote (.csv / .xlsx)
// ============================================================================

async function inflateRawChunk(compressedData: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Navegador sem suporte a DecompressionStream para leitura de .xlsx');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressedData as unknown as BufferSource);
  writer.close();

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

  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function decodeXmlEntities(str: string): string {
  if (!str || !str.includes('&')) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function colLettersToZeroIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

async function extractFirstLargeWorksheetMatrixFromXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Localiza EOCD (End of Central Directory)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Arquivo .xlsx inválido (ZIP EOCD não encontrado).');
  }

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const zipFiles = new Map<
    string,
    { compression: number; compData: Uint8Array; uncompSize: number }
  >();

  let ptr = cdOffset;
  const utf8Decoder = new TextDecoder('utf-8');

  for (let i = 0; i < cdEntries; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) break;
    const compression = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const uncompSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = utf8Decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compData = bytes.subarray(dataStart, dataStart + compSize);

    zipFiles.set(fileName, { compression, compData, uncompSize });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  const getFileText = async (name: string): Promise<string | null> => {
    const entry = zipFiles.get(name);
    if (!entry) return null;
    if (entry.compression === 0) return utf8Decoder.decode(entry.compData);
    if (entry.compression === 8) {
      const raw = await inflateRawChunk(entry.compData);
      return utf8Decoder.decode(raw);
    }
    return null;
  };

  // 1. Carrega sharedStrings.xml se existir
  const sharedStrings: string[] = [];
  const sstXml = await getFileText('xl/sharedStrings.xml');
  if (sstXml) {
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRegex.exec(sstXml)) !== null) {
      const inner = m[1];
      const tMatches = inner.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g);
      if (tMatches) {
        const text = tMatches
          .map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, '')))
          .join('');
        sharedStrings.push(text);
      } else {
        sharedStrings.push('');
      }
    }
  }

  // 2. Escolhe a aba principal (sheet1.xml ou a maior aba de dados como "Analise")
  let targetSheetKey = 'xl/worksheets/sheet1.xml';
  if (!zipFiles.has(targetSheetKey)) {
    let maxBytes = -1;
    for (const [k, v] of zipFiles.entries()) {
      if (k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml') && v.uncompSize > maxBytes) {
        maxBytes = v.uncompSize;
        targetSheetKey = k;
      }
    }
  }

  const sheetXml = await getFileText(targetSheetKey);
  if (!sheetXml) {
    throw new Error('Não foi possível ler a planilha interna do arquivo .xlsx');
  }

  const rows: string[][] = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;

  while ((rm = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rm[1];
    const cellRegex = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const rowCells: string[] = [];
    let cm: RegExpExecArray | null;

    while ((cm = cellRegex.exec(rowContent)) !== null) {
      const attrs = cm[1];
      const inner = cm[2] || '';

      let colIdx = rowCells.length;
      const rMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (rMatch) {
        colIdx = colLettersToZeroIndex(rMatch[1]);
      }

      const tMatch = attrs.match(/t="([^"]+)"/);
      const cellType = tMatch ? tMatch[1] : '';

      let val = '';
      if (cellType === 's') {
        const vMatch = inner.match(/<v>(\d+)<\/v>/);
        if (vMatch) {
          val = sharedStrings[parseInt(vMatch[1], 10)] || '';
        }
      } else if (cellType === 'inlineStr') {
        const isMatch = inner.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/);
        if (isMatch) {
          val = decodeXmlEntities(isMatch[1]);
        }
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          val = decodeXmlEntities(vMatch[1]);
        }
      }

      rowCells[colIdx] = val.trim();
    }

    if (rowCells.length > 0) {
      rows.push(rowCells);
    }
  }

  return rows;
}

/**
 * Parser de linha CSV que respeita campos entre aspas com vírgula interna
 * Ex: `4396,CENTRO B123,SPRINGER,3113089,,LAVADORA,"LAVADORA MIDEA, 10,5KG",SERIE,S12345`
 */
function parseCsvLineRespectingQuotes(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^'/, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^'/, ''));
  return result;
}

function parseTextToMatrix(text: string): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const first = lines[0];
  let delimiter = ',';
  if (first.includes('\t')) delimiter = '\t';
  else if (first.includes(';')) delimiter = ';';
  else if (first.includes(',')) delimiter = ',';

  return lines.map((line) => parseCsvLineRespectingQuotes(line, delimiter));
}

function normalizeHeader(h: string): string {
  return (h || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Extrai Centro e Depósito sugerido a partir da coluna "Tipo do Recebimento" do Sênior WMS
 * Ex: "CENTRO B124 - B110" -> { centro: "B124", deposito: "B110" }
 * Ex: "CENTRO B123" -> { centro: "B123", deposito: "B110" }
 * Ex: "CENTRO B158 - DEV" -> { centro: "B158", deposito: "DEVT" }
 */
function parseWmsTipoRecebimento(rawTipo: string): { centro: string; deposito: string } {
  const upper = (rawTipo || '').trim().toUpperCase();
  const centroMatch = upper.match(/B1(23|24|58|59|79|80)/);
  const centro = centroMatch ? `B1${centroMatch[1]}` : '';

  if (upper.includes('DEV')) {
    return { centro, deposito: 'DEVT' };
  }

  const depMatch = upper.match(/-\s*(B\d{3})/);
  if (depMatch) {
    return { centro, deposito: depMatch[1] };
  }

  if (centro && SAP_CENTROS_CATALOG[centro]) {
    return { centro, deposito: SAP_CENTROS_CATALOG[centro].freeStockProductDeposit };
  }

  return { centro: '', deposito: '' };
}

/**
 * Identifica o tipo de matriz (1: Planilha Consolidada de Batimento, 2: Gerenciador de Informações Específicas, 3: Estoque Local por Lote)
 * e converte/cruza automaticamente!
 */
export async function parseAndMergeWMSFiles(
  files: File[],
  _optionalIq09Lookup?: (serial: string) => IQ09Item | undefined
): Promise<{
  items: WMSBatimentoItem[];
  detectedType: WMSBatimentoMetadata['sourceType'];
  sourceMode: WMSBatimentoMetadata['sourceType'];
  fileNames: string[];
  summaryLabel: string;
}> {
  const uploadedFileNames = files.map((f) => f.name);
  let batimentoItems: WMSBatimentoItem[] = [];
  // Mapa de Lote -> Dados de Endereço/Depósito do "Estoque Local por Lote"
  const loteToLocationMap = new Map<
    string,
    {
      materialWms: string;
      centroWms: string;
      depositoWms: string;
      setorCompletoWms: string;
      localWms: string;
      localAtivo: string;
      loteLiberado: string;
    }
  >();
  // Lista de séries vindas do "Gerenciador de Informações Específicas"
  const rawSpecificSerials: Array<{
    serial: string;
    materialWms: string;
    lote: string;
    tipoRecebimento: string;
    ordemRecebimento: string;
    onda: string;
    notaFiscal: string;
    situacao: string;
  }> = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let matrix: string[][] = [];

    if (
      bytes.length > 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    ) {
      matrix = await extractFirstLargeWorksheetMatrixFromXlsx(buffer);
    } else {
      let text = new TextDecoder('utf-8').decode(buffer);
      if (text.includes('\uFFFD')) {
        try {
          text = new TextDecoder('windows-1252').decode(buffer);
        } catch (e) {}
      }
      matrix = parseTextToMatrix(text);
    }

    if (matrix.length < 2) continue;

    // Inspeciona cabeçalho nas primeiras 10 linhas
    let headerIdx = 0;
    let normHeaders: string[] = [];
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const candidate = matrix[r].map(normalizeHeader);
      if (
        candidate.includes('serial') ||
        candidate.includes('materialsap') ||
        candidate.includes('depositosap') ||
        candidate.includes('depositowms') ||
        candidate.includes('codigodoproduto') ||
        candidate.includes('lote')
      ) {
        headerIdx = r;
        normHeaders = candidate;
        break;
      }
    }
    if (normHeaders.length === 0) {
      normHeaders = matrix[0].map(normalizeHeader);
    }

    const isBatimentoSheet =
      normHeaders.includes('materialsap') ||
      normHeaders.includes('depositosap') ||
      normHeaders.includes('depositowms') ||
      normHeaders.includes('analise');

    const isGerenciadorEspecificas =
      normHeaders.includes('informacao') &&
      normHeaders.includes('valor') &&
      (normHeaders.includes('codigodoproduto') || normHeaders.includes('lote'));

    if (isBatimentoSheet) {
      // Mapeia índices exatos da aba "Analise" do Batimento_Estoque
      const idxSerial = normHeaders.findIndex((h) => h === 'serial' || h === 'uii' || h === 'serie');
      const idxMatSap = normHeaders.findIndex((h) => h === 'materialsap');
      const idxMatWms = normHeaders.findIndex((h) => h === 'materialwms');
      const idxCenSap = normHeaders.findIndex((h) => h === 'centrosap');
      const idxDepSap = normHeaders.findIndex((h) => h === 'depositosap');
      const idxCenWms = normHeaders.findIndex((h) => h === 'centrowms');
      const idxDepWms = normHeaders.findIndex((h) => h === 'depositowms');
      const idxSetorComp = normHeaders.findIndex((h) => h.includes('setorcompletowms') || h === 'setorwms');
      const idxLocal = normHeaders.findIndex((h) => h === 'local' || h === 'endereco');
      const idxLocalAtivo = normHeaders.findIndex((h) => h === 'localativo');
      const idxLote = normHeaders.findIndex((h) => h === 'lote');
      const idxLoteLib = normHeaders.findIndex((h) => h === 'loteliberado');
      const idxStatusIqc = normHeaders.findIndex((h) => h === 'statusiqc');
      const idxAnalise = normHeaders.findIndex((h) => h === 'analise');
      const idxOndeAgir = normHeaders.findIndex((h) => h === 'ondeagir');
      const idxNivel = normHeaders.findIndex((h) => h === 'nivel');
      const idxPrio = normHeaders.findIndex((h) => h === 'prioridade');
      const idxMotivo = normHeaders.findIndex((h) => h.includes('motivodaanalise') || h === 'motivo');

      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!row || row.length === 0) continue;
        const serial = (row[idxSerial !== -1 ? idxSerial : 0] || '').trim().toUpperCase();
        if (!serial || serial === 'SERIAL') continue;

        batimentoItems.push({
          serial,
          materialSap: (row[idxMatSap !== -1 ? idxMatSap : 1] || '').trim().toUpperCase(),
          materialWms: (row[idxMatWms !== -1 ? idxMatWms : 2] || '').trim().toUpperCase(),
          centroSap: (row[idxCenSap !== -1 ? idxCenSap : 5] || '').trim().toUpperCase(),
          depositoSap: (row[idxDepSap !== -1 ? idxDepSap : 6] || '').trim().toUpperCase(),
          centroWms: (row[idxCenWms !== -1 ? idxCenWms : 8] || '').trim().toUpperCase(),
          depositoWms: (row[idxDepWms !== -1 ? idxDepWms : 9] || '').trim().toUpperCase(),
          setorCompletoWms: (row[idxSetorComp !== -1 ? idxSetorComp : 11] || '').trim(),
          localWms: (row[idxLocal !== -1 ? idxLocal : 12] || '').trim().toUpperCase(),
          localAtivo: (row[idxLocalAtivo !== -1 ? idxLocalAtivo : 13] || '').trim().toUpperCase(),
          lote: (row[idxLote !== -1 ? idxLote : 20] || '').trim(),
          loteLiberado: (row[idxLoteLib !== -1 ? idxLoteLib : 21] || '').trim().toUpperCase(),
          statusIqc: (row[idxStatusIqc !== -1 ? idxStatusIqc : 22] || '').trim().toUpperCase(),
          analise: (row[idxAnalise !== -1 ? idxAnalise : 23] || 'OK').trim(),
          ondeAgir: (row[idxOndeAgir !== -1 ? idxOndeAgir : 24] || '').trim(),
          nivel: (row[idxNivel !== -1 ? idxNivel : 25] || '').trim(),
          prioridade: (row[idxPrio !== -1 ? idxPrio : 26] || '').trim(),
          motivo: (row[idxMotivo !== -1 ? idxMotivo : 27] || '').trim(),
        });
      }
    } else if (isGerenciadorEspecificas) {
      // Mapeia "Gerenciador de Informações Específicas" (Sênior WMS)
      const idxOrdemRec = normHeaders.findIndex((h) => h.includes('ordemderecebimento') || h.includes('ordemrecebimento'));
      const idxTipoRec = normHeaders.findIndex((h) => h.includes('tipodorecebimento') || h.includes('tiporecebimento'));
      const idxLote = normHeaders.findIndex((h) => h === 'lote');
      const idxCodProd = normHeaders.findIndex((h) => h.includes('codigodoproduto') || h === 'produto' || h === 'material');
      const idxInfo = normHeaders.findIndex((h) => h === 'informacao');
      const idxValor = normHeaders.findIndex((h) => h === 'valor' || h === 'serie' || h === 'serial');
      const idxOnda = normHeaders.findIndex((h) => h === 'onda');
      const idxNf = normHeaders.findIndex((h) => h.includes('notafiscal'));
      const idxSit = normHeaders.findIndex((h) => h === 'situacao');

      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!row || row.length < 6) continue;
        const infoType = (row[idxInfo !== -1 ? idxInfo : 7] || '').trim().toUpperCase();
        if (infoType && infoType !== 'SERIE' && infoType !== 'SÉRIE' && infoType !== 'SERIAL') continue;

        const serial = (row[idxValor !== -1 ? idxValor : 8] || '').trim().toUpperCase();
        if (!serial || serial === 'VALOR') continue;

        rawSpecificSerials.push({
          serial,
          materialWms: (row[idxCodProd !== -1 ? idxCodProd : 5] || '').trim().toUpperCase(),
          lote: (row[idxLote !== -1 ? idxLote : 3] || '').trim(),
          tipoRecebimento: (row[idxTipoRec !== -1 ? idxTipoRec : 1] || '').trim(),
          ordemRecebimento: (row[idxOrdemRec !== -1 ? idxOrdemRec : 0] || '').trim(),
          onda: (row[idxOnda !== -1 ? idxOnda : 10] || '').trim(),
          notaFiscal: (row[idxNf !== -1 ? idxNf : 11] || '').trim(),
          situacao: (row[idxSit !== -1 ? idxSit : 12] || '0').trim(),
        });
      }
    } else {
      // Mapeia "Estoque Local por Lote" (caso contenha Lote + Local/Setor/Depósito)
      const idxLote = normHeaders.findIndex((h) => h === 'lote' || h.includes('numlote'));
      const idxCodProd = normHeaders.findIndex((h) => h.includes('codigodoproduto') || h.includes('produto') || h.includes('material'));
      const idxLocal = normHeaders.findIndex((h) => h === 'local' || h.includes('endereco') || h.includes('codlocal'));
      const idxSetor = normHeaders.findIndex((h) => h.includes('setor') || h.includes('deposito') || h.includes('conta'));
      const idxSit = normHeaders.findIndex((h) => h.includes('situacao') || h.includes('liberado') || h.includes('bloqueado'));

      if (idxLote !== -1) {
        for (let i = headerIdx + 1; i < matrix.length; i++) {
          const row = matrix[i];
          if (!row) continue;
          const lote = (row[idxLote] || '').trim();
          if (!lote) continue;
          const rawSetor = idxSetor !== -1 ? (row[idxSetor] || '').trim().toUpperCase() : '';
          const rawLocal = idxLocal !== -1 ? (row[idxLocal] || '').trim().toUpperCase() : '';
          const rawMat = idxCodProd !== -1 ? (row[idxCodProd] || '').trim().toUpperCase() : '';
          const rawSit = idxSit !== -1 ? (row[idxSit] || '').trim().toUpperCase() : 'S';

          let cenWms = '';
          let depWms = '';
          const cMatch = rawSetor.match(/B1(23|24|58|59|79|80)/);
          if (cMatch) cenWms = `B1${cMatch[1]}`;
          const dMatch = rawSetor.match(/B(110|114|130|135|136|137|140|148|149|412|413|416)/);
          if (dMatch) depWms = `B${dMatch[1]}`;
          else if (rawSetor.includes('FALTA') || rawLocal.startsWith('F000')) {
            cenWms = rawSetor.includes('SOBRA') ? 'SOBRA/FALTA' : 'FALTA';
            depWms = cenWms;
          }

          loteToLocationMap.set(lote, {
            materialWms: rawMat,
            centroWms: cenWms,
            depositoWms: depWms,
            setorCompletoWms: rawSetor,
            localWms: rawLocal,
            localAtivo: 'S',
            loteLiberado: rawSit.includes('BLOQ') || rawSit === 'N' ? 'N' : 'S',
          });
        }
      }
    }
  }

  // Se subiu tanto Batimento quanto Gerenciador de Informações Específicas, enriquece Batimento com NF/Onda/Ordem
  if (batimentoItems.length > 0) {
    if (rawSpecificSerials.length > 0) {
      const specMap = new Map(rawSpecificSerials.map((s) => [s.serial, s]));
      batimentoItems = batimentoItems.map((it) => {
        const sp = specMap.get(it.serial);
        if (!sp) return it;
        return {
          ...it,
          lote: it.lote || sp.lote,
          ordemRecebimento: sp.ordemRecebimento || it.ordemRecebimento,
          notaFiscal: sp.notaFiscal || it.notaFiscal,
          onda: sp.onda || it.onda,
        };
      });
    }
    return {
      items: batimentoItems,
      detectedType: 'batimento_xlsx',
      sourceMode: 'batimento_xlsx',
      fileNames: uploadedFileNames,
      summaryLabel: `${batimentoItems.length.toLocaleString('pt-BR')} séries carregadas da Planilha de Batimento SAP x WMS`,
    };
  }

  // Caso o usuário tenha subido as bases brutas do Sênior WMS ("Gerenciador de Informações Específicas" + "Estoque Local por Lote")
  // Fazemos o CRUZAMENTO AUTOMÁTICO (Hash Join O(1)) com a Base IQ09 ativa no MIGOU!
  if (rawSpecificSerials.length > 0) {
    const mergedMap = new Map<string, WMSBatimentoItem>();
    const existingWmsSnap = getMemoryWMSBatimentoSnapshot();

    for (const sp of rawSpecificSerials) {
      const iq = lookupSerialInIQ09(sp.serial);
      const prevWms = existingWmsSnap ? lookupSerialInWMSBatimento(sp.serial) : undefined;
      const loteLoc = loteToLocationMap.get(sp.lote);
      const parsedTipo = parseWmsTipoRecebimento(sp.tipoRecebimento);

      const cenSap = iq?.centro || prevWms?.centroSap || '';
      const depSap = iq?.deposito || prevWms?.depositoSap || '';
      const matSap = iq?.material || prevWms?.materialSap || '';

      const cenWms =
        loteLoc?.centroWms ||
        prevWms?.centroWms ||
        parsedTipo.centro ||
        cenSap ||
        '';
      const depWms =
        loteLoc?.depositoWms ||
        prevWms?.depositoWms ||
        parsedTipo.deposito ||
        '';
      const localWms = loteLoc?.localWms || prevWms?.localWms || '';
      const loteLiberado = loteLoc?.loteLiberado || prevWms?.loteLiberado || 'S';
      const localAtivo = loteLoc?.localAtivo || prevWms?.localAtivo || 'S';

      // Calcula o diagnóstico automático de Batimento quando cruzado no navegador
      let analise = prevWms?.analise || 'OK';
      let ondeAgir = prevWms?.ondeAgir || 'Nenhum';
      let prioridade = prevWms?.prioridade || 'Baixa';

      if (!prevWms) {
        if (!depSap) {
          analise = 'Serial existe apenas no WMS';
          ondeAgir = 'A definir';
          prioridade = 'Normal';
        } else if (matSap && sp.materialWms && matSap !== sp.materialWms) {
          analise = 'Material divergente entre SAP e WMS';
          ondeAgir = 'WMS e SAP';
          prioridade = 'Crítico';
        } else if (depSap === 'B111' && (depWms === 'FALTA' || depWms === 'SOBRA/FALTA')) {
          analise = 'Falta - desconsiderar';
          ondeAgir = 'Nenhum';
          prioridade = 'Normal';
        } else if (depSap !== 'B111' && (depWms === 'FALTA' || depWms === 'SOBRA/FALTA')) {
          analise = 'Mover no SAP para B111';
          ondeAgir = 'SAP';
          prioridade = 'Crítico';
        } else if (depSap === 'B111' && depWms && depWms !== 'B111' && depWms !== 'FALTA') {
          analise = 'Validar no físico se existe';
          ondeAgir = 'Físico';
          prioridade = 'Normal';
        } else if (depSap && depWms && depSap !== depWms) {
          analise = 'Mover série para local do setor correto';
          ondeAgir = 'WMS';
          prioridade = 'Normal';
        }
      }

      mergedMap.set(sp.serial, {
        serial: sp.serial,
        materialSap: matSap,
        materialWms: sp.materialWms,
        centroSap: cenSap,
        depositoSap: depSap,
        centroWms: cenWms,
        depositoWms: depWms,
        setorCompletoWms: loteLoc?.setorCompletoWms || prevWms?.setorCompletoWms || sp.tipoRecebimento,
        localWms,
        localAtivo,
        lote: sp.lote,
        loteLiberado,
        analise,
        ondeAgir,
        nivel: 'Série',
        prioridade,
        ordemRecebimento: sp.ordemRecebimento,
        notaFiscal: sp.notaFiscal,
        onda: sp.onda,
      });
    }

    // Adiciona também seriais que estão na IQ09 ativa mas não apareceram no Gerenciador do WMS ("Serial existe apenas no SAP")
    const iqSnap = getMemoryIQ09Snapshot();
    if (iqSnap && iqSnap.items.length > 0) {
      for (const iq of iqSnap.items) {
        const cleanSn = iq.serial.trim().toUpperCase();
        if (!mergedMap.has(cleanSn)) {
          mergedMap.set(cleanSn, {
            serial: cleanSn,
            materialSap: iq.material,
            materialWms: '',
            centroSap: iq.centro,
            depositoSap: iq.deposito,
            centroWms: '',
            depositoWms: '',
            analise: 'Serial existe apenas no SAP',
            ondeAgir: 'A definir',
            nivel: 'Série',
            prioridade: 'Normal',
            motivo: 'Presente na IQ09 SAP, mas ausente no Gerenciador de Informações Específicas do Sênior WMS',
          });
        }
      }
    }

    const mergedList = Array.from(mergedMap.values());
    return {
      items: mergedList,
      detectedType: 'wms_raw_merge',
      sourceMode: 'wms_raw_merge',
      fileNames: uploadedFileNames,
      summaryLabel: `${mergedList.length.toLocaleString('pt-BR')} séries cruzadas automaticamente (Sênior WMS ⟷ SAP IQ09)`,
    };
  }

  throw new Error(
    'Nenhuma coluna reconhecida. Envie a planilha "Batimento_Estoque.xlsx", "Gerenciador de informações específicas.xlsx" ou "Estoque local por lote.csv".'
  );
}

// ============================================================================
// MOTOR "HARD-BREAKER" DE VALIDAÇÃO SÊNIOR WMS ⟷ SAP (TRAVA OPERACIONAL)
// ============================================================================

/**
 * Avalia se uma solicitação de movimentação no MIGOU (Centro, Dep. Origem -> Dep. Destino)
 * é VÁLIDA ou INDEVIDA segundo a posição física real no Sênior WMS (Batimento de Estoque) e na IQ09.
 */
export function evaluateWMSBreakerForTransfer(params: {
  serial: string;
  material?: string;
  centro?: string;
  depositoOrigem?: string;
  depositoDestino: string;
  iq09Item?: IQ09Item;
}): WMSBreakerVerdict {
  const raw = evaluateWMSBreakerForTransferInternal(params);
  return {
    ...raw,
    allowed: raw.isAllowed,
    whyItIsInvalid: raw.whyExplanation,
  };
}

function evaluateWMSBreakerForTransferInternal(params: {
  serial: string;
  material?: string;
  centro?: string;
  depositoOrigem?: string;
  depositoDestino: string;
  iq09Item?: IQ09Item;
}): Omit<WMSBreakerVerdict, 'allowed' | 'whyItIsInvalid'> {
  const cleanSerial = (params.serial || '').trim().toUpperCase();
  const reqCentro = (params.centro || '').trim().toUpperCase();
  const reqOrigem = (params.depositoOrigem || '').trim().toUpperCase();
  const reqDestino = (params.depositoDestino || '').trim().toUpperCase();

  const hasBase = hasActiveWMSBatimentoBase();
  const wms = lookupSerialInWMSBatimento(cleanSerial);
  const iq09 = params.iq09Item || lookupSerialInIQ09(cleanSerial);

  if (!hasBase) {
    return {
      serial: cleanSerial,
      hasWmsBase: false,
      foundInWmsBase: false,
      isAllowed: true,
      severity: 'no_base',
      code: 'NO_WMS_BASE_LOADED',
      badgeLabel: 'Aguardando Base WMS',
      title: 'Base de Batimento Sênior WMS não carregada',
      whyExplanation: 'Importe a base de Batimento de Estoque para ativar a trava do Sênior WMS.',
      buiatteActionPlan: ['Importar planilha de Batimento de Estoque na aba Central IQ09 & WMS.'],
      actionOwner: 'Nenhum',
      iq09Item: iq09,
    };
  }

  const isDestShortage = reqDestino === 'B111' || reqDestino === 'B152';

  // 1. Não encontrado na base de Batimento / Sênior WMS
  if (!wms) {
    if (iq09) {
      // Existe na IQ09, mas não existe no Batimento WMS
      return {
        serial: cleanSerial,
        hasWmsBase: true,
        foundInWmsBase: false,
        isAllowed: isDestShortage, // Só permite se estiver justamente baixando para B111/B152 (falta)
        severity: isDestShortage ? 'approved' : 'blocked_breaker',
        code: isDestShortage ? 'WMS_READY_FOR_B111_SHORTAGE' : 'BLOCKED_ONLY_EXISTS_IN_SAP',
        badgeLabel: isDestShortage ? '✅ S/ Saldo WMS (Baixa B111 OK)' : '🛑 Ausente no Sênior WMS',
        title: isDestShortage
          ? `Apto para Baixa ${reqDestino}: Serial sem saldo físico no Sênior WMS`
          : `Solicitação Indevida: Serial consta no SAP (${iq09.deposito}), mas NÃO existe no Sênior WMS!`,
        whyExplanation: isDestShortage
          ? `O serial ${cleanSerial} consta na IQ09 em ${iq09.deposito} e não possui saldo ativo no Sênior WMS, confirmando a baixa para falta (${reqDestino}).`
          : `Você solicitou mover o serial ${cleanSerial} de ${reqOrigem || iq09.deposito} para ${reqDestino}, mas este serial NÃO consta no Sênior WMS (apenas no SAP em ${iq09.deposito}). Liberar no SAP sem saldo físico no WMS causará furo de estoque.`,
        buiatteActionPlan: isDestShortage
          ? ['Prosseguir com a solicitação de baixa para falta no SAP.']
          : [
              'Validação Sistêmica (Sênior WMS): Consulte o "Gerenciador de Informações Específicas" e "Estoque Local por Lote" para verificar por que a série não consta ativa no WMS.',
              'Alinhamento com Gestores: Caso o item tenha sido encontrado fisicamente no CD, solicite ao supervisor a inclusão/regularização do lote no Sênior WMS ANTES de pedir a movimentação no MIGOU.',
            ],
        actionOwner: isDestShortage ? 'SAP' : 'Gestão',
        iq09Item: iq09,
      };
    }

    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: false,
      isAllowed: false,
      severity: 'not_in_batimento',
      code: 'NOT_FOUND_IN_WMS_BASE',
      badgeLabel: '🛑 Não Existe no WMS/SAP',
      title: `Serial ${cleanSerial} não localizado no Batimento Sênior WMS nem no SAP`,
      whyExplanation: `O número de série "${cleanSerial}" não existe na base do Sênior WMS nem na base do SAP. Pode haver erro de digitação/bipagem ou etiqueta de outro componente.`,
      buiatteActionPlan: [
        'Conferência da Etiqueta: Verifique se o código bipado é realmente o UII/Serial da unidade (e não o EAN ou código de lote).',
        'Consulta no Sênior WMS: Pesquise a série no "Gerenciador de Informações Específicas". Se não existir, alinhe com o supervisor do WMS.',
      ],
      actionOwner: 'WMS',
    };
  }

  const depSap = (iq09?.deposito || wms.depositoSap || '').trim().toUpperCase();
  const cenSap = (iq09?.centro || wms.centroSap || '').trim().toUpperCase();
  const matSap = (iq09?.material || wms.materialSap || '').trim().toUpperCase();
  const depWms = (wms.depositoWms || '').trim().toUpperCase();
  const cenWms = (wms.centroWms || '').trim().toUpperCase();
  const matWms = (wms.materialWms || '').trim().toUpperCase();
  const localWms = wms.localWms || 'S/ Endereço';
  const loteWms = wms.lote || 'S/ Lote';
  const analise = wms.analise || 'OK';
  const analiseUpper = analise.toUpperCase();

  const isOnlyInSap =
    !depWms ||
    analiseUpper.includes('SERIAL EXISTE APENAS NO SAP') ||
    analiseUpper.includes('EXTRAVIO NO SAP');

  const isWmsInFaltaOrSobra =
    depWms === 'FALTA' ||
    depWms === 'SOBRA/FALTA' ||
    depWms === 'INVENTARIO SETORIZAÇÃO' ||
    cenWms === 'FALTA' ||
    cenWms === 'SOBRA/FALTA' ||
    analiseUpper.includes('FALTA - DESCONSIDERAR');

  // 2. Divergência de Material (SKU diferente no SAP vs Sênior WMS)
  if (
    (matSap && matWms && matSap !== matWms) ||
    analiseUpper.includes('MATERIAL DIVERGENTE ENTRE SAP E WMS')
  ) {
    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: false,
      severity: 'blocked_breaker',
      code: 'BLOCKED_MATERIAL_MISMATCH_WMS_SAP',
      badgeLabel: `🛑 SKU Divergente (WMS: ${matWms})`,
      title: `Solicitação Bloqueada: Material Divergente entre SAP (${matSap}) e Sênior WMS (${matWms})`,
      whyExplanation: `No SAP o serial ${cleanSerial} pertence ao material "${matSap}" (${cenSap}/${depSap}), porém no Sênior WMS ele está cadastrado no material "${matWms}" (Lote ${loteWms}, Endereço ${localWms}).`,
      buiatteActionPlan: [
        `Validação Física: Vá até o endereço ${localWms} no armazém e confira na etiqueta física se o produto real é ${matSap} ou ${matWms}.`,
        `Correção Sistêmica / Gestão: Alinhe com o supervisor do Sênior WMS e Key User SAP para acertar o SKU do Lote ${loteWms} antes de movimentar depósitos.`,
      ],
      actionOwner: 'Gestão',
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  // 3. Caso o destino solicitado seja B111 ou B152 (Baixa para Falta de Inventário no SAP)
  if (isDestShortage) {
    if (depSap === reqDestino) {
      return {
        serial: cleanSerial,
        hasWmsBase: true,
        foundInWmsBase: true,
        isAllowed: false,
        severity: 'blocked_breaker',
        code: 'BLOCKED_ALREADY_ALIGNED_BOTH',
        badgeLabel: `🔵 Já está em ${reqDestino} no SAP`,
        title: `Solicitação Redundante: O serial já está em ${reqDestino} no SAP!`,
        whyExplanation: `O serial ${cleanSerial} já consta baixado no depósito de falta ${reqDestino} no SAP (e em "${depWms || 'Sem Saldo'}" no Sênior WMS). Não é necessário solicitar MIGO 311 novamente.`,
        buiatteActionPlan: ['Desconsiderar este serial da lista de solicitação.'],
        actionOwner: 'Nenhum',
        wmsItem: wms,
        iq09Item: iq09,
      };
    }

    if (isWmsInFaltaOrSobra || isOnlyInSap || analiseUpper.includes('MOVER NO SAP PARA B111')) {
      return {
        serial: cleanSerial,
        hasWmsBase: true,
        foundInWmsBase: true,
        isAllowed: true,
        severity: 'approved',
        code: 'WMS_READY_FOR_B111_SHORTAGE',
        badgeLabel: `✅ WMS: ${depWms || 'S/ Saldo'} ➔ ${reqDestino}`,
        title: `Validado pelo Batimento: Pronto para baixar para ${reqDestino} no SAP`,
        whyExplanation: `No SAP o serial está em ${depSap || reqOrigem} (${cenSap || reqCentro}), mas no Sênior WMS já foi segregado em "${depWms || 'Ausente no WMS'}" (Local ${localWms}, Lote ${loteWms} • Status: "${analise}").`,
        buiatteActionPlan: ['Solicitação alinhada com o Batimento de Estoque. Pode prosseguir com o envio para o Time Midea.'],
        actionOwner: 'SAP',
        wmsItem: wms,
        iq09Item: iq09,
      };
    }

    // Se o operador quer mandar para B111 (Falta) no SAP, mas no Sênior WMS o item está em rua ativa de estoque (ex: B110, B114, B413, B148)!
    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: false,
      severity: 'blocked_breaker',
      code: 'BLOCKED_STILL_FREE_IN_WMS_FOR_B111',
      badgeLabel: `🛑 WMS Ativo em ${depWms} (${localWms})`,
      title: `Solicitação Indevida: Serial ainda está ativo em ${depWms} (Local ${localWms}) no Sênior WMS!`,
      whyExplanation: `Você está solicitando baixar o serial ${cleanSerial} para Falta de Inventário (${reqDestino}) no SAP, mas no Sênior WMS ele consta ATIVO no depósito "${depWms}" (Setor: ${wms.setorCompletoWms || cenWms}, Endereço: ${localWms}, Lote: ${loteWms}).`,
      buiatteActionPlan: [
        `Validação Sistêmica (Sênior WMS): Não é permitido baixar um serial para ${reqDestino} no SAP enquanto ele estiver ocupando endereço de estoque (${localWms}) no Sênior WMS.`,
        `Ação no Armazém: Se o item realmente não existe na rua ${localWms}, transfira primeiro o lote ${loteWms} / série para o endereço de FALTA (F0003001011) ou SOBRA/FALTA (F0002001011) no Sênior WMS e alinhe com o gestor.`,
      ],
      actionOwner: 'WMS',
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  // ============================================================================
  // A PARTIR DAQUI: O DESTINO SOLICITADO É UM DEPÓSITO FÍSICO (Ex: B110, B114, B413, B148, B149, B136, B137)
  // Exemplo principal do supervisor: Tirar de B111 (ou B148) ➔ para B110 / B114 / B413
  // ============================================================================

  // 4. Serial existe apenas no SAP (Sem saldo no Sênior WMS! Ex: 269 seriais em B111 que não existem no WMS)
  if (isOnlyInSap) {
    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: false,
      severity: 'blocked_breaker',
      code: 'BLOCKED_ONLY_EXISTS_IN_SAP',
      badgeLabel: `🛑 S/ Saldo no Sênior WMS`,
      title: `Solicitação Recusada: Serial em ${depSap || reqOrigem} no SAP, mas NÃO EXISTE no Sênior WMS!`,
      whyExplanation: `Você solicitou transferir o serial ${cleanSerial} de ${depSap || reqOrigem} para ${reqDestino}, porém no Batimento de Estoque consta: "${analise}" (o serial não possui saldo, lote ou endereço físico ativo no Sênior WMS).`,
      buiatteActionPlan: [
        'Bloqueio Preventivo: Movimentar este serial para o estoque livre no SAP sem ele existir no Sênior WMS gerará corte de pedido imediato.',
        'Validação Sistêmica (Sênior WMS): Verifique no "Gerenciador de Informações Específicas" se o serial foi excluído ou baixado em alguma Onda/NF anterior.',
        'Alinhamento com Gestores: Apresente o serial ao supervisor de inventário para regularização da entrada no Sênior WMS antes de solicitar a MIGO 311.',
      ],
      actionOwner: 'Gestão',
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  // 5. CASO CLÁSSICO DO SUPERVISOR: Tirando de B111 (ou outro) p/ Estoque Livre (ex: B110), mas no Sênior WMS continua em FALTA / SOBRA/FALTA!
  if (isWmsInFaltaOrSobra) {
    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: false,
      severity: 'blocked_breaker',
      code: 'BLOCKED_STILL_FALTA_IN_WMS',
      badgeLabel: `🛑 WMS em ${depWms} (${localWms})`,
      title: `Solicitação Indevida: No Sênior WMS o serial NÃO está em ${reqDestino} (Consta em ${depWms})!`,
      whyExplanation: `O Time Buiatte está solicitando mover o serial ${cleanSerial} de ${depSap || reqOrigem} para ${reqDestino} no SAP, mas no Sênior WMS ele continua alocado no setor "${depWms}" (Endereço de Falta: ${localWms}, Lote: ${loteWms} • Diagnóstico do Batimento: "${analise}").`,
      buiatteActionPlan: [
        `Regra de Ouro Midea x Buiatte: O MIGOU só permite retirar um serial do ${depSap || 'B111'} para ${reqDestino} no SAP quando ele JÁ ESTIVER fisicamente e sistemicamente alocado no depósito ${reqDestino} dentro do Sênior WMS.`,
        `Ação Sistêmica (Sênior WMS): Se o produto foi encontrado fisicamente no armazém, retire-o primeiro do endereço ${localWms} (${depWms}) no Sênior WMS e enderece-o em uma rua ativa do setor ${cenSap || reqCentro}_${reqDestino}.`,
        `Alinhamento com Gestores: Se o item continua em falta física (${analise}), NÃO solicite transferência no MIGOU. Alinhe com o seu supervisor.`,
      ],
      actionOwner: 'WMS',
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  // 6. No Sênior WMS o serial está em OUTRO Depósito diferente do Destino solicitado!
  // (Ex: Pedindo p/ mover p/ B110, mas no Sênior WMS está em B148, B149, B136, B114, DOCA, PACKING, PACKING AG, B140)
  if (depWms !== reqDestino) {
    const isValidSapDepInWms = Boolean(SAP_DEPOSITOS_CATALOG[depWms]);
    const canSuggestWmsDep = isValidSapDepInWms && depWms !== depSap;

    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: false,
      severity: 'blocked_breaker',
      code: 'BLOCKED_WMS_DEPOSIT_MISMATCH',
      badgeLabel: `🛑 WMS está em ${depWms} (≠ ${reqDestino})`,
      title: `Solicitação Indevida: Destino pedido é ${reqDestino}, mas no Sênior WMS está em ${depWms}!`,
      whyExplanation: `Você solicitou movimentar o serial ${cleanSerial} para o depósito "${reqDestino}", porém no Sênior WMS ele está posicionado em "${cenWms} / ${depWms}" (Setor: ${wms.setorCompletoWms || depWms}, Endereço: ${localWms}, Lote: ${loteWms} • Batimento: "${analise}").`,
      buiatteActionPlan: [
        `Validação Sistêmica (Sênior WMS): O depósito de destino no SAP (${reqDestino}) precisa bater exatamente com o depósito atual da série no Sênior WMS (${depWms}).`,
        depWms === 'DOCA' || depWms.includes('PACKING')
          ? `Atenção (Stage/Expedição): No Sênior WMS este serial consta em "${depWms}" (Local ${localWms} • "${analise}"). Verifique se já está em processo de expedição/stage com o supervisor.`
          : `Ação no Sênior WMS: Mova primeiro o lote ${loteWms} (Local ${localWms}) para o setor ${cenSap || reqCentro}_${reqDestino} no Sênior WMS, OU ajuste o depósito destino da sua solicitação para ${depWms}.`,
      ],
      actionOwner: 'WMS',
      suggestedFix: canSuggestWmsDep
        ? {
            material: matSap || matWms,
            centro: cenSap || cenWms || reqCentro,
            depositoOrigem: depSap || reqOrigem,
            depositoDestino: depWms,
            label: `Corrigir Destino para ${depWms} (Espelhar Sênior WMS)`,
          }
        : undefined,
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  // 7. A partir daqui: depWms === reqDestino! (No Sênior WMS já está no depósito de destino!)
  // Vamos verificar se no SAP (depSap) ele TAMBÉM já está no depósito de destino (Solicitação duplicada/redundante)
  if (depSap === reqDestino && (!reqCentro || !cenSap || cenSap === reqCentro)) {
    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: false,
      severity: 'blocked_breaker',
      code: 'BLOCKED_ALREADY_ALIGNED_BOTH',
      badgeLabel: `🔵 Já em ${reqDestino} (SAP & WMS)`,
      title: `Solicitação Desnecessária: O serial já está em ${reqDestino} tanto no SAP quanto no Sênior WMS!`,
      whyExplanation: `O serial ${cleanSerial} já consta alocado no depósito ${reqDestino} (Centro ${cenSap}) no SAP e também em ${depWms} (Endereço ${localWms}, Lote ${loteWms}) no Sênior WMS (Diagnóstico Batimento: "${analise}").`,
      buiatteActionPlan: [
        'Não é necessário solicitar MIGO 311 para o Time Midea, pois o saldo contábil no SAP já está no depósito destino.',
        analise !== 'OK'
          ? `Atenção no WMS: O Batimento aponta "${analise}" (Onde agir: ${wms.ondeAgir || 'WMS'}). Trate essa pendência diretamente no Sênior WMS / Físico.`
          : 'Remova este serial da solicitação atual.',
      ],
      actionOwner: analise !== 'OK' ? 'WMS' : 'Nenhum',
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  // 8. No Sênior WMS já está no depósito destino (depWms === reqDestino) e no SAP está diferente (ex: SAP = B111 ou B148 -> WMS = B110),
  // MAS vamos checar se há bloqueio impeditivo no Sênior WMS (Lote bloqueado em Estoque Livre, Local Inativo, Serial Duplicado, Centro da Rua errado)
  const isFreeStockDest = ['B110', 'B114', 'B413', 'B130', 'B412', 'B416'].includes(reqDestino);
  const hasWmsCriticalLock =
    wms.localAtivo === 'N' ||
    (isFreeStockDest && wms.loteLiberado === 'N') ||
    analiseUpper.includes('SERIAL DUPLICADO NO WMS') ||
    analiseUpper.includes('ATIVAR LOCAL NO WMS') ||
    analiseUpper.includes('DESBLOQUEAR LOTE NO WMS') ||
    (cenSap && cenWms && cenSap !== cenWms && SAP_CENTROS_CATALOG[cenWms] !== undefined);

  if (hasWmsCriticalLock) {
    const lockReason =
      cenSap && cenWms && cenSap !== cenWms
        ? `Centro divergente: no SAP pertence ao Centro ${cenSap}, mas no Sênior WMS está no Centro ${cenWms} (${wms.setorCompletoWms})`
        : wms.localAtivo === 'N'
        ? `O endereço ${localWms} está INATIVO no Sênior WMS (Local Ativo = N)`
        : wms.loteLiberado === 'N'
        ? `O Lote ${loteWms} está BLOQUEADO no Sênior WMS (Lote Liberado = N)`
        : `Pendência crítica no Sênior WMS: "${analise}"`;

    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: false,
      severity: 'blocked_breaker',
      code: 'BLOCKED_WMS_LOTE_OR_LOCAL_LOCKED',
      badgeLabel: `🛑 Bloqueio WMS (${analise.slice(0, 22)})`,
      title: `Solicitação Bloqueada por Pendência no Sênior WMS: ${lockReason}`,
      whyExplanation: `Embora o serial ${cleanSerial} conste no depósito ${depWms} (Local ${localWms}, Lote ${loteWms}), o Batimento de Estoque detectou um impedimento no Sênior WMS: ${lockReason} (Diagnóstico: "${analise}").`,
      buiatteActionPlan: [
        `Validação Sistêmica (Sênior WMS): Regularize primeiro no Sênior WMS (${
          wms.loteLiberado === 'N'
            ? `desbloquear o Lote ${loteWms}`
            : wms.localAtivo === 'N'
            ? `ativar o endereço ${localWms}`
            : `corrigir o setor/centro de ${cenWms} para ${cenSap}`
        }).`,
        'Alinhamento com Gestores: Caso o bloqueio no WMS seja intencional, alinhe com o supervisor antes de liberar o saldo no SAP.',
      ],
      actionOwner: 'WMS',
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  // 9. APROVADO PELO SÊNIOR WMS! (depWms === reqDestino, Lote Liberado, Local Ativo, Centro OK!)
  // Ex: No SAP está em B111 (ou B148/TEMP) e no Sênior WMS JÁ ESTÁ em B110/B114/B413!
  const needsPhysicalAttention =
    depSap === 'B111' ||
    reqOrigem === 'B111' ||
    analiseUpper.includes('VALIDAR NO FÍSICO') ||
    analiseUpper.includes('VALIDAR NO FISICO');

  if (needsPhysicalAttention) {
    return {
      serial: cleanSerial,
      hasWmsBase: true,
      foundInWmsBase: true,
      isAllowed: true,
      severity: 'warning_physical_check',
      code: 'WMS_ALIGNED_NEED_PHYSICAL_CHECK',
      badgeLabel: `✅ WMS em ${depWms} (End: ${localWms})`,
      title: `Validação Sênior WMS Aprovada (${depSap || reqOrigem} ➔ ${reqDestino}) • Endereço ${localWms}`,
      whyExplanation: `Confirmado! No SAP o serial está em ${depSap || reqOrigem} (${cenSap || reqCentro}) e no Sênior WMS ele JÁ CONSTA posicionado no depósito destino ${depWms} (Rua/Local: ${localWms}, Lote: ${loteWms}, Liberado: Sim). Diagnóstico do Batimento: "${analise}".`,
      buiatteActionPlan: [
        `Solicitação Liberada: O Sênior WMS comprova que o serial está alocado em ${depWms} (Local ${localWms}).`,
        `Recomendação Operacional: Por se tratar de recuperação de falta (${depSap || 'B111'}), certifique-se de que a caixa física foi conferida na rua ${localWms} e, se possível, anexe a foto da etiqueta.`,
      ],
      actionOwner: 'Físico',
      wmsItem: wms,
      iq09Item: iq09,
    };
  }

  return {
    serial: cleanSerial,
    hasWmsBase: true,
    foundInWmsBase: true,
    isAllowed: true,
    severity: 'approved',
    code: 'WMS_ALIGNED_OK',
    badgeLabel: `✅ WMS OK: ${depWms} (${localWms})`,
    title: `100% Validado no Sênior WMS: Alocado em ${depWms} (Local ${localWms} • Lote ${loteWms})`,
    whyExplanation: `O Sênior WMS confirma que o serial ${cleanSerial} já está posicionado e ativo no depósito destino ${depWms} (Endereço ${localWms}, Lote ${loteWms}), pronto para a movimentação contábil ${depSap || reqOrigem} ➔ ${reqDestino} no SAP!`,
    buiatteActionPlan: ['Validação concluída com sucesso. Solicitação liberada para envio ao Time Midea.'],
    actionOwner: 'Nenhum',
    wmsItem: wms,
    iq09Item: iq09,
  };
}

// ============================================================================
// AMOSTRA OFICIAL REALISTA EXTRAÍDA DO ARQUIVO Batimento_Estoque_2026-11-14_1047.xlsx
// ============================================================================

export function getOfficialSampleWMSBatimentoItems(): WMSBatimentoItem[] {
  return [
    // 1. Casos onde SAP = B111 (Falta), MAS no Sênior WMS JÁ ESTÁ em B110 / B413 / B114 (PERMITIDOS pelo Breaker quando Buiatte pede B111 -> Livre!)
    {
      serial: '541310A084AB7041060377',
      materialSap: 'MDRD142FGD303',
      materialWms: 'MDRD142FGD303',
      centroSap: 'B124',
      depositoSap: 'B111',
      centroWms: 'B124',
      depositoWms: 'B110',
      setorCompletoWms: 'B124_B110 - E-COMM IMP. (PPP)',
      localWms: 'R12058011',
      localAtivo: 'S',
      lote: '3023984',
      loteLiberado: 'S',
      analise: 'Validar no físico se existe',
      ondeAgir: 'Físico',
      nivel: 'Série',
      prioridade: 'Normal',
    },
    {
      serial: 'S3226B22654424',
      materialSap: '38EZVCC12M5',
      materialWms: '38EZVCC12M5',
      centroSap: 'B179',
      depositoSap: 'B111',
      centroWms: 'B179',
      depositoWms: 'B413',
      setorCompletoWms: 'B179_B413 - GARANTIA PRODUTO',
      localWms: 'R18151051',
      localAtivo: 'S',
      lote: '3334816',
      loteLiberado: 'S',
      analise: 'Validar no físico se existe',
      ondeAgir: 'Físico',
      nivel: 'Série',
      prioridade: 'Normal',
    },
    {
      serial: 'S1326B21294802',
      materialSap: 'QCL108BB',
      materialWms: 'QCL108BB',
      centroSap: 'B179',
      depositoSap: 'B111',
      centroWms: 'B179',
      depositoWms: 'B413',
      setorCompletoWms: 'B179_B413 - GARANTIA PRODUTO',
      localWms: 'R18112031',
      localAtivo: 'S',
      lote: '3316044',
      loteLiberado: 'S',
      analise: 'Validar no físico se existe',
      ondeAgir: 'Físico',
      nivel: 'Série',
      prioridade: 'Normal',
    },

    // 2. Casos onde SAP = B111, E no Sênior WMS CONTINUA EM FALTA (BLOQUEADOS pelo Breaker se Buiatte pedir B111 -> B110/B114!)
    {
      serial: '541310A084AB6171050187',
      materialSap: 'MDRD142FGD303',
      materialWms: 'MDRD142FGD303',
      centroSap: 'B124',
      depositoSap: 'B111',
      centroWms: 'FALTA',
      depositoWms: 'FALTA',
      setorCompletoWms: 'FALTA',
      localWms: 'F0003001011',
      localAtivo: 'S',
      lote: '3036871',
      loteLiberado: 'S',
      analise: 'Falta - desconsiderar',
      ondeAgir: 'Nenhum',
      nivel: 'Nenhum',
      prioridade: 'Normal',
    },
    {
      serial: '511310A08E3B3190521163',
      materialSap: 'MDRT533EVD012',
      materialWms: 'MDRT533EVD012',
      centroSap: 'B123',
      depositoSap: 'B111',
      centroWms: 'FALTA',
      depositoWms: 'FALTA',
      setorCompletoWms: 'FALTA',
      localWms: 'F0003001011',
      localAtivo: 'S',
      lote: '3056592',
      loteLiberado: 'S',
      analise: 'Falta - desconsiderar',
      ondeAgir: 'Nenhum',
      nivel: 'Nenhum',
      prioridade: 'Normal',
    },
    {
      serial: '5400W60300166190170170',
      materialSap: '40KWFLB',
      materialWms: '40KWFLB',
      centroSap: 'B158',
      depositoSap: 'B111',
      centroWms: 'FALTA',
      depositoWms: 'FALTA',
      setorCompletoWms: 'FALTA',
      localWms: 'F0003001011',
      localAtivo: 'S',
      lote: '3253013',
      loteLiberado: 'S',
      analise: 'Falta - desconsiderar',
      ondeAgir: 'Nenhum',
      nivel: 'Nenhum',
      prioridade: 'Normal',
    },
    {
      serial: 'S1326B21294807',
      materialSap: 'QCL108BB',
      materialWms: 'QCL108BB',
      centroSap: 'B158',
      depositoSap: 'B111',
      centroWms: 'FALTA',
      depositoWms: 'FALTA',
      setorCompletoWms: 'FALTA',
      localWms: 'F0003001011',
      localAtivo: 'S',
      lote: '3253099',
      loteLiberado: 'S',
      analise: 'Falta - desconsiderar',
      ondeAgir: 'Nenhum',
      nivel: 'Nenhum',
      prioridade: 'Normal',
    },

    // 3. Casos onde SAP = B111, mas NÃO EXISTE no Sênior WMS ("Serial existe apenas no SAP" — BLOQUEADOS para ir p/ Livre!)
    {
      serial: '5416110005FB1241600777',
      materialSap: 'PP5MS1',
      materialWms: '',
      centroSap: 'B124',
      depositoSap: 'B111',
      centroWms: '',
      depositoWms: '',
      setorCompletoWms: '',
      localWms: '',
      localAtivo: '',
      lote: '',
      loteLiberado: '',
      analise: 'Serial existe apenas no SAP',
      ondeAgir: 'A definir',
      nivel: 'Série',
      prioridade: 'Normal',
    },
    {
      serial: 'S2325B18757242',
      materialSap: '38CCVD36515MM',
      materialWms: '',
      centroSap: 'B179',
      depositoSap: 'B111',
      centroWms: '',
      depositoWms: '',
      setorCompletoWms: '',
      localWms: '',
      localAtivo: '',
      lote: '',
      loteLiberado: '',
      analise: 'Serial existe apenas no SAP',
      ondeAgir: 'A definir',
      nivel: 'Série',
      prioridade: 'Normal',
    },

    // 4. Casos "Mover no SAP para B111" (SAP = B110/B114/B148, e no Sênior WMS já está em SOBRA/FALTA ou FALTA -> APROVADOS p/ baixar p/ B111!)
    {
      serial: '541310A084AB6151060003',
      materialSap: 'MDRD142FGD303',
      materialWms: 'MDRD142FGD303',
      centroSap: 'B124',
      depositoSap: 'B110',
      centroWms: 'SOBRA/FALTA',
      depositoWms: 'SOBRA/FALTA',
      setorCompletoWms: 'SOBRA/FALTA',
      localWms: 'F0002001011',
      localAtivo: 'S',
      lote: '3067696',
      loteLiberado: 'S',
      analise: 'Mover no SAP para B111',
      ondeAgir: 'SAP',
      nivel: 'Série',
      prioridade: 'Crítico',
    },
    {
      serial: 'S3626B23073126',
      materialSap: '42EFVCB12M5',
      materialWms: '42EFVCB12M5',
      centroSap: 'B123',
      depositoSap: 'B110',
      centroWms: 'SOBRA/FALTA',
      depositoWms: 'SOBRA/FALTA',
      setorCompletoWms: 'SOBRA/FALTA',
      localWms: 'F0002001011',
      localAtivo: 'S',
      lote: '3181699',
      loteLiberado: 'S',
      analise: 'Mover no SAP para B111',
      ondeAgir: 'SAP',
      nivel: 'Série',
      prioridade: 'Crítico',
    },
    {
      serial: 'S2726B22172837',
      materialSap: '42EFVCA12M5',
      materialWms: '42EFVCA12M5',
      centroSap: 'B158',
      depositoSap: 'B114',
      centroWms: 'SOBRA/FALTA',
      depositoWms: 'SOBRA/FALTA',
      setorCompletoWms: 'SOBRA/FALTA',
      localWms: 'F0002001011',
      localAtivo: 'S',
      lote: '3022051',
      loteLiberado: 'S',
      analise: 'Mover no SAP para B111',
      ondeAgir: 'SAP',
      nivel: 'Série',
      prioridade: 'Crítico',
    },

    // 5. Casos de Liberação de Triagem (SAP = B148 -> Sênior WMS já em B110 / B149 -> APROVADOS!)
    {
      serial: '541760002ZGB4133400502',
      materialSap: 'MDWTF08B1',
      materialWms: 'MDWTF08B1',
      centroSap: 'B124',
      depositoSap: 'B148',
      centroWms: 'B124',
      depositoWms: 'B110',
      setorCompletoWms: 'B124_B110 - E-COMM IMP. (PPP)',
      localWms: 'R11042011',
      localAtivo: 'S',
      lote: '3218501',
      loteLiberado: 'S',
      analise: 'Mover no SAP para o depósito do IQC',
      ondeAgir: 'SAP',
      nivel: 'Série',
      prioridade: 'Normal',
    },
    {
      serial: '541760002ZGB4133400533',
      materialSap: 'MDWTF08B1',
      materialWms: 'MDWTF08B1',
      centroSap: 'B124',
      depositoSap: 'B148',
      centroWms: 'B124',
      depositoWms: 'B110',
      setorCompletoWms: 'B124_B110 - E-COMM IMP. (PPP)',
      localWms: 'R11042012',
      localAtivo: 'S',
      lote: '3218501',
      loteLiberado: 'S',
      analise: 'Mover no SAP para o depósito do IQC',
      ondeAgir: 'SAP',
      nivel: 'Série',
      prioridade: 'Normal',
    },
    {
      serial: 'S2126B40334944',
      materialSap: 'MRAS22',
      materialWms: 'MRAS22',
      centroSap: 'B123',
      depositoSap: 'B148',
      centroWms: 'B123',
      depositoWms: 'B149',
      setorCompletoWms: 'B123_B149 - AVARIA E-COMM NAC (OUTLET)',
      localWms: 'R16137011',
      localAtivo: 'S',
      lote: '3331163',
      loteLiberado: 'S',
      statusIqc: 'B149',
      analise: 'Mover no SAP para o depósito do IQC',
      ondeAgir: 'SAP',
      nivel: 'Série',
      prioridade: 'Normal',
    },

    // 6. Casos de Divergências de Material, Lote Bloqueado eJá Alinhados (OK)
    {
      serial: '541330A0724B5291050232',
      materialSap: 'MDRX150FGG502',
      materialWms: 'MDWTF08B2',
      centroSap: 'B124',
      depositoSap: 'B110',
      centroWms: 'B124',
      depositoWms: 'B148',
      setorCompletoWms: 'B124_B148 - E-COMM IMP. (AVARIA EMBAL)',
      localWms: 'R09023011',
      localAtivo: 'S',
      lote: '3218581',
      loteLiberado: 'S',
      statusIqc: 'B110',
      analise: 'Material divergente entre SAP e WMS',
      ondeAgir: 'A definir',
      nivel: 'A definir',
      prioridade: 'Crítico',
    },
    {
      serial: 'S3926B23411761',
      materialSap: 'QCL105BB',
      materialWms: 'QCL105BB',
      centroSap: 'B123',
      depositoSap: 'B110',
      centroWms: 'B123',
      depositoWms: 'B110',
      setorCompletoWms: 'B123_B110 - E-COMM NAC - PPP',
      localWms: 'R16024021',
      localAtivo: 'S',
      lote: '3275592',
      loteLiberado: 'N',
      analise: 'Desbloquear lote no WMS',
      ondeAgir: 'WMS',
      nivel: 'Série',
      prioridade: 'Crítico',
    },
    {
      serial: 'S2726B22177213',
      materialSap: '40KVQF60M5B',
      materialWms: '40KVQF60M5B',
      centroSap: 'B158',
      depositoSap: 'B114',
      centroWms: 'B158',
      depositoWms: 'B114',
      setorCompletoWms: 'B158_B114 - LOJAS NAC (PPP)',
      localWms: 'R23108041',
      localAtivo: 'S',
      lote: '3048416',
      loteLiberado: 'S',
      analise: 'OK',
      ondeAgir: 'Nenhum',
      nivel: 'Nenhum',
      prioridade: 'Baixa',
    },
    {
      serial: 'S4221B10960628',
      materialSap: 'QQI075BB',
      materialWms: 'QQI075BB',
      centroSap: 'B179',
      depositoSap: 'B413',
      centroWms: 'B179',
      depositoWms: 'B413',
      setorCompletoWms: 'B179_B413 - GARANTIA PRODUTO',
      localWms: 'R18040011',
      localAtivo: 'S',
      lote: '3105300',
      loteLiberado: 'S',
      analise: 'OK',
      ondeAgir: 'Nenhum',
      nivel: 'Nenhum',
      prioridade: 'Baixa',
    },
  ];
}
