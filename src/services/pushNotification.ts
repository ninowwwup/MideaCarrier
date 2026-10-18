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

import { BROWSER_CLIENT_ID } from './storage';
import { playAlertChime } from '../utils/audioAlert';

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
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
 * Obtém a inscrição push existente neste dispositivo
 */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub;
  } catch (err) {
    return null;
  }
}

/**
 * Ativa o Push Manager e inscreve o navegador na API Web Push
 */
export async function subscribeToPushNotifications(): Promise<{
  success: boolean;
  subscription?: PushSubscription | null;
  error?: string;
}> {
  if (!isPushSupported()) {
    return {
      success: false,
      error: 'Seu navegador não suporta a API Push Manager. Verifique permissões do sistema.',
    };
  }

  try {
    // 1. Garante que o Service Worker está registrado e pronto
    const reg = await registerAppServiceWorker();
    if (!reg) {
      return { success: false, error: 'Falha ao inicializar o Service Worker.' };
    }

    // 2. Solicita permissão nativa de notificação
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'Permissão de notificação negada no navegador. Por favor, permita notificações para o MIGOU.',
      };
    }

    // 3. Obtém a chave pública VAPID do servidor
    const keyRes = await fetch('/api/push-vapid-key');
    if (!keyRes.ok) {
      throw new Error('Falha ao obter chave VAPID do servidor');
    }
    const { publicKey } = await keyRes.json();

    if (!publicKey) {
      throw new Error('Chave pública VAPID ausente');
    }

    // 4. Inscreve no PushManager usando a chave VAPID
    const convertedKey = urlB64ToUint8Array(publicKey);
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as any,
      });
    }

    // 5. Registra a assinatura no backend (/api/push-subscribe)
    const subRes = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        clientId: BROWSER_CLIENT_ID,
      }),
    });

    if (!subRes.ok) {
      console.warn('Aviso: Servidor retornou código não-200 ao salvar inscrição push');
    }

    try {
      localStorage.setItem('migou_push_subscribed', 'true');
    } catch (e) {}

    return { success: true, subscription };
  } catch (err: any) {
    console.error('Erro ao inscrever no Push Manager:', err);
    return { success: false, error: err.message || 'Erro ao ativar Push Manager' };
  }
}

/**
 * Cancela a inscrição push no dispositivo e no backend
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
      await fetch('/api/push-unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          clientId: BROWSER_CLIENT_ID,
        }),
      }).catch(() => {});

      await sub.unsubscribe();
    }

    try {
      localStorage.removeItem('migou_push_subscribed');
    } catch (e) {}

    return true;
  } catch (e) {
    console.warn('Erro ao cancelar Push:', e);
    return false;
  }
}

/**
 * Dispara um teste de Web Push real no backend
 */
export async function triggerPushTest(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/push-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: BROWSER_CLIENT_ID }),
    });

    if (res.ok) {
      return { success: true, message: 'Push de teste enviado! Chegará em instantes com som de gota d’água.' };
    }
    return { success: false, message: 'Erro ao solicitar push de teste ao servidor.' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Erro de rede ao testar push' };
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
