import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEffectiveSupabaseCredentials, saveStoredSupabaseCredentials, clearStoredSupabaseCredentials } from '../config/databaseConfig';

export { saveStoredSupabaseCredentials, clearStoredSupabaseCredentials };

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// Identificador único da sessão/dispositivo atual (para saber se o alerta deve soar no outro computador)
export const CURRENT_CLIENT_ID = typeof window !== 'undefined'
  ? (sessionStorage.getItem('midea_client_id') || (() => {
      const id = 'client_' + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('midea_client_id', id);
      return id;
    })())
  : 'server_client';

export function getSupabaseConfig(): SupabaseConfig {
  return getEffectiveSupabaseCredentials();
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
