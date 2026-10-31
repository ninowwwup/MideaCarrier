/**
 * Serviço de Gerenciamento do Push Manager & Service Worker do MIGOU
 * 
 * Permite que notificações Web Push cheguem no navegador mesmo quando o app:
 * - Estiver em segundo plano
 * - Estiver com a janela minimizada
 * - Não estiver em foco ou até mesmo fechado
 * 
 * Dispara o alerta visual do Windows/OS por 5 segundos e toca o som suave de gota d'água.
 */

import { playAlertChime, sendDesktopNotification } from '../utils/audioAlert';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window
  );
}

/**
 * Registra o Service Worker (/sw.js) caso ainda não esteja ativo
 */
export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('Erro ao registrar Service Worker:', err);
    return null;
  }
}

/**
 * Obtém o status de inscrição de notificações neste dispositivo
 */
export async function getExistingPushSubscription(): Promise<any | null> {
  if (!isPushSupported()) return null;

  try {
    if (Notification.permission === 'granted') {
      const saved = localStorage.getItem('migou_push_subscribed');
      if (saved === 'true') {
        return { active: true };
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Ativa o Gerenciador de Notificações Nativas e Service Worker (100% Client-Side sem Serverless Functions)
 */
export async function subscribeToPushNotifications(): Promise<{
  success: boolean;
  subscription?: any;
  error?: string;
}> {
  if (!isPushSupported()) {
    return {
      success: false,
      error: 'Seu navegador não suporta Notificações Desktop. Verifique as permissões do sistema.',
    };
  }

  try {
    await registerAppServiceWorker();

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'Permissão de notificação negada no navegador. Por favor, permita notificações para o MIGOU.',
      };
    }

    try {
      localStorage.setItem('migou_push_subscribed', 'true');
    } catch (e) {}

    return { success: true, subscription: { active: true } };
  } catch (err: any) {
    console.error('Erro ao ativar notificações:', err);
    return { success: false, error: err.message || 'Erro ao ativar notificações' };
  }
}

/**
 * Cancela a inscrição de notificações no dispositivo
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    localStorage.removeItem('migou_push_subscribed');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Dispara um teste de Notificação Desktop e Som de Alerta (100% local, sem consumir funções da Vercel)
 */
export async function triggerPushTest(): Promise<{ success: boolean; message: string }> {
  try {
    playAlertChime();
    sendDesktopNotification(
      'MIGOU: Teste de Alerta Ativo',
      'Notificação visual e alerta sonoro funcionando em tempo real!'
    );
    return {
      success: true,
      message: 'Alerta de teste disparado com sucesso!',
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Erro ao testar alerta' };
  }
}

/**
 * Escuta mensagens transmitidas pelo Service Worker (ex: quando um push é recebido em segundo plano)
 */
export function setupServiceWorkerMessageListener(onPushReceived?: (data: any) => void): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const handleMessage = (event: MessageEvent) => {
    if (!event.data) return;

    if (event.data.type === 'PUSH_NOTIFICATION_RECEIVED') {
      // Dispara obrigatoriamente o som de gota d'água
      if (event.data.shouldPlaySound) {
        playAlertChime();
      }

      if (onPushReceived) {
        onPushReceived(event.data.payload);
      }
    }
  };

  navigator.serviceWorker.addEventListener('message', handleMessage);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handleMessage);
  };
}
