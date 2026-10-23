import React, { useState } from 'react';
import { 
  Boxes, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Truck, 
  ArrowRight, 
  AlertCircle,
  Sparkles,
  Layers,
  KeyRound
} from 'lucide-react';
import { AuthUser } from '../types/auth';
import { authenticateUser } from '../services/authService';

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onLoginSuccess }) => {
  const [selectedUserType, setSelectedUserType] = useState<'admin' | 'prod'>('admin');
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSelectType = (type: 'admin' | 'prod') => {
    setSelectedUserType(type);
    setUsername(type === 'admin' ? 'Admin' : 'Prod');
    setPassword('');
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = authenticateUser(username, password);
    setIsSubmitting(false);

    if (result.success && result.user) {
      onLoginSuccess(result.user);
    } else {
      setErrorMessage(result.error || 'Credenciais inválidas. Tente novamente.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Luzes de fundo / Ambient Glow */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-600/30 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-emerald-500/25 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border border-white/60 overflow-hidden">
        {/* Top Header Card */}
        <div className="bg-gradient-to-br from-[#002664] via-[#00428d] to-[#00609C] p-6 text-white text-center relative">
          <div className="inline-flex p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-inner mb-3">
            <Boxes className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black tracking-tight flex items-center justify-center gap-2">
            MIGOU <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 uppercase">SAP MIGO</span>
          </h2>
          <p className="text-xs text-white/80 mt-1 max-w-xs mx-auto">
            Acesso Restrito • Gestão de Transferências SAP & WMS
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Seletor Rápido de Perfil */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Selecione sua Área / Função:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Botão Admin Midea */}
              <button
                type="button"
                onClick={() => handleSelectType('admin')}
                className={`p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  selectedUserType === 'admin'
                    ? 'border-blue-600 bg-blue-50/80 shadow-md ring-2 ring-blue-500/30'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`p-1.5 rounded-xl ${selectedUserType === 'admin' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">
                    Admin
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">Login Midea</div>
                  <div className="text-[11px] text-slate-500 leading-tight">Central SAP & Gestão</div>
                </div>
              </button>

              {/* Botão Prod Buiatte */}
              <button
                type="button"
                onClick={() => handleSelectType('prod')}
                className={`p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  selectedUserType === 'prod'
                    ? 'border-emerald-600 bg-emerald-50/80 shadow-md ring-2 ring-emerald-500/30'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`p-1.5 rounded-xl ${selectedUserType === 'prod' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    <Truck className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">
                    Prod
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">Login Buiatte</div>
                  <div className="text-[11px] text-slate-500 leading-tight">WMS & Chão de Fábrica</div>
                </div>
              </button>
            </div>
          </div>

          {/* Formulário de Credenciais */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo Usuário */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Usuário / Login:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex: Admin ou Prod"
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Senha de Acesso:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Informe sua senha..."
                  required
                  autoFocus
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Mensagem de Erro */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Informativo de Permissões */}
            <div className="p-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                <span>Regras de Acesso:</span>
              </div>
              {selectedUserType === 'admin' ? (
                <p>
                  <strong className="text-blue-700">Time Midea (Admin):</strong> Acesso total às ferramentas de MIGO SAP, conclusão com Documento de Material, apontamento de divergências, diagnósticos e exportações.
                </p>
              ) : (
                <p>
                  <strong className="text-emerald-700">Time Buiatte (Prod):</strong> Criação de solicitações individuais ou em lote (Excel/WhatsApp), inclusão de seriais, fotos de etiquetas e acompanhamento em tempo real.
                </p>
              )}
            </div>

            {/* Botão Entrar */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#002664] to-[#00609C] hover:from-[#001c4a] hover:to-[#004e80] shadow-lg shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Acessar o Sistema</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Footer com versão e segurança */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 text-center text-[11px] text-slate-400">
          MIGOU v2.4 • Sistema Conectado e Criptografado
        </div>
      </div>
    </div>
  );
};
