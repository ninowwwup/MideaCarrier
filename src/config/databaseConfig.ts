/**
 * CONFIGURAÇÃO DEFINITIVA DO BANCO DE DADOS SUPABASE
 * 
 * Este arquivo faz parte do repositório no seu GitHub.
 * Desta forma, quando a Vercel compilar e publicar o app,
 * QUALQUER computador ou celular que abrir o link:
 *   https://midea-carrier.vercel.app/
 * já estará 100% conectado e sincronizado em tempo real (estilo AppSheet)
 * SEM PRECISAR DE NENHUMA TELA DE LOGIN OU INPUT DE CHAVES POR PARTE DOS OPERADORES!
 */

// Se configurado nas Environment Variables da Vercel (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY):
const ENV_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const ENV_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

// Fallback direto no código (opcional caso não queira usar a tela de variáveis da Vercel):
// Cole aqui sua URL e Anon Key do Supabase se desejar que fiquem fixos diretamente no build do GitHub.
export const CONFIGURED_SUPABASE_URL = ENV_URL || '';
export const CONFIGURED_SUPABASE_ANON_KEY = ENV_KEY || '';

export function getEffectiveSupabaseCredentials(): { url: string; anonKey: string } {
  // 1. Variáveis de ambiente da Vercel / Vite
  if (ENV_URL && ENV_KEY) {
    return { url: ENV_URL.trim(), anonKey: ENV_KEY.trim() };
  }

  // 2. Chaves diretas do arquivo de configuração do repositório
  if (CONFIGURED_SUPABASE_URL && CONFIGURED_SUPABASE_ANON_KEY) {
    return { url: CONFIGURED_SUPABASE_URL.trim(), anonKey: CONFIGURED_SUPABASE_ANON_KEY.trim() };
  }

  // 3. Fallback de cache local persistente (sem exibir nada para o usuário)
  if (typeof window !== 'undefined') {
    const cachedUrl = localStorage.getItem('midea_transfer_supabase_url') || '';
    const cachedKey = localStorage.getItem('midea_transfer_supabase_anon_key') || '';
    if (cachedUrl && cachedKey) {
      return { url: cachedUrl.trim(), anonKey: cachedKey.trim() };
    }
  }

  return { url: '', anonKey: '' };
}
