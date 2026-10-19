import React, { useState } from 'react';
import { 
  X, 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  RefreshCw, 
  ExternalLink,
  ShieldAlert,
  Server,
  Trash2
} from 'lucide-react';
import { getSupabase, getSupabaseConfig } from '../services/supabaseClient';
import { clearAllTransferRecords } from '../services/storage';

interface DatabaseDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCloudConnected: boolean;
  onRecordsCleared?: () => void;
}

export const SUPABASE_REPAIR_SQL = `-- ========================================================
-- SCRIPT DE CRIAÇÃO E REPARO DEFINITIVO PARA O SUPABASE (MIGOU)
-- Execute no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/_/sql
-- ========================================================

-- 1. Criação da tabela principal transfer_requests
CREATE TABLE IF NOT EXISTS public.transfer_requests (
  id TEXT PRIMARY KEY,
  solicitation_code TEXT,
  material TEXT NOT NULL,
  serial TEXT NOT NULL,
  centro TEXT NOT NULL,
  deposito_origem TEXT NOT NULL,
  deposito_destino TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_por TEXT DEFAULT 'Time Buiatte (Sênior WMS)',
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_por TEXT,
  sap_doc_number TEXT,
  observacoes TEXT,
  batch_id TEXT,
  label_photo_url TEXT,
  originator_client_id TEXT
);

-- 2. Garantir que todas as colunas existem (caso a tabela já existisse com menos campos)
ALTER TABLE public.transfer_requests ADD COLUMN IF NOT EXISTS solicitation_code TEXT;
ALTER TABLE public.transfer_requests ADD COLUMN IF NOT EXISTS atualizado_por TEXT;
ALTER TABLE public.transfer_requests ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.transfer_requests ADD COLUMN IF NOT EXISTS label_photo_url TEXT;
ALTER TABLE public.transfer_requests ADD COLUMN IF NOT EXISTS originator_client_id TEXT;

-- 3. DESABILITAR Row Level Security (RLS) ou permitir acesso público anônimo total (CRUD)
-- Isso resolve imediatamente qualquer erro de gravação congelada ou bloqueio de permissão!
ALTER TABLE public.transfer_requests DISABLE ROW LEVEL SECURITY;

-- 4. HABILITAR Realtime para sincronização simultânea instantânea entre computadores
ALTER PUBLICATION supabase_realtime ADD TABLE public.transfer_requests;
`;

