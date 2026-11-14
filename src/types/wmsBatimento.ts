import { IQ09Item } from './iq09';

/**
 * Item individual consolidado da Base de Batimento de Estoque (SAP x Sênior WMS)
 * ou gerado pelo cruzamento automático no MIGOU entre:
 * 1. "Gerenciador de Informações Específicas" (Sênior WMS)
 * 2. "Estoque Local por Lote" (Sênior WMS)
 * 3. "Base IQ09" (SAP)
 */
export interface WMSBatimentoItem {
  /** Coluna A (Batimento) / Coluna "Valor" (Gerenciador WMS): UII / Número de Série */
  serial: string;
  /** Coluna B (Batimento): Material no SAP */
  materialSap: string;
  /** Coluna C (Batimento) / "Código do Produto" (WMS): Material no Sênior WMS */
  materialWms: string;
  /** Coluna F (Batimento): Centro no SAP (ex: B123, B124, B158, B159, B179, B180) */
  centroSap: string;
  /** Coluna G (Batimento): Depósito no SAP (ex: B110, B111, B114, B148, B413, B136, B149, B137) */
  depositoSap: string;
  /** Coluna I (Batimento): Centro no Sênior WMS (ex: B124, B158, FALTA, SOBRA/FALTA, PACKING, DOCA) */
  centroWms: string;
  /** Coluna J (Batimento): Depósito no Sênior WMS (ex: B110, B114, B413, FALTA, SOBRA/FALTA, DOCA, PACKING) */
  depositoWms: string;
  /** Coluna L (Batimento): Setor Completo no Sênior WMS (ex: 'B124_B110 - E-COMM IMP. (PPP)', 'FALTA') */
  setorCompletoWms?: string;
  /** Coluna M (Batimento): Endereço / Local físico no Sênior WMS (ex: 'R23108041', 'F0003001011') */
  localWms?: string;
  /** Coluna N (Batimento): Local Ativo no Sênior WMS ('S' | 'N') */
  localAtivo?: string;
  /** Coluna U (Batimento) / "Lote" (WMS): Número do Lote no Sênior WMS (ex: '3048416') */
  lote?: string;
  /** Alias para compatibilidade na UI */
  loteWms?: string;
  /** Coluna V (Batimento): Lote Liberado no Sênior WMS ('S' | 'N') */
  loteLiberado?: string;
  /** Coluna W (Batimento): Status IQC (ex: 'B136', 'B149', 'B110') */
  statusIqc?: string;
  /**
   * Coluna X (Batimento): Diagnóstico oficial da Análise de Batimento
   * Exemplos reais:
   * - 'OK' | 'OK - parcial local' | 'OK - exceção status mais grave que o IQC'
   * - 'Falta - desconsiderar' (SAP = B111 e WMS = FALTA / SOBRA/FALTA)
   * - 'Mover no SAP para B111' (SAP = Livre e WMS = SOBRA/FALTA ou FALTA)
   * - 'Serial existe apenas no SAP' (SAP tem saldo ex: B111/B148, mas WMS não tem)
   * - 'Serial existe apenas no WMS' (WMS tem saldo, mas SAP não tem)
   * - 'Validar no físico se existe' (SAP = B111, mas WMS aponta rua ex: B110/B413)
   * - 'Mover pallet para a rua do centro correto'
   * - 'Mover série para local do setor correto'
   * - 'Desbloquear lote no WMS'
   * - 'Ativar local no WMS'
   * - 'Material divergente entre SAP e WMS'
   * - 'Serial duplicado no WMS'
   * - 'Em stage' | 'Pendente expedição' | 'Série presa por local errado'
   */
  analise: string;
  /** Coluna Y (Batimento): Responsável pela ação ('Nenhum' | 'WMS' | 'SAP' | 'Físico' | 'WMS e SAP' | 'A definir') */
  ondeAgir?: string;
  /** Coluna Z (Batimento): Nível da ação ('Nenhum' | 'Local' | 'Série' | 'A definir') */
  nivel?: string;
  /** Coluna AA (Batimento): Prioridade ('Crítico' | 'Normal' | 'Baixa') */
  prioridade?: string;
  /** Coluna AB (Batimento): Motivo detalhado da análise */
  motivo?: string;
  /** Campos complementares vindos do "Gerenciador de Informações Específicas" do Sênior WMS */
  ordemRecebimento?: string;
  notaFiscal?: string;
  onda?: string;
}

