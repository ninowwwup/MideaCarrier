import { TransferItem, NewTransferInput, KPIStats } from '../types/transfer';
import { getSupabase } from './supabaseClient';
import { calculateSLA } from '../utils/sapFormatter';

const STORAGE_KEY = 'midea_transfer_items_v1';

// Dados iniciais fornecidos pelo usuário no prompt
const INITIAL_SEED: TransferItem[] = [
  {
    id: 'seed-1',
    solicitationCode: 'SOL-2401',
    material: 'MDWTF08B1',
    serial: '541760002ZGB4133400502',
    centro: 'B124',
    depositoOrigem: 'B148',
    depositoDestino: 'B110',
    status: 'pendente',
    criadoEm: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 min atrás
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
    criadoEm: new Date(Date.now() - 85 * 60 * 1000).toISOString(), // 85 min atrás
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
    criadoEm: new Date(Date.now() - 150 * 60 * 1000).toISOString(), // 2.5h atrás
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
    criadoEm: new Date(Date.now() - 210 * 60 * 1000).toISOString(), // 3.5h atrás
    criadoPor: 'Time Buiatte (Sênior WMS)',
    atualizadoEm: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    atualizadoPor: 'Carlos (Time Midea SAP)',
    prioridadeFifo: 5,
    slaStatus: 'estourado',
    batchId: 'BATCH-004',
    observacoes: 'Divergência: Serial não encontrado em estoque no depósito B110 do Centro B123. Verificar se está bloqueado ou em trânsito.',
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

export async function fetchTransferItems(): Promise<{ items: TransferItem[]; source: 'supabase' | 'local' }> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('transfer_requests')
        .select('*')
        .order('criado_em', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: TransferItem[] = data.map((d: any, index: number) => {
          const sla = calculateSLA(d.criado_em || d.criadoEm, d.status);
          return {
            id: String(d.id),
            solicitationCode: d.solicitation_code || d.solicitationCode || `SOL-${index + 1}`,
            material: d.material,
            serial: d.serial,
            centro: d.centro,
            depositoOrigem: d.deposito_origem || d.depositoOrigem,
            depositoDestino: d.deposito_destino || d.depositoDestino,
            status: d.status,
            criadoEm: d.criado_em || d.criadoEm,
            criadoPor: d.criado_por || d.criadoPor || 'Time Buiatte',
            atualizadoEm: d.atualizado_em || d.atualizadoEm || d.criado_em,
            atualizadoPor: d.atualizado_por || d.atualizadoPor,
            sapDocNumber: d.sap_doc_number || d.sapDocNumber,
            observacoes: d.observacoes,
            prioridadeFifo: index + 1,
            slaStatus: sla.slaStatus,
            batchId: d.batch_id || d.batchId,
          };
        });
        return { items: mapped, source: 'supabase' };
      }
    } catch (err) {
      console.warn('Erro ao consultar Supabase, usando armazenamento local:', err);
    }
  }

  // Fallback LocalStorage
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: TransferItem[] = JSON.parse(raw);
        // Recalcular SLA e ordenação FIFO
        const updated = parsed.map((item, idx) => ({
          ...item,
          prioridadeFifo: idx + 1,
          slaStatus: calculateSLA(item.criadoEm, item.status).slaStatus,
        }));
        return { items: updated, source: 'local' };
      } catch (e) {
        console.error('Falha ao ler dados do localStorage:', e);
      }
    }
    // Salvar initial seed
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED));
  }

  return { items: INITIAL_SEED, source: 'local' };
}

export async function saveTransferItems(items: TransferItem[]): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      // Upsert nos itens no Supabase
      const payload = items.map((i) => ({
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
        atualizado_em: i.atualizadoEm,
        atualizado_por: i.atualizadoPor || null,
        sap_doc_number: i.sapDocNumber || null,
        observacoes: i.observacoes || null,
        batch_id: i.batchId || null,
      }));

      await supabase.from('transfer_requests').upsert(payload, { onConflict: 'id' });
    } catch (err) {
      console.warn('Não foi possível sincronizar imediatamente com Supabase:', err);
    }
  }
}

