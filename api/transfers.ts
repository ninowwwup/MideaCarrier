import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

// Memória compartilhada em processo para Vercel Serverless / Node.js
let memoryStore: any[] = [
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
  },
];

let lastModified = Date.now();

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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const supabase = getSupabaseServerClient();

  // GET: Obter itens mais recentes
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
          }));

          memoryStore = mapped;
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, source: 'supabase', items: mapped, lastModified }));
          return;
        }
      } catch (err) {
        console.warn('Erro ao consultar Supabase no backend, usando memória:', err);
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, source: 'backend_memory', items: memoryStore, lastModified }));
    return;
  }

  // POST: Atualizar itens ou gravar novas solicitações
  if (req.method === 'POST') {
    let bodyData = '';
    req.on('data', (chunk) => {
      bodyData += chunk;
    });

    req.on('end', async () => {
      try {
        const parsed = JSON.parse(bodyData || '{}');
        const items = parsed.items || (Array.isArray(parsed) ? parsed : null);

        if (!items || !Array.isArray(items)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Formato inválido. Envie { items: [...] }' }));
          return;
        }

        memoryStore = items;
        lastModified = Date.now();

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
    });
    return;
  }

  res.statusCode = 405;
  res.end('Method Not Allowed');
}
