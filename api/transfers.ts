import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const DATA_FILE = path.join(process.cwd(), 'transfers_data.json');
const VAPID_FILE = path.join(process.cwd(), 'vapid_keys.json');
const SUBS_FILE = path.join(process.cwd(), 'push_subscriptions.json');

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

// Dados iniciais padrão para demonstração operacional
const DEFAULT_SEED = [
  {
    id: 'seed-1',
    solicitationCode: 'SOL-2401',
    material: 'MDWTF08B1',
    serial: '541760002ZGB4133400502',
    centro: 'B124',
    depositoOrigem: 'B148',
    depositoDestino: 'B110',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    prioridadeFifo: 1,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-001',
    observacoes: 'Urgente para expedição da tarde',
    originatorClientId: 'initial_seed',
  },
  {
    id: 'seed-2',
    solicitationCode: 'SOL-2401',
    material: 'MDWTF08B1',
    serial: '541760002ZGB4133400533',
    centro: 'B124',
    depositoOrigem: 'B148',
    depositoDestino: 'B110',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    prioridadeFifo: 2,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-001',
    originatorClientId: 'initial_seed',
  },
  {
    id: 'seed-3',
    solicitationCode: 'SOL-2402',
    material: 'TSM62',
    serial: '541711001X9B6233500679',
    centro: 'B124',
    depositoOrigem: 'B148',
    depositoDestino: 'B111',
    status: 'em_analise',
    criadoEm: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    atualizadoPor: 'Carlos (Time Midea SAP)',
    prioridadeFifo: 3,
    slaStatus: 'atencao',
    batchId: 'BATCH-002',
    observacoes: 'Validando saldo físico x contábil no SAP MMBE',
    originatorClientId: 'initial_seed',
  },
  {
    id: 'seed-4',
    solicitationCode: 'SOL-2403',
    material: 'PP5MS1',
    serial: 'PS142600024',
    centro: 'B124',
    depositoOrigem: 'B110',
    depositoDestino: 'B111',
    status: 'concluido',
    criadoEm: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    atualizadoPor: 'Ana Paula (Time Midea SAP)',
    sapDocNumber: '4900188921',
    prioridadeFifo: 4,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-003',
    observacoes: 'Movimentação 311 efetuada no SAP. Liberado no WMS.',
    originatorClientId: 'initial_seed',
  },
  {
    id: 'seed-5',
    solicitationCode: 'SOL-2404',
    material: '38TAVCB18M5',
    serial: 'S3226B22695419',
    centro: 'B123',
    depositoOrigem: 'B110',
    depositoDestino: 'B111',
    status: 'divergencia',
    criadoEm: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    atualizadoPor: 'Carlos (Time Midea SAP)',
    prioridadeFifo: 5,
    slaStatus: 'estourado',
    batchId: 'BATCH-004',
    observacoes: 'Divergência: Serial não encontrado em estoque no depósito B110 do Centro B123.',
    originatorClientId: 'initial_seed',
  },
  {
    id: 'seed-6',
    solicitationCode: 'SOL-2405',
    material: 'QCL108BB',
    serial: 'S1326B21294802',
    centro: 'B179',
    depositoOrigem: 'B111',
    depositoDestino: 'B413',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    prioridadeFifo: 6,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-005',
    originatorClientId: 'initial_seed',
  },
  {
    id: 'seed-7',
    solicitationCode: 'SOL-2406',
    material: 'QCL108BB',
    serial: 'S1326B21294807',
    centro: 'B158',
    depositoOrigem: 'B111',
    depositoDestino: 'B114',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    prioridadeFifo: 7,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-006',
    originatorClientId: 'initial_seed',
  },
  {
    id: 'seed-8',
    solicitationCode: 'SOL-2406',
    material: 'QCL108BB',
    serial: 'S1326B21294814',
    centro: 'B158',
    depositoOrigem: 'B111',
    depositoDestino: 'B114',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    prioridadeFifo: 8,
    slaStatus: 'no_prazo',
    batchId: 'BATCH-006',
    originatorClientId: 'initial_seed',
  },
];

// Carregar memória persistida do disco ou usar seed
function loadPersistentStore(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar transfers_data.json:', e);
  }
  savePersistentStore(DEFAULT_SEED);
  return DEFAULT_SEED;
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

        if (!error && data && data.length > 0) {
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
        }
      } catch (err) {
        console.warn('Erro ao consultar Supabase no backend, usando arquivo/memória:', err);
      }
    }

    if (!memoryStore || memoryStore.length === 0) {
      memoryStore = DEFAULT_SEED;
      savePersistentStore(DEFAULT_SEED);
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, source: 'shared_server_file', items: memoryStore, lastModified }));
    return;
  }

  // 7. POST /api/transfers: Atualizar itens ou gravar novas solicitações
  if (req.method === 'POST') {
    const processBody = async (body: any) => {
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const items = parsed.items || (Array.isArray(parsed) ? parsed : null);
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

        // 2. DISPARA PUSH MANAGER (Web Push API) PARA TODOS OS COMPUTADORES
        // Garante que mesmo com o navegador em segundo plano ou tela minimizada,
        // o Service Worker recebe a mensagem, exibe a notificação nativa por 5s e toca a gota d'água
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
            const payload = items.map((i: any) => ({
              id: i.id,
              solicitation_code: i.solicitationCode,
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

            await supabase.from('transfer_requests').upsert(payload, { onConflict: 'id' });
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
