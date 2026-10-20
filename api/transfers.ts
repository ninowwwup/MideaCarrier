import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
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

function getSupabaseServerClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  try {
    return createClient(url.trim(), key.trim());
  } catch (e) {
    console.error('Falha ao instanciar Supabase no servidor:', e);
    return null;
  }
}

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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

  const supabase = getSupabaseServerClient();

  // 6. GET /api/transfers: Obter itens mais recentes compartilhados entre todos os navegadores
  if (req.method === 'GET') {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('transfer_requests')
          .select('*')
          .order('criado_em', { ascending: false });

        if (!error && Array.isArray(data)) {
          const mapped = data.map((d: any, index: number) => ({
            id: String(d.id),
            solicitationCode: d.solicitation_code || `SOL-${index + 1}`,
            material: d.material,
            serial: d.serial,
            centro: d.centro,
            depositoOrigem: d.deposito_origem,
            depositoDestino: d.deposito_destino,
            status: d.status,
            criadoEm: d.criado_em,
            criadoPor: d.criado_por || 'Time Buiatte (Sênior WMS)',
            atualizadoEm: d.atualizado_em || d.criado_em,
            atualizadoPor: d.atualizado_por,
            sapDocNumber: d.sap_doc_number,
            observacoes: d.observacoes,
            prioridadeFifo: index + 1,
            batchId: d.batch_id,
            labelPhotoUrl: d.label_photo_url || d.labelPhotoUrl,
            originatorClientId: d.originator_client_id || d.originatorClientId,
          }));

          memoryStore = mapped;
          savePersistentStore(mapped);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, source: 'supabase', items: mapped, lastModified }));
          return;
        } else if (error) {
          console.warn('Erro retornado pelo Supabase no backend:', error.message);
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Banco de dados temporariamente inacessível', details: error.message }));
          return;
        }
      } catch (err) {
        console.warn('Exceção ao consultar Supabase no backend:', err);
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Falha na conexão com Supabase' }));
        return;
      }
    }

    if (!Array.isArray(memoryStore)) {
      memoryStore = [];
      savePersistentStore([]);
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, source: 'shared_server_file', items: memoryStore, lastModified }));
    return;
  }

  // 7. DELETE /api/transfers ou /api/transfers/clear: Limpeza e reinicialização completa do zero
  if (req.method === 'DELETE' || (rawUrl.includes('/clear') && req.method === 'POST')) {
    memoryStore = [];
    lastModified = Date.now();
    savePersistentStore([]);

    broadcastSSE({
      type: 'TRANSFER_UPDATE',
      items: [],
      timestamp: lastModified,
    });

    if (supabase) {
      try {
        await supabase.from('transfer_requests').delete().neq('id', 'placeholder_none');
      } catch (e) {
        console.warn('Erro ao limpar Supabase via backend DELETE:', e);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'Todos os registros foram zerados.', items: [], lastModified }));
    return;
  }

  // 8. POST /api/transfers: Atualizar itens ou gravar novas solicitações
  if (req.method === 'POST') {
    const processBody = async (body: any) => {
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const items = parsed.items !== undefined ? parsed.items : (Array.isArray(parsed) ? parsed : null);
        const originatorClientId = parsed.clientId || parsed.originatorClientId;

        if (!items || !Array.isArray(items)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Formato inválido. Envie { items: [...] }' }));
          return;
        }

        memoryStore = items;
        lastModified = Date.now();
        savePersistentStore(items);

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

        if (supabase) {
          try {
            if (items.length > 0) {
              const payload = items.map((i: any) => ({
                id: String(i.id),
                solicitation_code: i.solicitationCode || null,
                material: i.material,
                serial: i.serial,
                centro: i.centro,
                deposito_origem: i.depositoOrigem,
                deposito_destino: i.depositoDestino,
                status: i.status,
                criado_em: i.criadoEm,
                criado_por: i.criadoPor,
                atualizado_em: i.atualizadoEm || new Date().toISOString(),
                atualizado_por: i.atualizadoPor || null,
                sap_doc_number: i.sapDocNumber || null,
                observacoes: i.observacoes || null,
                batch_id: i.batchId || null,
                label_photo_url: i.labelPhotoUrl || null,
                originator_client_id: i.originatorClientId || null,
              }));

              let { error } = await supabase.from('transfer_requests').upsert(payload, { onConflict: 'id' });

              if (error && (error.code === '42703' || error.message?.includes('column'))) {
                console.warn('Backend: colunas estendidas ausentes no Supabase, tentando com campos base...');
                const corePayload = items.map((i: any) => ({
                  id: String(i.id),
                  solicitation_code: i.solicitationCode || `SOL-${i.id}`,
                  material: i.material,
                  serial: i.serial,
                  centro: i.centro,
                  deposito_origem: i.depositoOrigem,
                  deposito_destino: i.depositoDestino,
                  status: i.status,
                  criado_em: i.criadoEm,
                  criado_por: i.criadoPor,
                  atualizado_em: i.atualizadoEm || new Date().toISOString(),
                  sap_doc_number: i.sapDocNumber || null,
                  observacoes: i.observacoes || null,
                }));
                await supabase.from('transfer_requests').upsert(corePayload, { onConflict: 'id' });
              }
            }
          } catch (e) {
            console.warn('Erro ao atualizar Supabase no POST:', e);
          }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, items: memoryStore, lastModified }));
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
