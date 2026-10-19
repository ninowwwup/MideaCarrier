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
    preloadedAudio.volume = 1.0;
  } catch (e) {
    // Silently ignore if audio element not supported
  }
}

/**
 * Desbloqueia o contexto de áudio em qualquer interação inicial do usuário (click, touch, pointerdown, keydown)
 */
export function initAudioOnUserInteraction() {
  if (typeof window === 'undefined') return;

  const unlock = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !sharedAudioCtx) {
        sharedAudioCtx = new AudioContextClass();
      }

      if (sharedAudioCtx) {
        if (sharedAudioCtx.state === 'suspended') {
          sharedAudioCtx.resume().then(() => {
            isAudioUnlocked = true;
            window.dispatchEvent(new CustomEvent('migou_audio_ready'));
          }).catch(() => {});
        } else if (sharedAudioCtx.state === 'running') {
          isAudioUnlocked = true;
          window.dispatchEvent(new CustomEvent('migou_audio_ready'));
        }

        // Toca buffer silencioso de 1 sample para autorizar o áudio no Chrome/Safari em segundo plano
        try {
          const silentBuf = sharedAudioCtx.createBuffer(1, 1, 22050);
          const src = sharedAudioCtx.createBufferSource();
          src.buffer = silentBuf;
          src.connect(sharedAudioCtx.destination);
          src.start(0);
        } catch (e) {}
      }

      // Pré-autoriza o elemento HTML5 Audio
      if (preloadedAudio) {
        try {
          preloadedAudio.volume = 0.001;
          const p = preloadedAudio.play();
          if (p) {
            p.then(() => {
              preloadedAudio?.pause();
              if (preloadedAudio) {
                preloadedAudio.currentTime = 0;
                preloadedAudio.volume = 1.0;
              }
            }).catch(() => {});
          }
        } catch (e) {}
      }
    } catch (e) {}
  };

  const events = ['click', 'pointerdown', 'mousedown', 'keydown', 'touchstart'];
  events.forEach((evt) => {
    window.addEventListener(evt, unlock, { once: false, passive: true });
  });
}

// Inicializa os ouvintes globais
initAudioOnUserInteraction();

/**
 * Verifica se o áudio já está desbloqueado pelo usuário
 */
export function isAudioReady(): boolean {
  if (typeof window === 'undefined') return false;
  return isAudioUnlocked || (sharedAudioCtx !== null && sharedAudioCtx.state === 'running');
}

/**
 * Desbloqueia o áudio imediatamente e toca uma amostra do som de gota d'água
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
    window.dispatchEvent(new CustomEvent('migou_audio_ready'));

    // Toca o som de gota d'água imediatamente como confirmação
    playAlertChime();
    return true;
  } catch (e) {
    console.warn('Tentando fallback com elemento de áudio:', e);
    try {
      if (preloadedAudio) {
        preloadedAudio.currentTime = 0;
        preloadedAudio.volume = 1.0;
        await preloadedAudio.play();
        isAudioUnlocked = true;
        window.dispatchEvent(new CustomEvent('migou_audio_ready'));
        return true;
      }
    } catch (err) {}
    return false;
  }
}

/**
 * Síntese acústica e reprodução obrigatória do som de gota d'água suave ("plop-plink")
 * Executa tanto o sintetizador Web Audio quanto o arquivo WAV em paralelo para 100% de confiabilidade.
 */
export function playAlertChime() {
  // 1. Tentar tocar via elemento de áudio WAV (excelente para navegadores móveis e desktop)
  if (typeof window !== 'undefined') {
    try {
      const audio = new Audio('/audio/water_drop.wav');
      audio.volume = 1.0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Se bloqueado por política de autoplay, o sintetizador abaixo cobre
        });
      }
    } catch (e) {}
  }

  // 2. Sintetizador Web Audio API: Gota d'água cristalina procedural (imune a cache ou falhas de rede)
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

    // Gota Principal (Frequência deslizando suavemente de 950Hz para 1900Hz e decaindo suavemente para 1380Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(950, now);
    osc1.frequency.exponentialRampToValueAtTime(1900, now + 0.035);
    osc1.frequency.exponentialRampToValueAtTime(1380, now + 0.16);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(0.65, now + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.32);

    // Segundo respingo harmônico suave de água ("ripple" - t + 0.075s)
    const t2 = now + 0.075;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1420, t2);
    osc2.frequency.exponentialRampToValueAtTime(2350, t2 + 0.025);
    osc2.frequency.exponentialRampToValueAtTime(1700, t2 + 0.12);

    gain2.gain.setValueAtTime(0.0001, t2);
    gain2.gain.linearRampToValueAtTime(0.35, t2 + 0.01);
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
