// Som suave de gota d'água (Water Droplet) sintetizado via Web Audio API
// Produz o clássico e delicado som suave de gota d'água cristalina ("plop-plink"),
// ideal para ambientes operacionais e escritórios sem assustar o usuário.
export function playAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Gota Principal (Plop de gota d'água com rápida inflexão de bolha e ressonância suave)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    // Modulação ascendente e inflexão suave de gota d'água pura
    osc1.frequency.setValueAtTime(850, now);
    osc1.frequency.exponentialRampToValueAtTime(1700, now + 0.035);
    osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.16);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(0.32, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.36);

    // Segundo respingo suave e cristalino (Eco delicado da gota / Ripple suave)
    const t2 = now + 0.11;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1250, t2);
    osc2.frequency.exponentialRampToValueAtTime(2150, t2 + 0.03);
    osc2.frequency.exponentialRampToValueAtTime(1650, t2 + 0.12);

    gain2.gain.setValueAtTime(0.0001, t2);
    gain2.gain.linearRampToValueAtTime(0.18, t2 + 0.012);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.25);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(t2);
    osc2.stop(t2 + 0.26);
  } catch (e) {
    console.warn('Não foi possível reproduzir som de gota dágua:', e);
  }
}

// Suporte a Notificações Nativas do Sistema Operacional (Windows/Mac)
// para quando o operador estiver em segundo plano (com o SAP ou outra janela aberta)
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'default') {
        return await Notification.requestPermission();
      }
      return Notification.permission;
    } catch (e) {
      console.warn('Erro ao solicitar permissão de notificação:', e);
    }
  }
  return null;
}

export function sendDesktopNotification(title: string, body: string) {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: 'midea-transfer-' + Date.now(),
          silent: true, // Já tocamos nosso som suave personalizado de gota d'água
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };

        // Auto-fechar a notificação do sistema operacional após 5 segundos
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
}
