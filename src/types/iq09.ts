export interface IQ09Item {
  /** Coluna B: UII (Número de Série / Unique Item Identifier no SAP) */
  serial: string;
  /** Coluna A: Código do Material SAP (ex: QQI075BB, MXSA27S2, MM2-EM27PA(WH)) */
  material: string;
  /** Coluna C: Centro SAP (ex: B179, B124, B158) */
  centro: string;
  /** Coluna D: Depósito Atual no SAP (ex: B413, B148, B110, B111, B136) */
  deposito: string;
  /** Coluna E: Tipo de estoque (ex: '01' = Utilização Livre) */
  tipoEstoque: string;
  /** Coluna F: Status do sistema SAP (ex: 'DEPS', 'EDEL', 'ESTC', 'AVLB') */
  statusSistema: string;
  /** Coluna I: Estoque especial (opcional) */
  estqEspecial?: string;
  /** Coluna J: Ordem do cliente vinculada (opcional) */
  ordemCliente?: string;
  /** Coluna L: Data da última modificação no SAP (ex: 03/06/2026) */
  modificadoEm?: string;
  /** Coluna M: Usuário SAP da última modificação (ex: APEREIRA, FPIRES) */
  modificadoPor?: string;
  /** Coluna P: Número do Equipamento no SAP (ex: 50416234) */
  equipamento?: string;
}

export interface IQ09SnapshotMetadata {
  snapshotId: string;
  updatedAt: string; // ISO string
  updatedBy: string;
  fileName: string;
  totalItems: number;
  uniqueMaterials: number;
  centrosCount: Record<string, number>;
  depositosCount: Record<string, number>;
  sourceType: 'xlsx_upload' | 'csv_upload' | 'clipboard_paste' | 'sample' | 'cloud_sync' | 'sap_api';
}

export interface IQ09Snapshot {
  metadata: IQ09SnapshotMetadata;
  items: IQ09Item[];
}

export type IQ09CrossCheckStatus =
  | 'apto_transferir'
  | 'ja_no_destino'
  | 'ja_na_fila_migou'
  | 'bloqueado_avaria_origem'
  | 'bloqueado_status_sap'
  | 'divergencia_rota_centro'
  | 'nao_encontrado_iq09';

export interface IQ09BatchValidationItem {
  inputSerial: string;
  status: IQ09CrossCheckStatus;
  iq09Item?: IQ09Item;
  existingQueueItem?: {
    solicitationCode: string;
    status: string;
    depositoOrigem: string;
    depositoDestino: string;
    criadoEm: string;
  };
  suggestedMaterial: string;
  suggestedCentro: string;
  suggestedOrigem: string;
  suggestedDestino: string;
  statusTitle: string;
  statusDetail: string;
  canCreateRequest: boolean;
}
