/**
 * CONFIGURAÇÃO DEFINITIVA DO BANCO DE DADOS & BACKEND (GOOGLE PLANILHAS)
 * 
 * MIGOU - Midea Transfer Hub
 * 
 * O sistema utiliza o Google Planilhas via Google Apps Script (Web App)
 * como banco de dados em nuvem gratuito e perpétuo:
 * 1. Sem restrições de cota paga ou surpresas de cobrança.
 * 2. Visualização humana direta das transferências na planilha pelo time.
 * 3. Sincronização em tempo real entre todos os computadores.
 * 4. A URL pode ser configurada via variáveis de ambiente da Vercel ou
 *    diretamente no navegador pelo Administrador no Modal de Diagnóstico.
 */

import { 
  getGoogleSheetsUrl, 
  saveGoogleSheetsUrl, 
  clearGoogleSheetsUrl, 
  isGoogleSheetsConfigured,
  DEFAULT_PRODUCTION_SHEETS_URL
} from '../services/googleSheetsClient';

export {
  getGoogleSheetsUrl,
  saveGoogleSheetsUrl,
  clearGoogleSheetsUrl,
  isGoogleSheetsConfigured,
  DEFAULT_PRODUCTION_SHEETS_URL
};

// URL padrão inicial ativa
export const DEFAULT_GOOGLE_SHEETS_URL = DEFAULT_PRODUCTION_SHEETS_URL;

/**
 * Funções de compatibilidade para transição suave do Supabase -> Google Planilhas
 */
export function getEffectiveSupabaseCredentials(): { url: string; anonKey: string } {
  return { url: '', anonKey: '' };
}

export function saveStoredSupabaseCredentials(_url: string, _anonKey: string): void {}

export function clearStoredSupabaseCredentials(): void {}

export function isSupabaseDirectConfigured(): boolean {
  return false;
}