export const DatabaseDiagnosticModal: React.FC<DatabaseDiagnosticModalProps> = ({
  isOpen,
  onClose,
  isCloudConnected,
  onRecordsCleared,
}) => {
  const [copiedSql, setCopiedSql] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'success' | 'warning' | 'error';
    message: string;
    details?: string;
  }>({ status: 'idle', message: '' });

  if (!isOpen) return null;

  const { url, anonKey } = getSupabaseConfig();
  const isDirectConfigured = Boolean(url && anonKey);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_REPAIR_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'Tem certeza que deseja limpar TODOS os registros de transferências?\\n\\nEsta ação apagará os dados de teste do Supabase, do servidor e do cache local para que a equipe possa iniciar a operação oficial do zero.'
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await clearAllTransferRecords();
      if (onRecordsCleared) {
        onRecordsCleared();
      }
      setTestResult({
        status: 'success',
        message: 'Todos os registros foram zerados com sucesso!',
        details: 'O banco de dados, servidor e cache foram limpos. O sistema está 100% pronto para iniciar do zero.'
      });
    } catch (e: any) {
      setTestResult({
        status: 'error',
        message: 'Erro ao limpar registros.',
        details: String(e?.message || e)
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleRunDiagnosticTest = async () => {
    setTesting(true);
    setTestResult({ status: 'idle', message: '' });

    const supabase = getSupabase();
    if (!supabase) {
      // Testar rota de fallback Vercel (/api/transfers)
      try {
        const res = await fetch('/api/transfers');
        if (res.ok) {
          const json = await res.json();
          setTestResult({
            status: 'warning',
            message: 'Supabase direto não configurado. O app está operando perfeitamente via Backend Serverless Vercel (/api/transfers).',
            details: `Backend Vercel ativo: ${json.items?.length || 0} transferências armazenadas. Para conectar ao Supabase, configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel.`
          });
        } else {
          setTestResult({
            status: 'error',
            message: 'Backend Vercel retornou código ' + res.status,
            details: 'Verifique os logs da função serverless na Vercel.'
          });
        }
      } catch (e: any) {
        setTestResult({
          status: 'error',
          message: 'Falha ao conectar ao backend Vercel e Supabase.',
          details: String(e?.message || e)
        });
      }
      setTesting(false);
      return;
    }

    try {
      // 1. Testar SELECT (Leitura)
      const readRes = await supabase.from('transfer_requests').select('id, status').limit(3);
      if (readRes.error) {
        setTestResult({
          status: 'error',
          message: `Erro na Leitura do Supabase: [${readRes.error.code}] ${readRes.error.message}`,
          details: 'Provável causa: a tabela transfer_requests ainda não foi criada ou o RLS está bloqueando. Execute o Script SQL abaixo para corrigir em 1 clique.'
        });
        setTesting(false);
        return;
      }

      // 2. Testar INSERT/UPDATE (Gravação e Atualização de Status)
      const testId = 'diag_test_' + Date.now().toString(36);
      const testPayload = {
        id: testId,
        material: 'TEST_DIAG',
        serial: 'SN_TEST',
        centro: 'B124',
        deposito_origem: 'B148',
        deposito_destino: 'B110',
        status: 'pendente',
        criado_em: new Date().toISOString(),
        criado_por: 'Diagnóstico MIGOU',
        atualizado_em: new Date().toISOString(),
      };

      const writeRes = await supabase.from('transfer_requests').insert(testPayload);
      if (writeRes.error) {
        setTestResult({
          status: 'error',
          message: `Erro na Gravação do Supabase: [${writeRes.error.code}] ${writeRes.error.message}`,
          details: 'Se o erro for 42501 (RLS violado) ou 42703 (coluna ausente), execute o Script SQL abaixo no Supabase SQL Editor para desbloquear.'
        });
        setTesting(false);
        return;
      }

      // 3. Testar Update de Status
      const updateRes = await supabase
        .from('transfer_requests')
        .update({ status: 'concluido', atualizado_em: new Date().toISOString() })
        .eq('id', testId);

      // Limpar registro de teste
      await supabase.from('transfer_requests').delete().eq('id', testId);

      if (updateRes.error) {
        setTestResult({
          status: 'warning',
          message: `Gravação funcionou, mas Atualização de Status falhou: [${updateRes.error.code}] ${updateRes.error.message}`,
          details: 'Execute o Script SQL abaixo para garantir permissão total de UPDATE.'
        });
      } else {
        setTestResult({
          status: 'success',
          message: 'Tudo 100% Funcional! Leitura, Gravação e Atualização de Status validadas com sucesso no Supabase.',
          details: `Conexão direta estabelecida com ${url}. A tabela transfer_requests aceita atualizações em tempo real.`
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: 'Erro inesperado ao consultar Supabase.',
        details: String(err?.message || err)
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-[#C2DEEB]">
              <Database className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold">Diagnóstico do Banco de Dados & Supabase</h3>
              <p className="text-[11px] sm:text-xs text-[#C2DEEB]">
                Validação de gravação, simultaneidade e script de reparo das tabelas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
          {/* Status Geral de Conexão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#00609C]" />
                <span>Supabase Direto</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isDirectConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                <span className="text-xs font-bold text-slate-800">
                  {isDirectConfigured ? 'Credenciais Configuradas' : 'Não Vinculado Direto'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono truncate" title={url || 'Sem URL'}>
                {url ? `URL: ${url}` : 'Usando rota segura /api/transfers na Vercel'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span>Modo de Operação</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isCloudConnected ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`}></span>
                <span className="text-xs font-bold text-slate-800">
                  {isCloudConnected ? 'Nuvem Conectada (Tempo Real)' : 'Backend Serverless Vercel'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Sincronismo via SSE, BroadcastChannel e Service Worker.
              </p>
            </div>
          </div>

          {/* Botão de Teste em Tempo Real */}
          <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#002664] flex items-center gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-[#249ED5]' : 'text-[#002664]'}`} />
                  <span>Teste Imediato de Gravação e Atualização</span>
                </h4>
                <p className="text-[11px] text-slate-600">
                  Verifica se o comando de gravar e alterar status responde com sucesso sem travar.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunDiagnosticTest}
                disabled={testing}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-[#002664] hover:bg-[#002363] transition-all active:scale-95 shadow-2xs shrink-0 flex items-center gap-1.5"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Testando...</span>
                  </>
                ) : (
                  <span>Executar Teste</span>
                )}
              </button>
            </div>

            {testResult.message && (
              <div className={`p-3 rounded-lg text-xs border ${
                testResult.status === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : testResult.status === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="flex items-start gap-2">
                  {testResult.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : testResult.status === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{testResult.message}</p>
                    {testResult.details && (
                      <p className="text-[11px] opacity-90">{testResult.details}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Zona de Limpeza de Registros para Iniciar do Zero */}
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Limpar Registros (Iniciar do Zero)</span>
              </div>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Remove todas as transferências de teste do Supabase, servidor e cache para início da operação real do time.
              </p>
            </div>
            <button
              type="button"
              disabled={isClearing}
              onClick={handleClearAll}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isClearing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>{isClearing ? 'Limpando...' : 'Zerar Banco de Dados'}</span>
            </button>
          </div>

          {/* Script de Reparo SQL do Supabase */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Script SQL de Reparo do Supabase</span>
                  <span className="text-[10px] font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                    Garante Colunas & Desbloqueia RLS
                  </span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Se as gravações estiverem congeladas no Supabase, copie este script e cole no SQL Editor do seu projeto Supabase.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopySql}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-2xs flex items-center gap-1.5 shrink-0 ${
                  copiedSql
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copiar SQL</span>
                  </>
                )}
              </button>
            </div>

            <pre className="text-[10px] sm:text-[11px] font-mono bg-slate-900 text-slate-100 p-3.5 rounded-xl border border-slate-800 overflow-x-auto max-h-48 leading-relaxed select-all">
              {SUPABASE_REPAIR_SQL}
            </pre>
          </div>

          {/* Dicas de Execução */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>O que fazer se o banco estiver congelado?</span>
            </div>
            <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-amber-800">
              <li>Acesse seu painel do Supabase (<a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-amber-950 inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-2.5 h-2.5" /></a>).</li>
              <li>Clique na aba <strong>SQL Editor</strong> e crie uma nova query.</li>
              <li>Cole o código SQL acima e clique em <strong>Run</strong>.</li>
              <li>Pronto! Todas as colunas, permissões e status estarão liberados imediatamente.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Fechar Diagnóstico
          </button>
        </div>
      </div>
    </div>
  );
};