export function createRequestsFromMultiSerial(
  input: NewTransferInput,
  currentCount: number
): TransferItem[] {
  const now = new Date().toISOString();
  const batchCode = `BATCH-${Date.now().toString().slice(-4)}`;
  const solicitationCode = `SOL-${1000 + currentCount + 1}`;
  const seriais = input.seriais.length > 0 ? input.seriais : ['S/N'];

  return seriais.map((serial, idx) => ({
    id: `req-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
    solicitationCode,
    material: input.material.trim().toUpperCase(),
    serial: serial.trim(),
    centro: input.centro.trim().toUpperCase(),
    depositoOrigem: input.depositoOrigem.trim().toUpperCase(),
    depositoDestino: input.depositoDestino.trim().toUpperCase(),
    status: 'pendente',
    criadoEm: now,
    criadoPor: input.solicitante || 'Time Buiatte (Sênior WMS)',
    atualizadoEm: now,
    prioridadeFifo: currentCount + idx + 1,
    slaStatus: 'no_prazo',
    batchId: batchCode,
    observacoes: input.observacoes?.trim() || undefined,
  }));
}

export function computeKPIs(items: TransferItem[]): KPIStats {
  const totalItens = items.length;
  const seriaisUnicos = new Set(items.map((i) => i.serial)).size;
  
  let pendentes = 0;
  let emAnalise = 0;
  let concluidos = 0;
  let divergencias = 0;
  let noPrazoCount = 0;
  let totalMinutosAtendimento = 0;
  let concluidosComTempo = 0;
  let maisAntigoPendenteMin = 0;

  for (const item of items) {
    if (item.status === 'pendente') {
      pendentes++;
      const { minutos, slaStatus } = calculateSLA(item.criadoEm, item.status);
      if (slaStatus === 'no_prazo') noPrazoCount++;
      if (minutos > maisAntigoPendenteMin) maisAntigoPendenteMin = minutos;
    } else if (item.status === 'em_analise') {
      emAnalise++;
      const { slaStatus } = calculateSLA(item.criadoEm, item.status);
      if (slaStatus === 'no_prazo') noPrazoCount++;
    } else if (item.status === 'concluido') {
      concluidos++;
      noPrazoCount++;
      const diffMs = new Date(item.atualizadoEm).getTime() - new Date(item.criadoEm).getTime();
      const mins = Math.max(1, Math.floor(diffMs / 60000));
      totalMinutosAtendimento += mins;
      concluidosComTempo++;
    } else if (item.status === 'divergencia') {
      divergencias++;
    }
  }

  const taxaSlaNoPrazo = totalItens > 0 ? Math.round((noPrazoCount / totalItens) * 100) : 100;
  const tempoMedioAtendimentoMin =
    concluidosComTempo > 0 ? Math.round(totalMinutosAtendimento / concluidosComTempo) : 38;

  return {
    totalItens,
    totalSeriais: seriaisUnicos,
    pendentes,
    emAnalise,
    concluidos,
    divergencias,
    taxaSlaNoPrazo,
    tempoMedioAtendimentoMin,
    maisAntigoPendenteMin,
  };
}

export function getSupabaseSQLSchema(): string {
  return `-- SCRIPT SQL DDL PARA O SUPABASE (PostgreSQL)
-- Copie e cole no SQL Editor do seu projeto Supabase (gratuito)

create table if not exists public.transfer_requests (
  id text primary key,
  solicitation_code text not null,
  material text not null,
  serial text not null,
  centro text not null,
  deposito_origem text not null,
  deposito_destino text not null,
  status text not null default 'pendente' check (status in ('pendente', 'em_analise', 'concluido', 'divergencia')),
  criado_em timestamptz not null default now(),
  criado_por text not null default 'Time Buiatte (Sênior WMS)',
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  sap_doc_number text,
  observacoes text,
  batch_id text
);

-- Índices para alta performance em buscas de SLA, FIFO e Materiais
create index if not exists idx_transfer_requests_status on public.transfer_requests (status);
create index if not exists idx_transfer_requests_criado_em on public.transfer_requests (criado_em);
create index if not exists idx_transfer_requests_material on public.transfer_requests (material);
create index if not exists idx_transfer_requests_serial on public.transfer_requests (serial);
create index if not exists idx_transfer_requests_centro on public.transfer_requests (centro);

-- Habilitar Row Level Security (RLS) público ou autenticado
alter table public.transfer_requests enable row level security;

-- Política de acesso permissiva para o app operacional compartilhado
create policy "Acesso total aos times Midea e Buiatte"
  on public.transfer_requests
  for all
  using (true)
  with check (true);
`;
}
