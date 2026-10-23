/**
 * Utilitário de Alerta Sonoro do MIGOU & Notificações Desktop Nativas
 * 
 * Sons disponíveis selecionáveis pelo usuário:
 * 1. water_drop - Som Atual: Gota d'água suave e cristalina ("plop-plink")
 * 2. frog - Sapo: Coaxar divertido e ritmado de anfíbio ("croac-croac")
 * 3. bubbles - Bolhas de Sabão: Estalos alegres e sequenciais de bolhas subindo
 * 4. cat - Gato: Miau acolhedor e expressivo ("myaaoow")
 * 5. rebound - Rebound: Salto elástico de mola de cartoon ("boi-oi-o-o-ing")
 */

export type AlertSoundType = 'water_drop' | 'frog' | 'bubbles' | 'cat' | 'rebound';

export interface AlertSoundOption {
  id: AlertSoundType;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  badge?: string;
}

export const ALERT_SOUND_OPTIONS: AlertSoundOption[] = [
  {
    id: 'water_drop',
    name: 'Som Atual (Gota d’Água)',
    shortName: 'Gota d’Água',
    description: 'Som suave, límpido e cristalino de gota d’água (plop-plink)',
    icon: '💧',
    badge: 'Original',
  },
  {
    id: 'frog',
    name: 'Sapo (Coaxar / Ribbit)',
    shortName: 'Sapo',
    description: 'Coaxar divertido e ritmado de sapinho aquático (croac-croac)',
    icon: '🐸',
  },
  {
    id: 'bubbles',
    name: 'Bolhas de Sabão',
    shortName: 'Bolhas',
    description: 'Estalos delicados e sequenciais de bolhas de sabão subindo',
    icon: '🫧',
  },
  {
    id: 'cat',
    name: 'Gato (Miau / Meow)',
    shortName: 'Gato',
    description: 'Miau sonoro, fofo e acolhedor de gatinho',
    icon: '🐱',
  },
  {
    id: 'rebound',
    name: 'Rebound (Mola / Boing)',
    shortName: 'Rebound',
    description: 'Efeito dinâmico de salto elástico de mola de cartoon',
    icon: '🪀',
  },
];

const SOUND_PREFERENCE_KEY = 'migou_alert_sound_choice_v1';

/**
 * Obtém a preferência de som salva no navegador (padrão: water_drop)
 */
export function getSavedAlertSound(): AlertSoundType {
  if (typeof window === 'undefined') return 'water_drop';
  try {
    const saved = localStorage.getItem(SOUND_PREFERENCE_KEY);
    if (saved && (saved === 'water_drop' || saved === 'frog' || saved === 'bubbles' || saved === 'cat' || saved === 'rebound')) {
      return saved as AlertSoundType;
    }
  } catch (e) {}
  return 'water_drop';
}

/**
 * Salva a preferência de som do usuário e dispara evento de atualização
 */
export function setSavedAlertSound(sound: AlertSoundType) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_PREFERENCE_KEY, sound);
    window.dispatchEvent(new CustomEvent('migou_sound_changed', { detail: { sound } }));
  } catch (e) {}
}

export const SOUND_FILE_MAP: Record<AlertSoundType, string> = {
  water_drop: '/audio/water_drop.wav',
  frog: '/audio/frog.wav',
  bubbles: '/audio/bubbles.wav',
  cat: '/audio/cat.wav',
  rebound: '/audio/rebound.wav',
};

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;
const preloadedAudios: Partial<Record<AlertSoundType, HTMLAudioElement>> = {};

// Inicializa todos os arquivos de áudio pré-carregados
if (typeof window !== 'undefined') {
  (Object.keys(SOUND_FILE_MAP) as AlertSoundType[]).forEach((type) => {
    try {
      const audio = new Audio(SOUND_FILE_MAP[type]);
      audio.preload = 'auto';
      audio.volume = 1.0;
      preloadedAudios[type] = audio;
    } catch (e) {}
  });
}

/**
 * Desbloqueia o contexto de áudio em qualquer interação inicial do usuário
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

      // Pré-autoriza todos os elementos HTML5 Audio
      (Object.keys(preloadedAudios) as AlertSoundType[]).forEach((type) => {
        const audio = preloadedAudios[type];
        if (audio) {
          try {
            audio.volume = 0.001;
            const p = audio.play();
            if (p) {
              p.then(() => {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 1.0;
              }).catch(() => {});
            }
          } catch (e) {}
        }
      });
    } catch (e) {}
  };

  const events = ['click', 'pointerdown', 'mousedown', 'keydown', 'touchstart'];
  events.forEach((evt) => {
    window.addEventListener(evt, unlock, { once: false, passive: true });
  });
}

// Inicializa os ouvintes globais
initAudioOnUserInteraction();

export function isAudioReady(): boolean {
  if (typeof window === 'undefined') return false;
  return isAudioUnlocked || (sharedAudioCtx !== null && sharedAudioCtx.state === 'running');
}

/**
 * Obtém ou inicializa o contexto de áudio compartilhado
 */
