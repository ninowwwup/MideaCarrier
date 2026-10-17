import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'midea_transfer_supabase_url';
const STORAGE_KEY_KEY = 'midea_transfer_supabase_anon_key';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// Identificador único da sessão/dispositivo atual (para saber se o alerta deve soar em outra máquina)
export const CURRENT_CLIENT_ID = typeof window !== 'undefined'
  ? (sessionStorage.getItem('midea_client_id') || (() => {
      const id = 'client_' + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('midea_client_id', id);
      return id;
    })())
  : 'server_client';

export function getSupabaseConfig(): SupabaseConfig {
  let envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  let envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  let storedUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) || '' : '';
  let storedKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_KEY) || '' : '';

  // Suporte a importação automática por URL (Query param ou Hash)
  // Exemplo: https://midea-carrier.vercel.app/#sb_url=https://xyz.supabase.co&sb_key=eyJ...
  if (typeof window !== 'undefined' && (!storedUrl || !storedKey)) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      const paramUrl = urlParams.get('sb_url') || hashParams.get('sb_url') || urlParams.get('supabaseUrl');
      const paramKey = urlParams.get('sb_key') || hashParams.get('sb_key') || urlParams.get('supabaseKey');

      if (paramUrl && paramKey) {
        saveSupabaseConfig({ url: paramUrl, anonKey: paramKey });
        storedUrl = paramUrl;
        storedKey = paramKey;
        // Limpar parâmetros da URL para ficar limpa e segura
        if (window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    } catch (e) {
      console.warn('Erro ao ler credenciais da URL:', e);
    }
  }

  return {
    url: storedUrl || envUrl,
    anonKey: storedKey || envKey,
  };
}

export function saveSupabaseConfig(config: SupabaseConfig) {
  if (typeof window !== 'undefined') {
    if (config.url) {
      localStorage.setItem(STORAGE_KEY_URL, config.url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_URL);
    }

    if (config.anonKey) {
      localStorage.setItem(STORAGE_KEY_KEY, config.anonKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_KEY);
    }
    // Reset instance to reconnect with new credentials
    supabaseInstance = null;
  }
}

let supabaseInstance: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export function getSupabase(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  if (supabaseInstance && lastUrl === url && lastKey === anonKey) {
    return supabaseInstance;
  }

  try {
    supabaseInstance = createClient(url.trim(), anonKey.trim(), {
      auth: { persistSession: false },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    lastUrl = url.trim();
    lastKey = anonKey.trim();
    return supabaseInstance;
  } catch (error) {
    console.error('Erro ao inicializar Supabase client:', error);
    return null;
  }
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const tempClient = createClient(url.trim(), anonKey.trim(), {
      auth: { persistSession: false },
    });
    const { error } = await tempClient.from('transfer_requests').select('id', { count: 'exact', head: true });
    
    if (error) {
      if (error.code === '42P01') {
        return {
          success: true,
          message: 'Conectado ao Supabase! A tabela "transfer_requests" ainda não existe. Use o botão para gerar o script SQL.',
        };
      }
      return {
        success: false,
        message: `Falha na conexão: ${error.message} (${error.code || 'erro'})`,
      };
    }

    return {
      success: true,
      message: 'Conexão em Tempo Real validada com sucesso! Sincronização imediata ativa.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Erro desconhecido ao conectar ao Supabase',
    };
  }
}

/**
 * Gera o link compartilhável com a configuração do Supabase
 * para que ao abrir no outro computador, ele se conecte instantaneamente ao mesmo banco!
 */
export function getShareableConnectedUrl(): string {
  if (typeof window === 'undefined') return '';
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return window.location.origin;

  const base = window.location.origin + window.location.pathname;
  return `${base}#sb_url=${encodeURIComponent(url)}&sb_key=${encodeURIComponent(anonKey)}`;
}
