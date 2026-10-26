import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import webpush from 'web-push';

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isVercel ? '/tmp' : process.cwd();
const DATA_FILE = path.join(DATA_DIR, 'transfers_data.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid_keys.json');
const SUBS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');

// Carregar ou gerar chaves VAPID persistentes
function loadVapidKeys(): { publicKey: string; privateKey: string } {
  try {
    if (fs.existsSync(VAPID_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
      if (parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Erro ao ler vapid_keys.json:', e);
  }

  const keys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), 'utf-8');
  } catch (e) {}
  return keys;
}

const vapidKeys = loadVapidKeys();

webpush.setVapidDetails(
  'mailto:operacoes@migou.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Armazenamento de Inscrições Push (PushManager Subscriptions)
export interface StoredSubscription {
  subscription: webpush.PushSubscription;
  clientId?: string;
  createdAt: string;
}

function loadPushSubscriptions(): StoredSubscription[] {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function savePushSubscriptions(subs: StoredSubscription[]) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), 'utf-8');
  } catch (e) {}
}

let activeSubscriptions: StoredSubscription[] = loadPushSubscriptions();

// Função para disparar Web Push a todos os inscritos (exceto o originador)
export async function sendWebPushToAll(payload: any, excludeClientId?: string) {
  const jsonPayload = JSON.stringify(payload);
  const remainingSubs: StoredSubscription[] = [];

  for (const item of activeSubscriptions) {
    if (excludeClientId && item.clientId === excludeClientId) {
      remainingSubs.push(item);
      continue;
    }

    try {
      await webpush.sendNotification(item.subscription, jsonPayload, {
        TTL: 60, // 60 segundos
      });
      remainingSubs.push(item);
    } catch (err: any) {
      // Código 410 (Gone) ou 404 significa que a inscrição expirou ou o usuário revogou
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log('Inscrição push expirada removida:', item.subscription.endpoint);
      } else {
        console.warn('Erro ao enviar push notification:', err.message || err);
        remainingSubs.push(item);
      }
    }
  }

  activeSubscriptions = remainingSubs;
  savePushSubscriptions(remainingSubs);
}

// Sem dados de teste: inicialização limpa pronta para produção
const DEFAULT_SEED: any[] = [];

// Carregar memória persistida do disco ou inicializar vazia
function loadPersistentStore(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar transfers_data.json:', e);
  }
  savePersistentStore([]);
  return [];
}

function savePersistentStore(items: any[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Erro ao salvar transfers_data.json:', e);
  }
}

let memoryStore: any[] = loadPersistentStore();
let lastModified = Date.now();

// Conjunto de clientes Server-Sent Events (SSE) conectados em tempo real
const sseClients = new Set<ServerResponse>();

