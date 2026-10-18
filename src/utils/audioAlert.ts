/**
 * Utilitário de Alerta Sonoro de Gota d'Água (Water Droplet) e Notificações Desktop Nativas
 * 
 * Requisitos estritos atendidos:
 * 1. Som suave e cristalino de gota d'água ("plop-plink") sintetizado com harmônicos realistas.
 * 2. Suporte garantido a segundo plano (background tabs) usando tanto HTML5 Audio element quanto Web Audio API.
 * 3. Notificação nativa do sistema operacional (Windows / Mac) que surge sobre o SAP GUI, Excel ou outras tarefas.
 * 4. Desaparecimento automático do pop-up em exatamente 5 segundos (estilo Outlook).
 */

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;
let preloadedAudio: HTMLAudioElement | null = null;

// Inicializa áudio pré-carregado
if (typeof window !== 'undefined') {
  try {
    preloadedAudio = new Audio('/audio/water_drop.wav');
    preloadedAudio.preload = 'auto';
    preloadedAudio.volume = 0.85;
  } catch (e) {
    // Silently ignore if audio element not supported
  }
}

// Desbloqueia o contexto de áudio em qualquer interação inicial do usuário
export function initAudioOnUserInteraction() {
  if (typeof window === 'undefined') return;

  const unlock = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !sharedAudioCtx) {
        sharedAudioCtx = new AudioContextClass();
      }

      if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().then(() => {
          isAudioUnlocked = true;
        }).catch(() => {});
      } else if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
        isAudioUnlocked = true;
      }

      if (preloadedAudio) {
        // Pré-aquece o elemento sem emitir som audível
        preloadedAudio.load();
      }
    } catch (e) {
      // Ignorar
    }
  };

  window.addEventListener('click', unlock, { once: false, passive: true });
  window.addEventListener('keydown', unlock, { once: false, passive: true });
  window.addEventListener('touchstart', unlock, { once: false, passive: true });
}

// Inicializa os ouvintes globais
initAudioOnUserInteraction();

/**
 * Desbloqueia o áudio imediatamente e toca uma amostra do som suave de gota d'água
 */
export async function unlockAudioNow(): Promise<boolean> {
  try {
    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || (window as any).webkitAudioContext)
      : null;

    if (AudioContextClass && !sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }

    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      await sharedAudioCtx.resume();
    }
    isAudioUnlocked = true;

    // Toca o som de gota d'água como confirmação auditiva imediata
    await playAlertChime();
    return true;
  } catch (e) {
    console.warn('Erro ao desbloquear áudio:', e);
    // Tenta fallback com elemento de áudio
    try {
      if (preloadedAudio) {
        preloadedAudio.currentTime = 0;
        await preloadedAudio.play();
        return true;
      }
    } catch (err) {}
    return false;
  }
}

/**
 * Síntese acústica de gota d'água cristalina suave (Water Droplet)
 * Utiliza dois métodos simultâneos para máxima confiabilidade:
 * 1. Arquivo WAV pré-carregado (/audio/water_drop.wav)
 * 2. Sintetizador harmônico procedural com Web Audio API
 */
export function playAlertChime() {
  let playedViaAudioTag = false;

  // 1. Tentar tocar via HTML5 Audio element (muito estável em abas em segundo plano)
  if (typeof window !== 'undefined') {
    try {
      const audio = new Audio('/audio/water_drop.wav');
      audio.volume = 0.85;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          playedViaAudioTag = true;
        }).catch((err) => {
          // Autoplay policy pode bloquear se ainda não houve interação
          console.warn('Audio tag play bloqueado, usando sintetizador Web Audio:', err);
        });
      }
    } catch (e) {
      // Fallback para Web Audio abaixo
    }
  }

  // 2. Sintetizador Web Audio API: Gota d'água suave com pitch-sweep e ressonância de orvalho
  try {
    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || (window as any).webkitAudioContext)
      : null;

    if (!AudioContextClass) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }

    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Gota Principal (Frequência deslizando suavemente de 900Hz para 1800Hz e decaindo suavemente para 1350Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(900, now);
    osc1.frequency.exponentialRampToValueAtTime(1800, now + 0.035);
    osc1.frequency.exponentialRampToValueAtTime(1350, now + 0.16);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.32);

    // Segundo respingo harmônico suave de água cristalina ("ripple" - t + 0.08s)
    const t2 = now + 0.08;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1350, t2);
    osc2.frequency.exponentialRampToValueAtTime(2250, t2 + 0.025);
    osc2.frequency.exponentialRampToValueAtTime(1650, t2 + 0.12);

    gain2.gain.setValueAtTime(0.0001, t2);
    gain2.gain.linearRampToValueAtTime(0.18, t2 + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.22);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(t2);
    osc2.stop(t2 + 0.24);
  } catch (e) {
    console.warn('Erro ao sintetizar gota dágua:', e);
  }
}

/**
 * Solicitação explícita de permissão para Notificações do Sistema Operacional (Windows / Mac)
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch (e) {
      console.warn('Erro ao solicitar permissão de notificação:', e);
    }
  }
  return null;
}

/**
 * Dispara notificação nativa na tela do Windows / macOS
 * OBRIGATÓRIO:
 * - Aparece sobre qualquer janela aberta (SAP GUI, Excel, Teams, etc.)
 * - Desaparece automaticamente da tela após exatamente 5 segundos
 */
export function sendDesktopNotification(
  title: string,
  body: string,
  onClickCallback?: () => void
) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon: '/icon.svg',
        tag: 'migou-' + Date.now(),
        silent: true, // O som personalizado de gota d'água já é tocado pelo playAlertChime()
      });

      notif.onclick = () => {
        try {
          window.focus();
          if (onClickCallback) onClickCallback();
          notif.close();
        } catch (e) {}
      };

      // OBRIGATÓRIO: Desaparece da tela em exatamente 5 segundos (estilo Outlook)
      setTimeout(() => {
        try {
          notif.close();
        } catch (e) {}
      }, 5000);
    } catch (err) {
      console.warn('Erro ao disparar Desktop Notification:', err);
    }
  }
}
