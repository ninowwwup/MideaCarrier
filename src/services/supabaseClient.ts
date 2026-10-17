import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'midea_transfer_supabase_url';
const STORAGE_KEY_KEY = 'midea_transfer_supabase_anon_key';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  const storedUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) || '' : '';
  const storedKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_KEY) || '' : '';

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
    supabaseInstance = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    lastUrl = url;
    lastKey = anonKey;
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
    // Tenta uma query de verificação na tabela transfer_requests
    const { error } = await tempClient.from('transfer_requests').select('count', { count: 'exact', head: true });
    
    if (error) {
      if (error.code === '42P01') {
        // Tabela ainda não foi criada, mas a conexão foi bem-sucedida!
        return {
          success: true,
          message: 'Conectado ao Supabase com sucesso! A tabela "transfer_requests" ainda não existe. Use o gerador de SQL abaixo para criá-la.',
        };
      }
      return {
        success: false,
        message: `Falha na consulta: ${error.message} (${error.code || 'erro'})`,
      };
    }

    return {
      success: true,
      message: 'Conexão validada com sucesso! Tabela "transfer_requests" pronta para sincronização.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Erro desconhecido ao conectar ao Supabase',
    };
  }
}
