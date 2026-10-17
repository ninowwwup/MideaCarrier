export type TransferStatus = 'pendente' | 'em_analise' | 'concluido' | 'divergencia';

export type TeamRole = 'buiatte' | 'midea' | 'ambos';

export interface TransferItem {
  id: string;
  solicitationCode: string; // Ex: SOL-2026-001
  material: string;
  serial: string;
  centro: string;
  depositoOrigem: string;
  depositoDestino: string;
  status: TransferStatus;
  criadoEm: string; // ISO date
  criadoPor: string; // ex: "Time Buiatte (WMS)"
  atualizadoEm: string;
  atualizadoPor?: string; // ex: "Time Midea (SAP)"
  sapDocNumber?: string; // Número do Documento de Material no SAP (ex: 4900123456)
  observacoes?: string; // Motivo de erro ou notas
  prioridadeFifo: number; // Índice FIFO (1 é o mais antigo)
  slaStatus: 'no_prazo' | 'atencao' | 'estourado';
  batchId?: string; // ID do lote caso tenha sido submetido em lote
}

export interface NewTransferInput {
  material: string;
  seriais: string[];
  centro: string;
  depositoOrigem: string;
  depositoDestino: string;
  observacoes?: string;
  solicitante?: string;
}

export interface FilterOptions {
  busca: string;
  status: TransferStatus | 'todos';
  centro: string | 'todos';
  depositoOrigem: string | 'todos';
  depositoDestino: string | 'todos';
  periodo: 'todos' | 'hoje' | '7dias' | '30dias';
  apenasDivergencias: boolean;
}

export interface KPIStats {
  totalItens: number;
  totalSeriais: number;
  pendentes: number;
  emAnalise: number;
  concluidos: number;
  divergencias: number;
  taxaSlaNoPrazo: number;
  tempoMedioAtendimentoMin: number;
  maisAntigoPendenteMin: number;
}