function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || (window as any).webkitAudioContext)
      : null;

    if (!AudioContextClass) return null;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    return sharedAudioCtx;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// SINTETIZADORES ACÚSTICOS PROCEDURAIS (Web Audio API)
// Imunes a falhas de rede, 0ms de latência e compatíveis com abas em background
// ============================================================================

/**
 * 1. SOM DE GOTA D'ÁGUA (Som Atual)
 */
function synthesizeWaterDrop(ctx: AudioContext, now: number) {
  // Tentar tocar via arquivo WAV pré-carregado em paralelo
  if (typeof window !== 'undefined') {
    try {
      const audio = new Audio('/audio/water_drop.wav');
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  // Gota Principal (950Hz -> 1900Hz -> 1380Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(950, now);
  osc1.frequency.exponentialRampToValueAtTime(1900, now + 0.035);
  osc1.frequency.exponentialRampToValueAtTime(1380, now + 0.16);

  gain1.gain.setValueAtTime(0.0001, now);
  gain1.gain.linearRampToValueAtTime(0.70, now + 0.012);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);

  osc1.start(now);
  osc1.stop(now + 0.32);

  // Segundo respingo harmônico de água ("ripple" - t + 0.075s)
  const t2 = now + 0.075;
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1420, t2);
  osc2.frequency.exponentialRampToValueAtTime(2350, t2 + 0.025);
  osc2.frequency.exponentialRampToValueAtTime(1700, t2 + 0.12);

  gain2.gain.setValueAtTime(0.0001, t2);
  gain2.gain.linearRampToValueAtTime(0.38, t2 + 0.01);
  gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.22);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(t2);
  osc2.stop(t2 + 0.24);
}

/**
 * 2. SOM DE SAPO (Coaxar / Ribbit)
 * Guttural nasal com 2 pulsos ritmados ("rib-bit!")
 */
function synthesizeFrog(ctx: AudioContext, now: number) {
  const pulses = [
    { start: now, duration: 0.13, baseFreq: 195, endFreq: 145, filterFreq: 780, tremoloFreq: 38, peakGain: 0.60 },
    { start: now + 0.12, duration: 0.22, baseFreq: 245, endFreq: 175, filterFreq: 920, tremoloFreq: 34, peakGain: 0.75 },
  ];

  pulses.forEach(({ start, duration, baseFreq, endFreq, filterFreq, tremoloFreq, peakGain }) => {
    const osc = ctx.createOscillator();
    const tremolo = ctx.createOscillator();
    const tremoloGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const mainGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, start);
    osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);

    // Tremolo rápido simula as cordas vocais ásperas do sapo
    tremolo.type = 'square';
    tremolo.frequency.setValueAtTime(tremoloFreq, start);

    // Filtro formântico de garganta anfíbia
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.Q.setValueAtTime(6.0, start);

    mainGain.gain.setValueAtTime(0.0001, start);
    mainGain.gain.linearRampToValueAtTime(peakGain, start + 0.025);
    mainGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(ctx.destination);

    tremoloGain.gain.setValueAtTime(0.35, start);
    tremolo.connect(mainGain.gain);

    osc.start(start);
    osc.stop(start + duration + 0.02);
    tremolo.start(start);
    tremolo.stop(start + duration + 0.02);
  });
}

/**
 * 3. SOM DE BOLHAS DE SABÃO
 * Estalos ascendentes, nítidos e cristalinos ("bloop-plop-pop-pop!")
 */
function synthesizeSoapBubbles(ctx: AudioContext, now: number) {
  const bubbles = [
    { delay: 0.00, startF: 480, endF: 1150, dur: 0.065, vol: 0.55 },
    { delay: 0.065, startF: 680, endF: 1520, dur: 0.060, vol: 0.62 },
    { delay: 0.125, startF: 950, endF: 2050, dur: 0.055, vol: 0.68 },
    { delay: 0.185, startF: 1300, endF: 2750, dur: 0.080, vol: 0.52 },
  ];

  bubbles.forEach(({ delay, startF, endF, dur, vol }) => {
    const t = now + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(endF, t + dur * 0.72);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + dur + 0.02);
  });
}

/**
 * 4. SOM DE GATO (Miau / Meow)
 * Miado doce, nítido e expressivo com vibrato suave e rampa formântica
 */
