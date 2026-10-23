import React, { useState } from 'react';
import { 
  X, 
  Volume2, 
  VolumeX, 
  Play, 
  Check, 
  Sparkles, 
  Radio, 
  Music,
  BellRing
} from 'lucide-react';
import { 
  AlertSoundType, 
  ALERT_SOUND_OPTIONS, 
  getSavedAlertSound, 
  setSavedAlertSound, 
  playSoundByType 
} from '../utils/audioAlert';

interface SoundSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSoundSelected?: (sound: AlertSoundType) => void;
}

export const SoundSelectorModal: React.FC<SoundSelectorModalProps> = ({
  isOpen,
  onClose,
  onSoundSelected,
}) => {
  const [selectedSound, setSelectedSound] = useState<AlertSoundType>(getSavedAlertSound());
  const [playingId, setPlayingId] = useState<AlertSoundType | null>(null);

  if (!isOpen) return null;

  const handlePreview = (soundId: AlertSoundType, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPlayingId(soundId);
    playSoundByType(soundId);
    setTimeout(() => {
      setPlayingId((curr) => (curr === soundId ? null : curr));
    }, 700);
  };

  const handleSelect = (soundId: AlertSoundType) => {
    setSelectedSound(soundId);
    setSavedAlertSound(soundId);
    handlePreview(soundId);
    if (onSoundSelected) {
      onSoundSelected(soundId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sound-modal-title"
      >
        {/* Header Elegante com Gradiente Midea */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-white/15 text-cyan-200 backdrop-blur-md shadow-xs flex items-center justify-center">
              <Music className="w-5 h-5 text-cyan-200 animate-pulse" />
            </span>
            <div>
              <h3 id="sound-modal-title" className="text-sm sm:text-base font-bold flex items-center gap-2">
                <span>Personalizar Som de Alerta</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-300/30">
                  Web Audio
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-white/80">
                Escolha o som que tocará quando uma nova solicitação SAP chegar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors active:scale-90 cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de Opções de Som */}
        <div className="p-4 sm:p-6 space-y-2.5 max-h-[68vh] overflow-y-auto overscroll-contain">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">
            Opções Disponíveis ({ALERT_SOUND_OPTIONS.length})
          </div>

          <div className="space-y-2">
            {ALERT_SOUND_OPTIONS.map((opt) => {
              const isSelected = selectedSound === opt.id;
              const isPlaying = playingId === opt.id;

              return (
                <div
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  className={`p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 group relative ${
                    isSelected
                      ? 'border-[#002664] bg-blue-50/70 shadow-sm ring-2 ring-[#002664]/20'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  {/* Ícone e Nome */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span 
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                        isSelected 
                          ? 'bg-[#002664] text-white shadow-md' 
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {opt.icon}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs sm:text-sm font-bold truncate ${
                          isSelected ? 'text-[#002664]' : 'text-slate-800'
                        }`}>
                          {opt.name}
                        </span>
                        {opt.badge && (
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-200/80 text-slate-700">
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && (
                          <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {opt.description}
                      </p>
                    </div>
                  </div>

                  {/* Ações: Botão Ouvir Amostra & Indicador de Seleção */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handlePreview(opt.id, e)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-90 cursor-pointer ${
                        isPlaying
                          ? 'bg-amber-500 text-white shadow-xs animate-pulse'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                      title={`Tocar amostra de ${opt.shortName}`}
                    >
                      <Play className={`w-3 h-3 ${isPlaying ? 'fill-white' : 'fill-slate-600'}`} />
                      <span className="hidden sm:inline">{isPlaying ? 'Tocando...' : 'Ouvir'}</span>
                    </button>

                    <div 
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        isSelected 
                          ? 'bg-[#002664] border-[#002664] text-white shadow-2xs' 
                          : 'border-slate-300 bg-white group-hover:border-slate-400'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dica Informativa */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-600 flex items-start gap-2.5">
            <Volume2 className="w-4 h-4 text-[#00609C] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800">Sua escolha é salva no navegador:</span> O som selecionado tocará sempre que novas transferências pendentes chegarem em tempo real, mesmo com o navegador em segundo plano.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>Som selecionado:</span>
            <strong className="text-slate-800">
              {ALERT_SOUND_OPTIONS.find((o) => o.id === selectedSound)?.name || 'Gota d’Água'}
            </strong>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#002664] hover:bg-[#002363] transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            Confirmar e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
