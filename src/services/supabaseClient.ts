import { SupabaseClient } from '@supabase/supabase-js';
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

/**
 * Retorna null pois o banco de dados principal agora é Google Planilhas via Google Apps Script
 */
export function getSupabase(): SupabaseClient | null {
  return null;
}
