/**
 * CONFIGURAÇÃO DEFINITIVA DO BANCO DE DADOS & BACKEND
 * 
 * Este arquivo faz parte do repositório no GitHub para deploy na Vercel:
 * https://midea-carrier.vercel.app/
 * 
 * O sistema opera de forma autônoma e em tempo real (In-time):
 * 1. Se VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estiverem preenchidas
 *    (seja nas Environment Variables da Vercel ou fixadas nas constantes abaixo),
 *    o app conecta diretamente ao Supabase com WebSockets Realtime.
 * 2. Caso contrário, o app utiliza automaticamente o backend na Vercel (/api/transfers),
 *    sincronizando todos os computadores instantaneamente, sem exibir NENHUMA tela de
 *    input de chaves ou senha para os operadores dos times Buiatte ou Midea.
 */

// 1. Variáveis de ambiente fornecidas pela Vercel / Vite
const ENV_URL = 
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  (import.meta as any).env?.SUPABASE_URL ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const ENV_KEY = 
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.SUPABASE_ANON_KEY ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta as any).env?.SUPABASE_PUBLISHABLE_KEY ||
  '';

// 2. Chaves diretas no repositório (opcional caso prefira embutir direto no código do GitHub):
// Cole aqui sua URL e Anon Key do seu projeto Supabase se não quiser cadastrar na tela da Vercel.
export const CONFIGURED_SUPABASE_URL = ENV_URL || 'https://oxowlylcgunqkvuvtqyv.supabase.co';
export const CONFIGURED_SUPABASE_ANON_KEY = ENV_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94b3dseWxjZ3VucWt2dXZ0cXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODI3NjgsImV4cCI6MjEwNzc1ODc2OH0.08UtAFS9JkSoqmo7qUKZWXE73kbdbWol8ce_JiDL_P4';

export function getEffectiveSupabaseCredentials(): { url: string; anonKey: string } {
  // 1. Variáveis de ambiente da Vercel / Vite
  if (ENV_URL && ENV_KEY) {
    return { url: ENV_URL.trim(), anonKey: ENV_KEY.trim() };
  }

  // 2. Chaves diretas do arquivo de configuração
  if (CONFIGURED_SUPABASE_URL && CONFIGURED_SUPABASE_ANON_KEY) {
    return { url: CONFIGURED_SUPABASE_URL.trim(), anonKey: CONFIGURED_SUPABASE_ANON_KEY.trim() };
  }

  // 3. Fallback de cache local persistente
  if (typeof window !== 'undefined') {
    const cachedUrl = localStorage.getItem('midea_transfer_supabase_url') || '';
    const cachedKey = localStorage.getItem('midea_transfer_supabase_anon_key') || '';
    if (cachedUrl && cachedKey) {
      return { url: cachedUrl.trim(), anonKey: cachedKey.trim() };
    }
  }

  return { url: '', anonKey: '' };
}

export function isSupabaseDirectConfigured(): boolean {
  const { url, anonKey } = getEffectiveSupabaseCredentials();
  return Boolean(url && anonKey);
}
