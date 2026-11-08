import React, { useState } from 'react';
import { 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Truck, 
  ArrowRight, 
  AlertCircle,
  KeyRound
} from 'lucide-react';
import { AuthUser } from '../types/auth';
import { authenticateUser } from '../services/authService';
import { MigouLogo } from './MigouLogo';
import { playSoundByType } from '../utils/audioAlert';

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
  const [chirpActive, setChirpActive] = useState(false);

  if (!isOpen) return null;

  const handleBirdChirp = () => {
    setChirpActive(true);
    playSoundByType('bird');
    setTimeout(() => setChirpActive(false), 900);
  };

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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300 flex items-center justify-center p-3 sm:p-4">
      {/* Luzes de fundo / Ambient Glow */}
      <div className="fixed top-1/4 left-1/4 w-64 h-64 bg-blue-600/30 rounded-full blur-[90px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/25 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative my-auto w-full max-w-[400px] sm:max-w-[420px] max-h-[calc(100dvh-1.5rem)] flex flex-col bg-white/95 backdrop-blur-2xl rounded-2xl sm:rounded-3xl shadow-[0_24px_60px_-12px_rgba(0,18,56,0.65)] border border-white/75 overflow-hidden figma-modal-motion">
        {/* Top Header Card Compacto & Responsivo com o Passarinho Azul Oficial do MIGOU */}
        <div className="shrink-0 bg-gradient-to-br from-[#001B4D] via-[#003B7E] to-[#0077BA] px-5 pt-4 pb-3.5 text-white text-center relative overflow-hidden">
          {/* Reflexos radiais estilo Figma */}
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-cyan-400/20 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-amber-300/15 blur-2xl pointer-events-none" />

          <div className="relative inline-flex mt-0.5 mb-2">
            <MigouLogo
              size="lg"
              animated
              onClick={handleBirdChirp}
              className={chirpActive ? 'scale-110 transition-transform duration-300' : ''}
            />
          </div>

          <h2 className="text-xl sm:text-[22px] font-black tracking-tight flex items-center justify-center gap-2 drop-shadow-xs leading-tight">
            <span>MIGOU</span>
            <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 text-slate-950 uppercase tracking-wider shadow-xs">
              SAP MIGO 311
            </span>
          </h2>
          <p className="text-[11px] text-cyan-100/90 font-medium mt-0.5 max-w-xs mx-auto leading-snug">
            Plataforma Colaborativa de Transferências SAP & WMS
          </p>
          <button
            type="button"
            onClick={handleBirdChirp}
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] text-cyan-100 font-semibold transition-all cursor-pointer active:scale-95"
            title="Clique para ouvir o som do Passarinho Azul MIGOU"
          >
            <span className={chirpActive ? 'animate-bounce' : ''}>🐦</span>
            <span>
              {chirpActive
                ? '🔊 Piu-piu! Som Oficial da Operação'
                : 'Time Buiatte (WMS Sênior) ⟷ Time Midea (SAP)'}
            </span>
          </button>
        </div>

        {/* Form Body com Scroll Interno Seguro em Telas Muito Pequenas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {/* Seletor Rápido de Perfil */}
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Selecione sua Área / Função:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Botão Admin Midea */}
              <button
                type="button"
                onClick={() => handleSelectType('admin')}
                className={`p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  selectedUserType === 'admin'
                    ? 'border-blue-600 bg-blue-50/85 shadow-sm ring-2 ring-blue-500/25'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`p-1 rounded-lg ${selectedUserType === 'admin' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[9.5px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">
                    Admin
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900 leading-tight">Login Midea</div>
                  <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5">Central SAP & Gestão</div>
                </div>
              </button>

              {/* Botão Prod Buiatte */}
              <button
                type="button"
                onClick={() => handleSelectType('prod')}
                className={`p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  selectedUserType === 'prod'
                    ? 'border-emerald-600 bg-emerald-50/85 shadow-sm ring-2 ring-emerald-500/25'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`p-1 rounded-lg ${selectedUserType === 'prod' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    <Truck className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[9.5px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">
                    Prod
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900 leading-tight">Login Buiatte</div>
                  <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5">WMS & Chão de Fábrica</div>
                </div>
              </button>
            </div>
          </div>

          {/* Formulário de Credenciais */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Campo Usuário */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
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
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
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
                  className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Mensagem de Erro */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Informativo de Permissões Compacto */}
            <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-200/80 text-[10.5px] text-slate-600 leading-snug space-y-0.5">
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <KeyRound className="w-3 h-3 text-blue-600" />
                <span>Regras de Acesso:</span>
              </div>
              {selectedUserType === 'admin' ? (
                <p>
                  <strong className="text-blue-700">Time Midea (Admin):</strong> Acesso total ao MIGO SAP, conclusão com Documento de Material, divergências e exportações.
                </p>
              ) : (
                <p>
                  <strong className="text-emerald-700">Time Buiatte (Prod):</strong> Criação de solicitações individuais ou em lote (Excel/WhatsApp), seriais, fotos e acompanhamento.
                </p>
              )}
            </div>

            {/* Botão Entrar */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-[#002664] to-[#00609C] hover:from-[#001c4a] hover:to-[#004e80] shadow-md shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Acessar o Sistema</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Footer com versão e segurança */}
        <div className="shrink-0 bg-slate-50 border-t border-slate-100 px-4 py-2 text-center text-[10px] text-slate-400">
          MIGOU v2.4 • Sistema Conectado e Criptografado
        </div>
      </div>
    </div>
  );
};
