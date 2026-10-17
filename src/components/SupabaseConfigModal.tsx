import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  Check, 
  Copy, 
  ExternalLink, 
  Server, 
  Shield, 
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Globe
} from 'lucide-react';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  testSupabaseConnection 
} from '../services/supabaseClient';
import { getSupabaseSQLSchema } from '../services/storage';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSQL, setCopiedSQL] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'sql' | 'vercel'>('config');

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
        success: true,
        message: 'Modo Local ativado! Seus dados estão salvos com persistência no navegador.',
      });
      onConfigUpdated();
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const res = await testSupabaseConnection(url, anonKey);
    setIsTesting(false);
    setTestResult(res);

    if (res.success) {
      saveSupabaseConfig({ url, anonKey });
      onConfigUpdated();
    }
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(getSupabaseSQLSchema());
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-[#0083CA] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-white">
              <Database className="w-5 h-5 text-emerald-300" />
            </span>
            <div>
              <h3 className="text-base font-bold">Banco de Dados Supabase & Deploy Vercel (100% Grátis)</h3>
              <p className="text-xs text-blue-100">
                Conecte seu banco em nuvem para compartilhamento em tempo real entre os dois times
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-[#0083CA] text-[#00609C] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Conectar Supabase
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'sql'
                ? 'border-[#0083CA] text-[#00609C] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Script SQL da Tabela
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vercel')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'vercel'
                ? 'border-[#0083CA] text-[#00609C] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            3. Como Publicar na Vercel
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {activeTab === 'config' && (
            <form onSubmit={handleTestAndSave} className="space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-slate-700 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-[#00609C] shrink-0 mt-0.5" />
                <p>
                  O app funciona perfeitamente agora mesmo em <strong>Modo Local</strong>! Quando você criar seu projeto no{' '}
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0083CA] font-bold underline inline-flex items-center gap-0.5"
                  >
                    supabase.com <ExternalLink className="w-3 h-3" />
                  </a>
                  , basta colar a URL e a Anon Key abaixo para sincronizar ambos os times na nuvem.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project URL do Supabase
                </label>
                <input
                  type="text"
                  placeholder="https://xyzabcdefg.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project API Anon / Public Key
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA]"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setUrl('');
                    setAnonKey('');
                    saveSupabaseConfig({ url: '', anonKey: '' });
                    setTestResult({
                      success: true,
                      message: 'Configuração limpa. Operando em Modo Local com persistência no navegador.',
                    });
                    onConfigUpdated();
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Usar apenas Modo Local (Sem Supabase)
                </button>

                <button
                  type="submit"
                  disabled={isTesting}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#0083CA] hover:bg-[#0070b0] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Server className="w-4 h-4" />
                  <span>{isTesting ? 'Validando Conexão...' : 'Salvar & Validar'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">
                  Execute este código no <strong>SQL Editor</strong> do painel do seu Supabase:
                </span>
                <button
                  type="button"
                  onClick={handleCopySQL}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors ${
                    copiedSQL
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#0083CA] text-white hover:bg-[#0070b0]'
                  }`}
                >
                  {copiedSQL ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>SQL Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Script SQL</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 p-3.5 rounded-xl overflow-x-auto max-h-64 leading-relaxed">
                {getSupabaseSQLSchema()}
              </pre>
            </div>
          )}

          {activeTab === 'vercel' && (
            <div className="space-y-3.5 text-xs text-slate-700">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span>Como publicar gratuitamente na Vercel com link compartilhável:</span>
              </div>

              <ol className="list-decimal pl-5 space-y-2 text-slate-600">
                <li>
                  Envie o código para o seu <strong>GitHub</strong> (ou conecte o repositório).
                </li>
                <li>
                  Acesse <strong>vercel.com</strong> (gratuito) e clique em <strong>"Add New Project"</strong>.
                </li>
                <li>
                  Selecione o repositório do projeto. O framework preset será detectado automaticamente como <strong>Vite</strong>.
                </li>
                <li>
                  Em <strong>Environment Variables</strong> (opcional, se quiser travar o banco na nuvem), adicione:
                  <div className="mt-1 font-mono text-[11px] bg-slate-100 p-2 rounded border border-slate-200">
                    <div>VITE_SUPABASE_URL = sua_url_aqui</div>
                    <div>VITE_SUPABASE_ANON_KEY = sua_anon_key_aqui</div>
                  </div>
                </li>
                <li>
                  Clique em <strong>Deploy</strong>! Em menos de 1 minuto seu link oficial (ex: <code>midea-transfer.vercel.app</code>) estará no ar pronto para compartilhar com os dois times!
                </li>
              </ol>
            </div>
          )}
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