export interface WMSBatimentoMetadata {
  snapshotId: string;
  updatedAt: string; // ISO string
  updatedBy: string;
  fileName: string;
  fileNames: string[];
  totalItems: number;
  totalSerials: number;
  okCount: number;
  b111FaltaDesconsiderarCount: number;
  b111InFaltaWmsCount: number;
  moverParaB111Count: number;
  apenasNoSapCount: number;
  apenasNoWmsCount: number;
  divergenciasWmsCount: number;
  divergenciaWmsCount: number;
  validarFisicoCount: number;
  analiseBreakdown: Record<string, number>;
  depositosWmsCount: Record<string, number>;
  sourceType: 'batimento_xlsx' | 'wms_raw_merge' | 'sample' | 'cloud_sync';
}

export interface WMSBatimentoSnapshot {
  metadata: WMSBatimentoMetadata;
  items: WMSBatimentoItem[];
}

export type WMSBreakerCode =
  | 'WMS_ALIGNED_OK'
  | 'WMS_ALIGNED_NEED_PHYSICAL_CHECK'
  | 'WMS_READY_FOR_B111_SHORTAGE'
  | 'BLOCKED_STILL_FALTA_IN_WMS'
  | 'BLOCKED_ONLY_EXISTS_IN_SAP'
  | 'BLOCKED_WMS_DEPOSIT_MISMATCH'
  | 'BLOCKED_STILL_FREE_IN_WMS_FOR_B111'
  | 'BLOCKED_WMS_LOTE_OR_LOCAL_LOCKED'
  | 'BLOCKED_MATERIAL_MISMATCH_WMS_SAP'
  | 'BLOCKED_ALREADY_ALIGNED_BOTH'
  | 'NOT_FOUND_IN_WMS_BASE'
  | 'NO_WMS_BASE_LOADED';

export interface WMSBreakerVerdict {
  serial: string;
  hasWmsBase: boolean;
  foundInWmsBase: boolean;
  /** Se true, a solicitação é permitida. Se false, o Breaker bloqueia a solicitação! */
  isAllowed: boolean;
  /** Alias para compatibilidade nos modais */
  allowed: boolean;
  severity: 'approved' | 'warning_physical_check' | 'blocked_breaker' | 'not_in_batimento' | 'no_base';
  code: WMSBreakerCode;
  /** Selo curto para exibição em tabelas e badges (ex: '✅ WMS OK: B110', '🛑 WMS: Em FALTA') */
  badgeLabel: string;
  /** Título executivo do alerta / validação */
  title: string;
  /** Explicação clara do porquê a solicitação é indevida (ou válida), citando dados reais do Sênior WMS */
  whyExplanation: string;
  /** Alias para compatibilidade nos modais */
  whyItIsInvalid: string;
  /** Plano de ação prático e educativo para o Time Buiatte atuar (Sênior WMS / Físico / Alinhamento com Gestores) */
  buiatteActionPlan: string[];
  /** Quem deve agir segundo o Batimento ('WMS', 'Físico', 'SAP', 'Gestão') */
  actionOwner: 'WMS' | 'Físico' | 'SAP' | 'Gestão' | 'Nenhum';
  /** Sugestão de correção automática de rota caso o Sênior WMS indique outro destino válido */
  suggestedFix?: {
    material?: string;
    centro?: string;
    depositoOrigem?: string;
    depositoDestino?: string;
    label: string;
  };
  wmsItem?: WMSBatimentoItem;
  iq09Item?: IQ09Item;
}
