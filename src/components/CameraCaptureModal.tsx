import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  X,
  RefreshCw,
  Check,
  RotateCcw,
  UploadCloud,
  AlertTriangle,
  Smartphone,
} from 'lucide-react';
import { compressImageFile } from '../utils/imageCompressor';

interface CameraCaptureModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onCapturePhoto: (compressedDataUrl: string) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  title = 'Fotografar Etiqueta / Material',
  subtitle = 'Aponte a câmera para a etiqueta do produto (SKU / Número de Série UII)',
  onClose,
  onCapturePhoto,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackFileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(
    async (mode: 'environment' | 'user') => {
      stopCameraStream();
      setCameraError(null);
      setIsStartingCamera(true);

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setIsStartingCamera(false);
        setCameraError(
          'Acesso direto à câmera ao vivo indisponível neste navegador. Use o botão abaixo para abrir a câmera nativa do aparelho ou selecionar uma foto.'
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 960 },
            },
            audio: false,
          });
        } catch {
          // Fallback genérico caso a constraint facingMode falhe em webcams de notebook
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('Aviso ao iniciar câmera ao vivo:', err);
        setCameraError(
          'Não foi possível acessar a câmera ao vivo (permissão bloqueada ou dispositivo sem webcam). Você pode tirar a foto pela câmera nativa ou anexar da galeria abaixo.'
        );
      } finally {
        setIsStartingCamera(false);
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (isOpen && !capturedPreview) {
      startCameraStream(facingMode);
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, facingMode, capturedPreview, startCameraStream, stopCameraStream]);

  useEffect(() => {
    if (!isOpen) {
      setCapturedPreview(null);
      setCameraError(null);
      setIsCompressing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTakeSnapshot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    try {
      setIsCompressing(true);
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      );

      if (blob) {
        const compressed = await compressImageFile(blob, 760, 0.68);
        setCapturedPreview(compressed);
        stopCameraStream();
      }
    } catch (err) {
      console.error('Erro ao capturar frame da câmera:', err);
      alert('Não foi possível capturar a imagem da câmera.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleFallbackFileSelect = async (file: File) => {
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressed = await compressImageFile(file, 760, 0.68);
      setCapturedPreview(compressed);
      stopCameraStream();
    } catch (err) {
      console.error('Erro ao processar arquivo de foto:', err);
      alert('Não foi possível processar esta foto. Tente outra imagem.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleConfirmPhoto = () => {
    if (!capturedPreview) return;
    onCapturePhoto(capturedPreview);
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-[#002664] to-[#00609C] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4 text-cyan-200" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">{title}</h3>
              <p className="text-[11px] text-cyan-100 truncate">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Visor / Preview */}
        <div className="p-3.5 sm:p-4 space-y-3 overflow-y-auto flex-1 bg-slate-900 flex flex-col items-center justify-center min-h-[280px] relative">
          {capturedPreview ? (
            <div className="w-full flex flex-col items-center gap-2">
              <div className="relative w-full max-h-[52vh] rounded-xl overflow-hidden border-2 border-emerald-400 bg-black flex items-center justify-center">
                <img
                  src={capturedPreview}
                  alt="Foto capturada da etiqueta"
                  className="max-h-[50vh] w-auto object-contain"
                />
                <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-emerald-600/95 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md flex items-center gap-1">
                  <Check className="w-3 h-3" /> Foto Otimizada p/ SAP & Nuvem
                </span>
              </div>
            </div>
          ) : cameraError ? (
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 text-center space-y-3.5 max-w-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fallbackFileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#249ED5] hover:bg-[#0083CA] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Abrir Câmera do Aparelho / Galeria</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-full rounded-xl overflow-hidden bg-black border border-slate-700 flex items-center justify-center min-h-[260px]">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full max-h-[50vh] object-contain"
              />
              {/* Moldura guia de leitura da etiqueta */}
              <div className="pointer-events-none absolute inset-4 border-2 border-dashed border-cyan-300/70 rounded-xl flex items-end justify-center pb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-slate-950/75 text-cyan-200 text-[10px] font-semibold">
                  Enquadre o Material e Serial (UII) da etiqueta
                </span>
              </div>

              {isStartingCamera && (
                <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center gap-2 text-white">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-300" />
                  <span className="text-xs font-bold">Iniciando câmera...</span>
                </div>
              )}
            </div>
          )}

          {/* Input nativo oculto para celular / arquivo */}
          <input
            ref={fallbackFileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFallbackFileSelect(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* Rodapé de Controles */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {capturedPreview ? (
            <>
              <button
                type="button"
                onClick={() => setCapturedPreview(null)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tirar Outra</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmPhoto}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar e Anexar Foto</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                {!cameraError && (
                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    title="Alternar entre câmera traseira e frontal"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#00609C]" />
                    <span>Virar Câmera</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => fallbackFileInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  title="Escolher imagem da galeria ou usar câmera nativa do sistema"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-[#249ED5]" />
                  <span>Galeria / Arquivo</span>
                </button>
              </div>

              {!cameraError && (
                <button
                  type="button"
                  disabled={isStartingCamera || isCompressing}
                  onClick={handleTakeSnapshot}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#002664] hover:bg-[#003380] disabled:bg-slate-300 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95"
                >
                  <Camera className="w-4 h-4 text-cyan-300" />
                  <span>{isCompressing ? 'Processando...' : 'Capturar Foto Agora'}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
