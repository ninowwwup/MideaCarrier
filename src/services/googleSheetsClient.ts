import { TransferItem } from '../types/transfer';

const STORAGE_SHEETS_URL_KEY = 'midea_transfer_google_sheets_url';

// URL padrão configurada nas variáveis de ambiente da Vercel / Vite
const ENV_SHEETS_URL = 
  (import.meta as any).env?.VITE_GOOGLE_SHEETS_URL ||
  (import.meta as any).env?.GOOGLE_SHEETS_URL ||
  '';

/**
 * Obtém a URL ativa do Google Apps Script Web App
 */
export function getGoogleSheetsUrl(): string {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(STORAGE_SHEETS_URL_KEY);
    if (cached && cached.trim()) {
      return cached.trim();
    }
  }
  return ENV_SHEETS_URL.trim();
}

/**
 * Salva a URL do Google Apps Script no navegador local
 */
export function saveGoogleSheetsUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = url.trim();
  if (clean) {
    localStorage.setItem(STORAGE_SHEETS_URL_KEY, clean);
  } else {
    localStorage.removeItem(STORAGE_SHEETS_URL_KEY);
  }
}

/**
 * Remove a URL personalizada do Google Apps Script
 */
export function clearGoogleSheetsUrl(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_SHEETS_URL_KEY);
}

/**
 * Verifica se o Google Planilhas está configurado
 */
export function isGoogleSheetsConfigured(): boolean {
  return Boolean(getGoogleSheetsUrl());
}

/**
 * Testa a conexão rápida com o Google Apps Script (Ping)
 */
export async function pingGoogleSheets(customUrl?: string): Promise<{ ok: boolean; message: string; details?: string }> {
  const url = (customUrl || getGoogleSheetsUrl()).trim();
  if (!url) {
    return {
      ok: false,
      message: 'URL do Google Apps Script não configurada.',
      details: 'Cole a URL do App da Web gerada no Google Apps Script (terminada em /exec).'
    };
  }

  try {
    const separator = url.includes('?') ? '&' : '?';
    const pingUrl = `${url}${separator}action=ping&_t=${Date.now()}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(pingUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return {
          ok: true,
          message: 'Google Planilhas Conectado com Sucesso!',
          details: `Planilha online e respondendo em tempo real via Google Apps Script.`
        };
      }
    }

    return {
      ok: false,
      message: `Google Apps Script retornou código ${res.status}`,
      details: 'Verifique se a implantação do App da Web foi feita com acesso permitido para "Qualquer pessoa".'
    };
  } catch (err: any) {
    return {
      ok: false,
      message: 'Falha ao conectar ao Google Apps Script.',
      details: err?.name === 'AbortError' 
        ? 'Tempo limite de resposta excedido (6s). Verifique sua conexão e a URL.'
        : String(err?.message || err)
    };
  }
}

/**
 * Consulta todas as transferências salvas na Planilha Google
 */
export async function fetchGoogleSheetsItems(customUrl?: string): Promise<TransferItem[] | null> {
  const url = (customUrl || getGoogleSheetsUrl()).trim();
  if (!url) return null;

  try {
    const separator = url.includes('?') ? '&' : '?';
    const readUrl = `${url}${separator}action=read&_t=${Date.now()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(readUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json && json.success && Array.isArray(json.items)) {
        return json.items;
      }
    }
    return null;
  } catch (err) {
    console.warn('Google Sheets client fetch error:', err);
    return null;
  }
}

/**
 * Insere novas transferências na Planilha Google
 * Usa 'text/plain' para evitar preflight CORS no Google Apps Script
 */
export async function insertGoogleSheetsItems(items: TransferItem[], customUrl?: string): Promise<boolean> {
  const url = (customUrl || getGoogleSheetsUrl()).trim();
  if (!url || items.length === 0) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'insert', items }),
    });

    if (res.ok) {
      const json = await res.json().catch(() => null);
      return Boolean(json?.success);
    }
    return false;
  } catch (err) {
    console.warn('Google Sheets client insert error:', err);
    return false;
  }
}

/**
 * Atualiza status e campos de transferências na Planilha Google
 */
export async function updateGoogleSheetsItems(items: TransferItem[], customUrl?: string): Promise<boolean> {
  const url = (customUrl || getGoogleSheetsUrl()).trim();
  if (!url || items.length === 0) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', items }),
    });

    if (res.ok) {
      const json = await res.json().catch(() => null);
      return Boolean(json?.success);
    }
    return false;
  } catch (err) {
    console.warn('Google Sheets client update error:', err);
    return false;
  }
}

/**
 * Exclui itens da Planilha Google pelo ID
 */
export async function deleteGoogleSheetsItems(ids: string[], customUrl?: string): Promise<boolean> {
  const url = (customUrl || getGoogleSheetsUrl()).trim();
  if (!url || ids.length === 0) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', ids }),
    });

    if (res.ok) {
      const json = await res.json().catch(() => null);
      return Boolean(json?.success);
    }
    return false;
  } catch (err) {
    console.warn('Google Sheets client delete error:', err);
    return false;
  }
}

/**
 * Zera todas as transferências na Planilha Google (mantendo cabeçalho)
 */
export async function clearGoogleSheets(customUrl?: string): Promise<boolean> {
  const url = (customUrl || getGoogleSheetsUrl()).trim();
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'clear' }),
    });

    if (res.ok) {
      const json = await res.json().catch(() => null);
      return Boolean(json?.success);
    }
    return false;
  } catch (err) {
    console.warn('Google Sheets client clear error:', err);
    return false;
  }
}