function synthesizeCatMeow(ctx: AudioContext, now: number) {
  const osc = ctx.createOscillator();
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  // Curva melódica do miado: começa suave, sobe no meio ("myaaa") e desce no final ("ooww")
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(740, now + 0.16);
  osc.frequency.exponentialRampToValueAtTime(390, now + 0.46);

  // Vibrato suave natural do miado do gato (5.5Hz)
  vibrato.frequency.setValueAtTime(5.5, now);
  vibratoGain.gain.setValueAtTime(14, now);
  vibrato.connect(osc.frequency);

  // Filtro formântico tipo vogal "a -> u"
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(820, now);
  filter.frequency.exponentialRampToValueAtTime(1650, now + 0.16);
  filter.frequency.exponentialRampToValueAtTime(720, now + 0.46);
  filter.Q.setValueAtTime(4.2, now);

  // Envelope suave
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.68, now + 0.08);
  gain.gain.setValueAtTime(0.62, now + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  vibrato.start(now);
  osc.start(now);
  vibrato.stop(now + 0.50);
  osc.stop(now + 0.50);
}

/**
 * 5. SOM REBOUND (Mola / Boing)
 * Salto elástico de mola de cartoon com vibração oscilante dinâmica
 */
function synthesizeRebound(ctx: AudioContext, now: number) {
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  // Rampa de salto elástico inicial ("boiiing")
  osc.type = 'sine';
  osc.frequency.setValueAtTime(175, now);
  osc.frequency.exponentialRampToValueAtTime(460, now + 0.055);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.45);

  // Wobble de mola metálica vibrando a 21Hz
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(21, now);

  lfoGain.gain.setValueAtTime(70, now);
  lfoGain.gain.exponentialRampToValueAtTime(1.5, now + 0.45);
  lfo.connect(osc.frequency);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1900, now);
  filter.Q.setValueAtTime(3.2, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.75, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  lfo.start(now);
  osc.start(now);
  lfo.stop(now + 0.50);
  osc.stop(now + 0.50);
}

/**
 * Síntese procedural de contingência via Web Audio API
 */
export function synthesizeProceduralSound(soundType: AlertSoundType) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  try {
    switch (soundType) {
      case 'frog':
        synthesizeFrog(ctx, now);
        break;
      case 'bubbles':
        synthesizeSoapBubbles(ctx, now);
        break;
      case 'cat':
        synthesizeCatMeow(ctx, now);
        break;
      case 'rebound':
        synthesizeRebound(ctx, now);
        break;
      case 'water_drop':
      default:
        synthesizeWaterDrop(ctx, now);
        break;
    }
  } catch (err) {
    console.warn(`Erro ao sintetizar som procedural [${soundType}]:`, err);
  }
}

/**
 * Toca um som específico por tipo (executa o arquivo WAV oficial e usa síntese procedural como fallback)
 */
export function playSoundByType(soundType: AlertSoundType) {
  // 1. Toca o arquivo de áudio WAV correspondente
  if (typeof window !== 'undefined') {
    try {
      let audio = preloadedAudios[soundType];
      if (!audio) {
        audio = new Audio(SOUND_FILE_MAP[soundType] || '/audio/water_drop.wav');
        audio.preload = 'auto';
        preloadedAudios[soundType] = audio;
      }
      audio.currentTime = 0;
      audio.volume = 1.0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          synthesizeProceduralSound(soundType);
        });
        return;
      }
    } catch (e) {
      synthesizeProceduralSound(soundType);
      return;
    }
  }

  // Fallback caso áudio HTML5 não esteja disponível
  synthesizeProceduralSound(soundType);
}

/**
 * Toca o som de alerta configurado atualmente pelo usuário
 */
export function playAlertChime() {
  const currentSound = getSavedAlertSound();
  playSoundByType(currentSound);
}

/**
 * Desbloqueia o áudio imediatamente e toca uma amostra do som selecionado
 */
export async function unlockAudioNow(specificSound?: AlertSoundType): Promise<boolean> {
  const soundToPlay = specificSound || getSavedAlertSound();
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
    isAudioUnlocked = true;
    window.dispatchEvent(new CustomEvent('migou_audio_ready'));

    playSoundByType(soundToPlay);
    return true;
  } catch (e) {
    try {
      const audio = preloadedAudios[soundToPlay] || new Audio(SOUND_FILE_MAP[soundToPlay]);
      audio.currentTime = 0;
      audio.volume = 1.0;
      await audio.play();
      isAudioUnlocked = true;
      window.dispatchEvent(new CustomEvent('migou_audio_ready'));
      return true;
    } catch (err) {}
    return false;
  }
}

/**
 * Solicitação explícita de permissão para Notificações do Sistema Operacional
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
 * Desaparece automaticamente da tela após exatamente 5 segundos (estilo Outlook)
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
        silent: true, // O som selecionado pelo usuário já é tocado via playAlertChime()
      });

      notif.onclick = () => {
        try {
          window.focus();
          if (onClickCallback) onClickCallback();
          notif.close();
        } catch (e) {}
      };

      // Desaparece da tela em exatamente 5 segundos
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