export function registerSSEClient(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now(), itemsCount: memoryStore.length })}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (e) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 10000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
  req.on('error', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

export function broadcastSSE(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
      if (typeof (client as any).flush === 'function') {
        (client as any).flush();
      }
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

function getGoogleSheetsServerUrl(req?: IncomingMessage): string {
  const headerUrl = req?.headers?.['x-google-sheets-url'];
  if (typeof headerUrl === 'string' && headerUrl.trim()) {
    return headerUrl.trim();
  }
  return (
    process.env.VITE_GOOGLE_SHEETS_URL ||
    process.env.GOOGLE_SHEETS_URL ||
    ''
  ).trim();
}

async function fetchFromGoogleSheets(url: string) {
  if (!url) return null;
  const separator = url.includes('?') ? '&' : '?';
  const target = `${url}${separator}action=read&_t=${Date.now()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);
  try {
    const res = await fetch(target, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.success && Array.isArray(json.items)) {
      return json.items;
    }
    return null;
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function sendToGoogleSheets(url: string, payload: any) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    return res.ok;
  } catch (e) {
    console.warn('Erro ao sincronizar com Google Sheets:', e);
    return false;
  }
}

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Google-Sheets-Url');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const rawUrl = req.url || '';

  // 1. Rota SSE (/api/events)
  if (rawUrl.includes('/events')) {
    registerSSEClient(req, res);
    return;
  }

  // 2. Rota VAPID Public Key (/api/push-vapid-key)
  if (rawUrl.includes('/push-vapid-key')) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, publicKey: vapidKeys.publicKey }));
    return;
  }

  // 3. Rota de Inscrição Push (/api/push-subscribe)
  if (rawUrl.includes('/push-subscribe') && req.method === 'POST') {
    const parsePushBody = (body: any) => {
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const subscription = parsed.subscription;
        const clientId = parsed.clientId;

        if (!subscription || !subscription.endpoint) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Subscription inválida' }));
          return;
        }

        // Remove inscrição existente com o mesmo endpoint
        activeSubscriptions = activeSubscriptions.filter((s) => s.subscription.endpoint !== subscription.endpoint);
        activeSubscriptions.push({
          subscription,
          clientId,
          createdAt: new Date().toISOString(),
        });
        savePushSubscriptions(activeSubscriptions);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, count: activeSubscriptions.length }));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: String(e) }));
      }
    };

    if (req.body) {
      parsePushBody(req.body);
      return;
    }

    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => parsePushBody(b));
    return;
  }

  // 4. Rota de Cancelamento de Inscrição Push (/api/push-unsubscribe)
  if (rawUrl.includes('/push-unsubscribe') && req.method === 'POST') {
    const parseUnsub = (body: any) => {
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const endpoint = parsed.endpoint;
        const clientId = parsed.clientId;

        activeSubscriptions = activeSubscriptions.filter(
          (s) => s.subscription.endpoint !== endpoint && (!clientId || s.clientId !== clientId)
        );
        savePushSubscriptions(activeSubscriptions);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, count: activeSubscriptions.length }));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: String(e) }));
      }
    };

    if (req.body) {
      parseUnsub(req.body);
      return;
    }
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => parseUnsub(b));
    return;
  }

  // 5. Rota de Teste de Push (/api/push-test)
  if (rawUrl.includes('/push-test') && req.method === 'POST') {
    try {
      await sendWebPushToAll({
        title: 'MIGOU: Teste de Push Manager',
        body: 'Alerta visual e som de gota d’água ativos via Service Worker!',
        icon: '/icon.svg',
        sound: '/audio/water_drop.wav',
        tag: 'migou-test-push-' + Date.now(),
        data: { url: '/', test: true },
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'Push de teste disparado para todos os dispositivos.' }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
    return;
  }

  const sheetsUrl = getGoogleSheetsServerUrl(req);

  // 6. GET /api/transfers: Obter itens mais recentes compartilhados entre todos os navegadores
  if (req.method === 'GET') {
    if (sheetsUrl) {
      try {
        const sheetItems = await fetchFromGoogleSheets(sheetsUrl);
        if (sheetItems && Array.isArray(sheetItems)) {
          memoryStore = sheetItems;
          savePersistentStore(sheetItems);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, source: 'google_sheets', items: sheetItems, lastModified }));
          return;
        }
      } catch (err) {
        console.warn('Aviso: Falha ao consultar Google Sheets no backend, usando memória/cache...', err);
      }
    }

    // 6.1 Fallback para Shared Cloud Store
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const cloudRes = await fetch('https://api.restful-api.dev/objects/ff808181a09d98f701a14c0ecc5507d9', {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (cloudRes.ok) {
        const cloudData = await cloudRes.json();
        if (Array.isArray(cloudData?.data?.items)) {
          const cloudItems = cloudData.data.items;
          const mergedMap = new Map();
          for (const it of memoryStore) mergedMap.set(String(it.id), it);
          for (const it of cloudItems) mergedMap.set(String(it.id), it);
          memoryStore = Array.from(mergedMap.values());
          savePersistentStore(memoryStore);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, source: 'cloud_sync', items: memoryStore, lastModified }));
          return;
        }
      }
    } catch (cloudErr) {}

    if (!Array.isArray(memoryStore)) {
      memoryStore = [];
      savePersistentStore([]);
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, source: 'shared_server_file', items: memoryStore, lastModified }));
    return;
  }

  // 7. DELETE /api/transfers ou /api/transfers/clear: Excluir itens selecionados ou zerar
  if (req.method === 'DELETE' || (rawUrl.includes('/clear') && req.method === 'POST')) {
    const processDelete = async (body?: any) => {
      let idsToDelete: string[] | null = null;
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {});
        if (Array.isArray(parsed.ids) && parsed.ids.length > 0) {
          idsToDelete = parsed.ids.map(String);
        }
      } catch (e) {}

      // Se for exclusão de itens específicos selecionados
      if (idsToDelete && idsToDelete.length > 0) {
        const idSet = new Set(idsToDelete);
        memoryStore = memoryStore.filter((i: any) => !idSet.has(String(i.id)));
        lastModified = Date.now();
        savePersistentStore(memoryStore);

        // Sincroniza Shared Cloud Store
        fetch('https://api.restful-api.dev/objects/ff808181a09d98f701a14c0ecc5507d9', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'midea_carrier_transfer_hub_production', data: { items: memoryStore, lastUpdated: lastModified } }),
        }).catch(() => {});

        broadcastSSE({
          type: 'TRANSFER_UPDATE',
          items: memoryStore,
          timestamp: lastModified,
        });

        if (sheetsUrl) {
          sendToGoogleSheets(sheetsUrl, { action: 'delete', ids: idsToDelete }).catch(() => {});
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, message: `${idsToDelete.length} item(ns) excluído(s).`, items: memoryStore, lastModified }));
        return;
      }

      // Se não houver IDs específicos (ou rota /clear): Zera todos os registros
      memoryStore = [];
      lastModified = Date.now();
      savePersistentStore([]);

      // Sincroniza Shared Cloud Store
      fetch('https://api.restful-api.dev/objects/ff808181a09d98f701a14c0ecc5507d9', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'midea_carrier_transfer_hub_production', data: { items: [], lastUpdated: Date.now() } }),
      }).catch(() => {});

      broadcastSSE({
        type: 'TRANSFER_UPDATE',
        items: [],
        timestamp: lastModified,
      });

      if (sheetsUrl) {
        sendToGoogleSheets(sheetsUrl, { action: 'clear' }).catch(() => {});
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'Todos os registros foram zerados.', items: [], lastModified }));
    };

    if (req.body) {
      processDelete(req.body);
      return;
    }

    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => processDelete(b));
    return;
  }

  // 8. POST /api/transfers: Atualizar itens ou gravar novas solicitações
  if (req.method === 'POST') {
    const processBody = async (body: any) => {
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const items = parsed.items !== undefined ? parsed.items : (Array.isArray(parsed) ? parsed : null);
        const action = parsed.action || 'auto'; // 'insert' | 'update' | 'replace' | 'auto'
        const allItems = Array.isArray(parsed.allItems) ? parsed.allItems : null;
        const originatorClientId = parsed.clientId || parsed.originatorClientId;

        if (!items || !Array.isArray(items)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Formato inválido. Envie { items: [...] }' }));
          return;
        }

        // Assegura que memoryStore tem os dados mais recentes do disco se estiver vazio
        if (!Array.isArray(memoryStore) || memoryStore.length === 0) {
          memoryStore = loadPersistentStore();
        }

        let updatedList: any[] = [];

        if (action === 'replace') {
          // Substituição explícita de toda a lista
          updatedList = items;
        } else {
          // Modo resiliente e incremental: NUNCA apaga registros de outros operadores
          const itemMap = new Map<string, any>();

          // 1. Carrega itens atuais do memoryStore
          for (const it of memoryStore) {
            itemMap.set(String(it.id), it);
          }

          // 2. Se o cliente enviou allItems (visão mesclada completa do navegador dele), funde preservando todos
          if (allItems && Array.isArray(allItems)) {
            for (const it of allItems) {
              const existing = itemMap.get(String(it.id));
              if (!existing) {
                itemMap.set(String(it.id), it);
              } else {
                const exTime = new Date(existing.atualizadoEm || existing.atualizado_em || existing.criadoEm || 0).getTime();
                const newTime = new Date(it.atualizadoEm || it.atualizado_em || it.criadoEm || 0).getTime();
                if (newTime >= exTime) {
                  itemMap.set(String(it.id), { ...existing, ...it });
                }
              }
            }
          }

          // 3. Mescla os itens específicos da requisição
          for (const it of items) {
            const existing = itemMap.get(String(it.id));
            if (!existing) {
              itemMap.set(String(it.id), it);
            } else {
              itemMap.set(String(it.id), { ...existing, ...it });
            }
          }

          updatedList = Array.from(itemMap.values());
        }

        // Ordena por criadoEm decrescente (mais recentes no topo)
        updatedList.sort((a: any, b: any) => {
          const tA = new Date(a.criadoEm || a.criado_em || 0).getTime();
          const tB = new Date(b.criadoEm || b.criado_em || 0).getTime();
          return tB - tA;
        });

        // Atualiza numeração de prioridade FIFO
        updatedList = updatedList.map((it: any, idx: number) => ({
          ...it,
          prioridadeFifo: idx + 1,
        }));

        memoryStore = updatedList;
        lastModified = Date.now();
        savePersistentStore(memoryStore);

        // Sincroniza Shared Cloud Store com a lista COMPLETA
        fetch('https://api.restful-api.dev/objects/ff808181a09d98f701a14c0ecc5507d9', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: 'midea_carrier_transfer_hub_production', 
            data: { items: memoryStore, lastUpdated: lastModified, count: memoryStore.length } 
          }),
        }).catch(() => {});

        // 1. Notifica instantaneamente todos os outros computadores conectados via SSE
        broadcastSSE({
          type: 'TRANSFER_UPDATE',
          items: memoryStore,
          originatorClientId,
          timestamp: lastModified,
        });

        // 2. DISPARA PUSH MANAGER (Web Push API) PARA TODOS OS COMPUTADORES SE HOUVER PENDENTES
        const pendentes = items.filter((i: any) => i.status === 'pendente');
        if (pendentes.length > 0) {
          const first = pendentes[0];
          const materiais = Array.from(new Set(pendentes.map((i: any) => i.material))).join(', ');
          
          sendWebPushToAll(
            {
              title: `MIGOU: Nova Solicitação SAP (${first.centro})`,
              body: `${first.criadoPor || 'Time Buiatte'} solicitou transferência de ${materiais} (${first.depositoOrigem} ➔ ${first.depositoDestino}) com ${pendentes.length} serial(is).`,
              icon: '/icon.svg',
              sound: '/audio/water_drop.wav',
              tag: 'migou-solicitation-' + Date.now(),
              items: pendentes,
              data: {
                url: '/',
                solicitationCode: first.solicitationCode,
                material: first.material,
              },
            },
            originatorClientId // Não dispara push no computador do próprio solicitante!
          ).catch((e) => console.warn('Erro ao disparar Web Push:', e));
        }

        // 3. Grava no Google Sheets em segundo plano caso configurado
        if (sheetsUrl) {
          sendToGoogleSheets(sheetsUrl, { action, items, originatorClientId }).catch((e) => {
            console.warn('Erro ao sincronizar com Google Sheets no POST:', e);
          });
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, count: memoryStore.length, items: memoryStore, lastModified }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    };

    if (req.body) {
      await processBody(req.body);
      return;
    }

    let bodyData = '';
    req.on('data', (chunk) => {
      bodyData += chunk;
    });

    req.on('end', async () => {
      await processBody(bodyData);
    });
    return;
  }

  res.statusCode = 405;
  res.end('Method Not Allowed');
}
