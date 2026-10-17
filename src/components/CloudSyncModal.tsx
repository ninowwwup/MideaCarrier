import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  Check, 
  Copy, 
  Share2, 
  ExternalLink, 
  Radio, 
  ShieldCheck, 
  AlertTriangle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  testSupabaseConnection, 
  getShareableConnectedUrl 
} from '../services/supabaseClient';
import { getSupabaseSQLSchema } from '../services/storage';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  isConnected: boolean;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  onConnected,
  isConnected,
}) => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSQL, setCopiedSQL] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) {
      saveSupabaseConfig({ url: '', anonKey: '' });
      setTestResult({
        success: false,
        message: 'Por favor preencha a URL e a Anon Key do seu projeto Supabase.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const res = await testSupabaseConnection(url, anonKey);
    setIsTesting(false);
    setTestResult(res);

    if (res.success) {
      saveSupabaseConfig({ url, anonKey });
      onConnected();
    }
  };

  const handleCopyShareLink = () => {
    const link = getShareableConnectedUrl();
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(getSupabaseSQLSchema());
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#002363]/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-[#C2DEEB] overflow-hidden">
        {/* Header com Paleta Imperial Blue & Blue Bell */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15 text-white shadow-xs">
              <Database className="w-5 h-5 text-[#C2DEEB]" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>Sincronização em Tempo Real na Nuvem</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isConnected ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-slate-900'}`}>
                  {isConnected ? 'ONLINE' : 'CONFIGURAR'}
                </span>
              </h3>
              <p className="text-xs text-[#C2DEEB]">
                Garante que todos os computadores recebam as solicitações e o pop-up instantaneamente (Estilo AppSheet)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-slate-700">
          {/* Card de Compartilhamento Direto para o Outro Computador */}
          <div className="p-3.5 bg-[#C2DEEB]/30 border border-[#249ED5]/40 rounded-xl space-y-2">
            <div className="font-bold text-[#002664] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-[#249ED5]" />
                Link Compartilhável para o Outro Computador:
              </span>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#249ED5] hover:bg-[#002664] text-white transition-colors flex items-center gap-1 shadow-2xs active:scale-95"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link Conectado'}</span>
              </button>
            </div>
            <p className="text-slate-600 text-[11px]">
              Envie este link para o outro computador abrir no navegador. Ele irá conectar automaticamente ao mesmo banco Supabase em 1 segundo sem precisar digitar nada!
            </p>
          </div>

          {/* Formulário de Configuração Supabase */}
          <form onSubmit={handleTestAndSave} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#002664] mb-1">
                Project URL do Supabase
              </label>
              <input
                type="text"
                placeholder="https://xyzabcdefg.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#249ED5] focus:border-transparent bg-slate-50 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[#002664] mb-1">
                Project API Anon Key (Chave Pública)
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#249ED5] focus:border-transparent bg-slate-50 focus:bg-white"
              />
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                {testResult.success ? (
                  <Check className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleCopySQL}
                className="text-[11px] text-[#249ED5] hover:text-[#002664] font-semibold underline flex items-center gap-1"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{copiedSQL ? 'SQL Copiado!' : 'Copiar Script SQL do Banco'}</span>
              </button>

              <button
                type="submit"
                disabled={isTesting}
                className="px-5 py-2 text-xs font-bold text-white bg-[#002664] hover:bg-[#002363] rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
              >
                {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-[#C2DEEB]" />}
                <span>{isTesting ? 'Validando...' : 'Salvar & Conectar Agora'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
