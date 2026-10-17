// Som de notificação agradável, cristalino e nítido (Estilo Outlook / Teams)
// Sintetizado diretamente via Web Audio API do navegador (sem arquivos externos)
export function playAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Acorde harmônico estilo Outlook / Windows (Dó5 - Mi5 - Sol5)
    // Toques suaves escalonados com decaimento cristalino
    const notes = [
      { freq: 523.25, time: 0.00, duration: 0.35, gain: 0.22 }, // C5
      { freq: 659.25, time: 0.09, duration: 0.40, gain: 0.25 }, // E5
      { freq: 783.99, time: 0.18, duration: 0.55, gain: 0.30 }, // G5
      { freq: 1046.50, time: 0.27, duration: 0.70, gain: 0.28 }, // C6 (agudo final nítido)
    ];

    notes.forEach(({ freq, time, duration, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // Forma de onda suave (sine com leve overtone)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      // Envelope ADSR (ataque rápido, decaimento exponencial suave)
      gainNode.gain.setValueAtTime(0.0001, now + time);
      gainNode.gain.linearRampToValueAtTime(gain, now + time + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + duration);
    });
  } catch (e) {
    console.warn('Não foi possível reproduzir som de alerta:', e);
  }
}

// Suporte a Notificações Nativas do Sistema Operacional (Windows/Mac)
// para quando o operador estiver em segundo plano (com o SAP ou outra janela aberta)
export function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
}

export function sendDesktopNotification(title: string, body: string) {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: 'midea-transfer-new',
          silent: true, // Já tocamos nosso som personalizado
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (err) {
        console.warn('Erro ao disparar Desktop Notification:', err);
      }
    }
  }
}
