import { TransferItem } from '../types/transfer';

export type DepositCategory =
  | 'estoque_livre'
  | 'blue_service'
  | 'inventario_falta_definitivo'
  | 'avaria_definitivo'
  | 'operacional';

export type DepositApplication = 'PRODUTO' | 'PEÇAS' | 'PEÇAS/PRODUTOS';

export interface SAPCentroInfo {
  code: string;
  originType: 'NACIONAL' | 'IMPORTADO';
  channelName: string;
  segment: 'E-COMMERCE / PÓS VENDA' | 'LOJAS MIDEA CARRIER' | 'PÓS VENDA';
  freeStockProductDeposit: string;
  freeStockPartsDeposit?: string;
  blueServicePartsDeposit?: string;
  inventoryShortageProductDeposit: string;
  inventoryShortagePartsDeposit?: string;
  damageDeposits: string[];
}

export interface SAPDepositInfo {
  code: string;
  category: DepositCategory;
  nature: 'Definitivo' | 'Transitório';
  colorScheme: 'green' | 'yellow' | 'red';
  classification: string;
  shortTitle: string;
  definition: string;
  application: DepositApplication;
  allowedCentros: string[];
  channels: string[];
  canBeOriginToFreeStock: boolean;
  whenToUseAsOrigin: string;
  whenToUseAsDestination: string;
}

export const SAP_CENTROS_CATALOG: Record<string, SAPCentroInfo> = {
  B123: {
    code: 'B123',
    originType: 'NACIONAL',
    channelName: 'CD MG NACIONAL E-COMMERCE / PÓS VENDA',
    segment: 'E-COMMERCE / PÓS VENDA',
    freeStockProductDeposit: 'B110',
    inventoryShortageProductDeposit: 'B111',
    damageDeposits: ['B136', 'B149', 'B137'],
  },
  B124: {
    code: 'B124',
    originType: 'IMPORTADO',
    channelName: 'CD MG IMPORTADO E-COMMERCE / PÓS VENDA',
    segment: 'E-COMMERCE / PÓS VENDA',
    freeStockProductDeposit: 'B110',
    inventoryShortageProductDeposit: 'B111',
    damageDeposits: ['B136', 'B149', 'B137'],
  },
  B158: {
    code: 'B158',
    originType: 'NACIONAL',
    channelName: 'CD MG NACIONAL LOJAS MIDEA CARRIER',
    segment: 'LOJAS MIDEA CARRIER',
    freeStockProductDeposit: 'B114',
    freeStockPartsDeposit: 'B130',
    blueServicePartsDeposit: 'B416',
    inventoryShortageProductDeposit: 'B111',
    inventoryShortagePartsDeposit: 'B152',
    damageDeposits: ['B136', 'B149', 'B137'],
  },
  B159: {
    code: 'B159',
    originType: 'IMPORTADO',
    channelName: 'CD MG IMPORT. LOJAS MIDEA CARRIER',
    segment: 'LOJAS MIDEA CARRIER',
    freeStockProductDeposit: 'B114',
    freeStockPartsDeposit: 'B130',
    blueServicePartsDeposit: 'B416',
    inventoryShortageProductDeposit: 'B111',
    inventoryShortagePartsDeposit: 'B152',
    damageDeposits: ['B136', 'B149', 'B137'],
  },
  B179: {
    code: 'B179',
    originType: 'NACIONAL',
    channelName: 'CD MG NACIONAL PÓS VENDA',
    segment: 'PÓS VENDA',
    freeStockProductDeposit: 'B413',
    freeStockPartsDeposit: 'B412',
    inventoryShortageProductDeposit: 'B111',
    inventoryShortagePartsDeposit: 'B152',
    damageDeposits: ['B136', 'B149', 'B137'],
  },
  B180: {
    code: 'B180',
    originType: 'IMPORTADO',
    channelName: 'CD MG IMPORT PÓS VENDA',
    segment: 'PÓS VENDA',
    freeStockProductDeposit: 'B413',
    freeStockPartsDeposit: 'B412',
    inventoryShortageProductDeposit: 'B111',
    inventoryShortagePartsDeposit: 'B152',
    damageDeposits: ['B136', 'B149', 'B137'],
  },
};

export const SAP_DEPOSITOS_CATALOG: Record<string, SAPDepositInfo> = {
  // 1. ESTOQUE LIVRE & BLUE SERVICE (VERDE — DEFINITIVO)
  B110: {
    code: 'B110',
    category: 'estoque_livre',
    nature: 'Definitivo',
    colorScheme: 'green',
    classification: 'Estoque livre — Definitivo',
    shortTitle: 'Estoque Livre (Produto)',
    definition: 'Depósito definido para estoque disponível.',
    application: 'PRODUTO',
    allowedCentros: ['B123', 'B124'],
    channels: ['CD MG NACIONAL PÓS VENDA / E-COMMERCE', 'CD MG IMPORT PÓS VENDA / E-COMMERCE'],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando um produto bom nos centros B123/B124 precisa ser segregado por falta de inventário (B111) ou avaria (B136/B149/B137).',
    whenToUseAsDestination: 'Quando um produto localizado (ex: B148 ou B111) em perfeito estado deve ficar disponível para venda nos centros B123 ou B124.',
  },
  B114: {
    code: 'B114',
    category: 'estoque_livre',
    nature: 'Definitivo',
    colorScheme: 'green',
    classification: 'Estoque livre — Definitivo',
    shortTitle: 'Estoque Livre Lojas (Produto)',
    definition: 'Depósito definido para estoque disponível.',
    application: 'PRODUTO',
    allowedCentros: ['B158', 'B159'],
    channels: ['CD MG NACIONAL LOJAS MIDEA CARRIER', 'CD MG IMPORT. LOJAS MIDEA CARRIER'],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando um produto do estoque das Lojas Midea (B158/B159) não é localizado (vai p/ B111) ou sofre avaria (B136/B149/B137).',
    whenToUseAsDestination: 'Para disponibilizar PRODUTO acabado bom no estoque livre das Lojas Midea Carrier (centros B158 e B159).',
  },
  B130: {
    code: 'B130',
    category: 'estoque_livre',
    nature: 'Definitivo',
    colorScheme: 'green',
    classification: 'Estoque livre — Definitivo',
    shortTitle: 'Estoque Livre Lojas (Peças)',
    definition: 'Depósito definido para estoque disponível.',
    application: 'PEÇAS',
    allowedCentros: ['B158', 'B159'],
    channels: ['CD MG NACIONAL LOJAS MIDEA CARRIER', 'CD MG IMPORT. LOJAS MIDEA CARRIER'],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando uma PEÇA das Lojas Midea (B158/B159) vai para falta de inventário de peças (B152), venda Blue Service (B416) ou sucata (B136).',
    whenToUseAsDestination: 'Para disponibilizar PEÇAS boas no estoque livre das Lojas Midea Carrier (centros B158 e B159).',
  },
  B416: {
    code: 'B416',
    category: 'blue_service',
    nature: 'Definitivo',
    colorScheme: 'green',
    classification: 'Estoque Blue Service — Definitivo',
    shortTitle: 'Blue Service Garantia (Peças)',
    definition: 'Depósito para venda Blue Service (venda de Garantia pelo Centro de lojas).',
    application: 'PEÇAS',
    allowedCentros: ['B158', 'B159'],
    channels: ['CD MG NACIONAL LOJAS MIDEA CARRIER', 'CD MG IMPORT. LOJAS MIDEA CARRIER'],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando uma peça do estoque Blue Service precisa ir para falta de inventário (B152) ou retorno ao livre de peças (B130).',
    whenToUseAsDestination: 'Exclusivo para PEÇAS destinadas à venda Blue Service (atendimento de Garantia pelo Centro de Lojas B158 e B159).',
  },
  B412: {
    code: 'B412',
    category: 'estoque_livre',
    nature: 'Definitivo',
    colorScheme: 'green',
    classification: 'Estoque livre — Definitivo',
    shortTitle: 'Estoque Livre Pós-Venda (Peças)',
    definition: 'Depósito definido para estoque disponível.',
    application: 'PEÇAS',
    allowedCentros: ['B179', 'B180'],
    channels: ['CD MG NACIONAL PÓS VENDA', 'CD MG IMPORT PÓS VENDA'],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando uma PEÇA do Pós-Venda (B179/B180) não é localizada (vai para B152) ou sofre avaria (B136).',
    whenToUseAsDestination: 'Para disponibilizar PEÇAS boas no estoque livre do Pós-Venda (centros B179 e B180).',
  },
  B413: {
    code: 'B413',
    category: 'estoque_livre',
    nature: 'Definitivo',
    colorScheme: 'green',
    classification: 'Estoque livre — Definitivo',
    shortTitle: 'Estoque Livre Pós-Venda (Produto)',
    definition: 'Depósito definido para estoque disponível.',
    application: 'PRODUTO',
    allowedCentros: ['B179', 'B180'],
    channels: ['CD MG NACIONAL PÓS VENDA', 'CD MG IMPORT PÓS VENDA'],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando um PRODUTO do Pós-Venda (B179/B180) não é localizado (vai para B111) ou sofre avaria (B136/B149/B137).',
    whenToUseAsDestination: 'Para disponibilizar PRODUTO acabado bom no estoque livre do Pós-Venda (centros B179 e B180).',
  },

  // 2. FALTAS DE INVENTÁRIO (VERMELHO DEFINITIVO)
  B111: {
    code: 'B111',
    category: 'inventario_falta_definitivo',
    nature: 'Definitivo',
    colorScheme: 'red',
    classification: 'Falta de inventário de produto — Definitivo',
    shortTitle: 'Falta de Inventário (Produto)',
    definition: 'Depósito definido para faltas de inventário de produto acabado.',
    application: 'PRODUTO',
    allowedCentros: ['B123', 'B124', 'B158', 'B159', 'B179', 'B180'],
    channels: [
      'CD MG NACIONAL E-COMMERCE',
      'CD MG IMPORTADO E-COMMERCE',
      'CD MG NACIONAL LOJAS MIDEA CARRIER',
      'CD MG IMPORT. LOJAS MIDEA CARRIER',
      'CD MG NACIONAL PÓS VENDA',
      'CD MG IMPORT PÓS VENDA',
    ],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando um PRODUTO que estava em falta (B111) é fisicamente localizado no CD e precisa retornar ao estoque livre do centro.',
    whenToUseAsDestination: 'Quando um PRODUTO acabado não é localizado no estoque e deve ser transferido para falta de inventário.',
  },
  B152: {
    code: 'B152',
    category: 'inventario_falta_definitivo',
    nature: 'Definitivo',
    colorScheme: 'red',
    classification: 'Falta de inventário de peças — Definitivo',
    shortTitle: 'Falta de Inventário (Peças)',
    definition: 'Depósito definido para faltas de inventário de peças.',
    application: 'PEÇAS',
    allowedCentros: ['B158', 'B159', 'B179', 'B180'],
    channels: [
      'CD MG NACIONAL LOJAS MIDEA CARRIER',
      'CD MG IMPORT. LOJAS MIDEA CARRIER',
      'CD MG NACIONAL PÓS VENDA',
      'CD MG IMPORT PÓS VENDA',
    ],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Quando uma PEÇA que estava em falta (B152) é fisicamente localizada no CD e retorna para B130, B416 ou B412.',
    whenToUseAsDestination: 'Quando uma PEÇA não é localizada nos centros B158, B159, B179 ou B180 e deve ser transferida para falta de inventário.',
  },

  // 3. AVARIA DE PRODUTO — DEFINITIVO (VERMELHO CRÍTICO — SAÍDA BLOQUEADA PARA LIVRE)
  B136: {
    code: 'B136',
    category: 'avaria_definitivo',
    nature: 'Definitivo',
    colorScheme: 'red',
    classification: 'Avaria de produto — Definitivo',
    shortTitle: 'Sucata (Avaria Definitiva)',
    definition: 'Depósito definido para avarias de produto (sucata).',
    application: 'PEÇAS/PRODUTOS',
    allowedCentros: ['B123', 'B124', 'B158', 'B159', 'B179', 'B180'],
    channels: [
      'CD MG NACIONAL E-COMMERCE',
      'CD MG IMPORTADO E-COMMERCE',
      'CD MG NACIONAL LOJAS MIDEA CARRIER',
      'CD MG IMPORT. LOJAS MIDEA CARRIER',
      'CD MG NACIONAL PÓS VENDA',
      'CD MG IMPORT PÓS VENDA',
    ],
    canBeOriginToFreeStock: false,
    whenToUseAsOrigin: '🚫 PROIBIDO SAIR PARA ESTOQUE LIVRE! Material em B136 já sofreu avaria grave (sucata) e nunca deve retornar como produto bom.',
    whenToUseAsDestination: '✅ PERMITIDO: Quando uma peça ou produto sofre avaria irrecuperável e deve ser segregado para sucata (B136).',
  },
  B149: {
    code: 'B149',
    category: 'avaria_definitivo',
    nature: 'Definitivo',
    colorScheme: 'red',
    classification: 'Avaria de produto — Definitivo',
    shortTitle: 'Outlet (Embalagem Retrabalhada)',
    definition: 'Depósito definido para avaria de embalagem retrabalhadas. (outlet)',
    application: 'PRODUTO',
    allowedCentros: ['B123', 'B124', 'B158', 'B159', 'B179', 'B180'],
    channels: [
      'CD MG NACIONAL E-COMMERCE',
      'CD MG IMPORTADO E-COMMERCE',
      'CD MG NACIONAL LOJAS MIDEA CARRIER',
      'CD MG IMPORT. LOJAS MIDEA CARRIER',
      'CD MG NACIONAL PÓS VENDA',
      'CD MG IMPORT PÓS VENDA',
    ],
    canBeOriginToFreeStock: false,
    whenToUseAsOrigin: '🚫 PROIBIDO SAIR PARA ESTOQUE LIVRE! Produtos em B149 têm embalagem retrabalhada e venda direcionada (Outlet).',
    whenToUseAsDestination: '✅ PERMITIDO: Quando um produto teve avaria de embalagem retrabalhada e vai para o estoque Outlet (B149).',
  },
  B137: {
    code: 'B137',
    category: 'avaria_definitivo',
    nature: 'Definitivo',
    colorScheme: 'red',
    classification: 'Avaria de produto — Definitivo',
    shortTitle: 'Slow Movers (Venda Especial)',
    definition: 'Depósito definido para avaria de produtos disponíveis para venda especial. (Slow Movers)',
    application: 'PRODUTO',
    allowedCentros: ['B123', 'B124', 'B158', 'B159', 'B179', 'B180'],
    channels: [
      'CD MG NACIONAL E-COMMERCE',
      'CD MG IMPORTADO E-COMMERCE',
      'CD MG NACIONAL LOJAS MIDEA CARRIER',
      'CD MG IMPORT. LOJAS MIDEA CARRIER',
      'CD MG NACIONAL PÓS VENDA',
      'CD MG IMPORT PÓS VENDA',
    ],
    canBeOriginToFreeStock: false,
    whenToUseAsOrigin: '🚫 PROIBIDO SAIR PARA ESTOQUE LIVRE! Produtos em B137 possuem tratativa comercial específica para clientes especiais.',
    whenToUseAsDestination: '✅ PERMITIDO: Quando o produto avariado é destinado à venda especial Slow Movers (B137).',
  },

  // 4. DEPÓSITO OPERACIONAL DE RECEBIMENTO / TRIAGEM (USADO NA OPERAÇÃO)
  B148: {
    code: 'B148',
    category: 'operacional',
    nature: 'Transitório',
    colorScheme: 'yellow',
    classification: 'Depósito Operacional / Triagem',
    shortTitle: 'Triagem / Operacional',
    definition: 'Depósito operacional de triagem/qualidade antes da liberação para o estoque livre.',
    application: 'PEÇAS/PRODUTOS',
    allowedCentros: ['B123', 'B124', 'B158', 'B159', 'B179', 'B180'],
    channels: ['TODOS OS CANAIS CD MG'],
    canBeOriginToFreeStock: true,
    whenToUseAsOrigin: 'Transferência habitual de liberação de mercadoria de B148 para o depósito de Estoque Livre do respectivo centro.',
    whenToUseAsDestination: 'Quando o material precisa retornar ao depósito operacional B148 para conferência.',
  },
};

export interface DefinitiveDamageDepositInfo {
  code: 'B136' | 'B149' | 'B137';
  classification: string;
  shortTitle: string;
  definition: string;
  application: 'PEÇAS/PRODUTOS' | 'PRODUTO';
}

export const DEFINITIVE_DAMAGE_CENTROS = ['B123', 'B124', 'B158', 'B159', 'B179', 'B180'] as const;

export const DEFINITIVE_DAMAGE_DEPOSITS: Record<string, DefinitiveDamageDepositInfo> = {
  B136: {
    code: 'B136',
    classification: 'Avaria de produto — Definitivo',
    shortTitle: 'Sucata',
    definition: 'Depósito definido para avarias de produto (sucata).',
    application: 'PEÇAS/PRODUTOS',
  },
  B149: {
    code: 'B149',
    classification: 'Avaria de produto — Definitivo',
    shortTitle: 'Outlet (Embalagem Retrabalhada)',
    definition: 'Depósito definido para avaria de embalagem retrabalhadas. (outlet)',
    application: 'PRODUTO',
  },
  B137: {
    code: 'B137',
    classification: 'Avaria de produto — Definitivo',
    shortTitle: 'Slow Movers (Venda Especial)',
    definition: 'Depósito definido para avaria de produtos disponíveis para venda especial. (Slow Movers)',
    application: 'PRODUTO',
  },
};

/**
 * Verifica se a movimentação tem como ORIGEM um depósito de Avaria Definitiva (B136, B149 ou B137).
 * - Quando B136, B149 ou B137 é apenas o DESTINO, a solicitação é válida (OK).
 * - Quando B136, B149 ou B137 é a ORIGEM saindo para outro depósito (estoque livre), retorna os detalhes da flag.
 */
export function checkDefinitiveDamageOrigin(
  depositoOrigem?: string,
  depositoDestino?: string
): {
  isInvalidOrigin: boolean;
  isValidDestination: boolean;
  originInfo?: DefinitiveDamageDepositInfo;
  destinationInfo?: DefinitiveDamageDepositInfo;
} {
  const orig = (depositoOrigem || '').trim().toUpperCase();
  const dest = (depositoDestino || '').trim().toUpperCase();

  const originInfo = DEFINITIVE_DAMAGE_DEPOSITS[orig];
  const destinationInfo = DEFINITIVE_DAMAGE_DEPOSITS[dest];

  return {
    isInvalidOrigin: Boolean(originInfo && orig !== dest),
    isValidDestination: Boolean(!originInfo && destinationInfo),
    originInfo,
    destinationInfo,
  };
}

export interface RouteIntelligenceAnalysis {
  centroInfo?: SAPCentroInfo;
  originDeposit?: SAPDepositInfo;
  destinationDeposit?: SAPDepositInfo;
  isDefinitiveDamageOrigin: boolean;
  hasCenterMismatch: boolean;
  hasApplicationMismatch: boolean;
  warnings: string[];
  routeExplanation: string;
  recommendedFreeDeposit?: string;
}

/**
 * Analisa de forma inteligente toda a combinação Centro + Depósito Origem + Depósito Destino
 * com base nas 3 tabelas oficiais (Estoque Livre, Inventário/Faltas e Avarias Definitivas).
 */
export function analyzeTransferRoute(
  centro?: string,
  depositoOrigem?: string,
  depositoDestino?: string
): RouteIntelligenceAnalysis {
  const c = (centro || '').trim().toUpperCase();
  const orig = (depositoOrigem || '').trim().toUpperCase();
  const dest = (depositoDestino || '').trim().toUpperCase();

  const centroInfo = SAP_CENTROS_CATALOG[c];
  const originDeposit = SAP_DEPOSITOS_CATALOG[orig];
  const destinationDeposit = SAP_DEPOSITOS_CATALOG[dest];

  const warnings: string[] = [];
  let hasCenterMismatch = false;
  let hasApplicationMismatch = false;

  const isDefinitiveDamageOrigin = Boolean(DEFINITIVE_DAMAGE_DEPOSITS[orig] && orig !== dest);

  // 1. Checa se o Depósito de Origem pertence ao Centro informado
  if (c && originDeposit && !originDeposit.allowedCentros.includes(c)) {
    hasCenterMismatch = true;
    warnings.push(
      `O depósito de origem ${orig} (${originDeposit.shortTitle}) só é utilizado nos centros ${originDeposit.allowedCentros.join(', ')}, não no centro ${c}.`
    );
  }

  // 2. Checa se o Depósito de Destino pertence ao Centro informado
  if (c && destinationDeposit && !destinationDeposit.allowedCentros.includes(c)) {
    hasCenterMismatch = true;
    const suggestion = centroInfo
      ? `No centro ${c} (${centroInfo.channelName}), o Estoque Livre de Produto é ${centroInfo.freeStockProductDeposit}${
          centroInfo.freeStockPartsDeposit ? ` e de Peças é ${centroInfo.freeStockPartsDeposit}` : ''
        }.`
      : '';
    warnings.push(
      `O depósito de destino ${dest} (${destinationDeposit.shortTitle}) pertence aos centros ${destinationDeposit.allowedCentros.join(', ')} (atual: ${c}). ${suggestion}`
    );
  }

  // 3. Checa incompatibilidade entre PEÇAS vs PRODUTO
  if (
    originDeposit &&
    destinationDeposit &&
    originDeposit.application !== 'PEÇAS/PRODUTOS' &&
    destinationDeposit.application !== 'PEÇAS/PRODUTOS' &&
    originDeposit.application !== destinationDeposit.application
  ) {
    hasApplicationMismatch = true;
    warnings.push(
      `Atenção: Mistura de tipo de material! Origem ${orig} é exclusivo para ${originDeposit.application}, enquanto Destino ${dest} é exclusivo para ${destinationDeposit.application}.`
    );
  }

  // 3.5 Bloqueia uso manual dos depósitos B112 e B153 (desativados para solicitação do time)
  if (orig === 'B112' || dest === 'B112' || orig === 'B153' || dest === 'B153') {
    hasCenterMismatch = true;
    warnings.push(
      `Os depósitos B112 e B153 não devem ser solicitados pelo time. Para falta de inventário, utilize B111 (Produto) ou B152 (Peças).`
    );
  }

  // 4. Monta explicação didática da operação
  let routeExplanation = '';
  if (isDefinitiveDamageOrigin && originDeposit) {
    routeExplanation = `🚫 Solicitação Incorreta: Saída de ${orig} (${originDeposit.shortTitle} — Avaria Definitiva). Material avariado não deve voltar ao estoque livre.`;
  } else if (destinationDeposit?.category === 'avaria_definitivo') {
    routeExplanation = `✅ Segregação para Avaria Definitiva (${dest} — ${destinationDeposit.shortTitle}).`;
  } else if (destinationDeposit?.category === 'inventario_falta_definitivo') {
    routeExplanation = `🔴 Baixa p/ Falta de Inventário (${dest}): Falta de ${destinationDeposit.application.toLowerCase()} no estoque.`;
  } else if (
    originDeposit?.category === 'inventario_falta_definitivo' &&
    (destinationDeposit?.category === 'estoque_livre' || destinationDeposit?.category === 'blue_service')
  ) {
    routeExplanation = `🟢 Recuperação de Estoque: Item localizado fisicamente saindo de ${orig} (${originDeposit.shortTitle}) para ${dest} (${destinationDeposit.shortTitle}).`;
  } else if (destinationDeposit?.category === 'estoque_livre') {
    routeExplanation = `🟢 Liberação para Estoque Livre (${dest} — ${destinationDeposit.application} disponível para venda).`;
  } else if (destinationDeposit?.category === 'blue_service') {
    routeExplanation = `🔵 Liberação para Estoque Blue Service (${dest} — Venda de Garantia de Peças nas Lojas).`;
  }

  return {
    centroInfo,
    originDeposit,
    destinationDeposit,
    isDefinitiveDamageOrigin,
    hasCenterMismatch,
    hasApplicationMismatch,
    warnings,
    routeExplanation,
    recommendedFreeDeposit: centroInfo?.freeStockProductDeposit,
  };
}



/**
 * Converte linhas em texto delimitado por TAB para fácil colagem no SAP GUI / WebGUI
 */
export function formatForSAPTable(items: TransferItem[]): string {
  // Cabeçalho compatível com colunas SAP
  const header = ['Material', 'Serial', 'Centro', 'Dep. Origem', 'Dep. Destino'].join('\t');
  
  const rows = items.map((item) =>
    [
      item.material,
      item.serial,
      item.centro,
      item.depositoOrigem,
      item.depositoDestino,
    ].join('\t')
  );

  return [header, ...rows].join('\n');
}

/**
 * Converte lista de seriais em formato puro (1 por linha)
 * muito comum na tela de atribuição de números de série do SAP (MIGO / IQ01 / MB1B)
 */
export function formatSerialsForSAP(items: TransferItem[]): string {
  return items.map((i) => i.serial).filter(Boolean).join('\n');
}

/**
 * Gera arquivo CSV com BOM UTF-8 para abrir perfeitamente no Excel brasileiro
 */
export function exportToCSV(items: TransferItem[], filename = 'movimentacoes_sap_midea.csv') {
  const headers = [
    'Código Solicitação',
    'Material',
    'Serial',
    'Centro',
    'Depósito Origem',
    'Depósito Destino',
    'Status',
    'Data/Hora Solicitação',
    'Solicitante',
    'Doc SAP (Material Document)',
    'Observações / Apontamentos',
    'SLA Status',
  ];

  const escapeCSV = (val: string | number | undefined) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const statusLabelMap: Record<string, string> = {
    pendente: 'Pendente',
    em_analise: 'Em Análise no SAP',
    concluido: 'Concluído no SAP',
    divergencia: 'Divergência / Erro',
  };

  const rows = items.map((item) => [
    escapeCSV(item.solicitationCode),
    escapeCSV(item.material),
    escapeCSV(item.serial),
    escapeCSV(item.centro),
    escapeCSV(item.depositoOrigem),
    escapeCSV(item.depositoDestino),
    escapeCSV(statusLabelMap[item.status] || item.status),
    escapeCSV(new Date(item.criadoEm).toLocaleString('pt-BR')),
    escapeCSV(item.criadoPor),
    escapeCSV(item.sapDocNumber || '-'),
    escapeCSV(item.observacoes || ''),
    escapeCSV(item.slaStatus === 'no_prazo' ? 'No Prazo' : item.slaStatus === 'atencao' ? 'Atenção' : 'Estourado'),
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parser inteligente de dados colados do Excel, Bloco de notas, WhatsApp ou Sênior WMS
 * Suporta formatos:
 * Material \t Serial \t Centro \t DepOrigem \t DepDestino
 * ou delimitado por vírgula / ponto-e-vírgula
 */
export function parsePastedTable(rawText: string): Array<{
  material: string;
  serial: string;
  centro: string;
  depositoOrigem: string;
  depositoDestino: string;
}> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: Array<{
    material: string;
    serial: string;
    centro: string;
    depositoOrigem: string;
    depositoDestino: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Se for cabeçalho detectado, ignora
    const lower = line.toLowerCase();
    if (
      (lower.includes('material') && lower.includes('serial')) ||
      (lower.includes('centro') && lower.includes('deposito'))
    ) {
      continue;
    }

    // Tenta separar por TAB, depois por ';' e depois por vírgula
    let parts: string[] = [];
    if (line.includes('\t')) {
      parts = line.split('\t');
    } else if (line.includes(';')) {
      parts = line.split(';');
    } else if (line.includes(',')) {
      parts = line.split(',');
    } else {
      // Espaço duplo ou múltiplos espaços
      parts = line.split(/\s{2,}/);
    }

    parts = parts.map((p) => p.trim());

    if (parts.length >= 5) {
      results.push({
        material: parts[0],
        serial: parts[1],
        centro: parts[2],
        depositoOrigem: parts[3],
        depositoDestino: parts[4],
      });
    } else if (parts.length >= 2) {
      // Fallback parcial
      results.push({
        material: parts[0] || '',
        serial: parts[1] || '',
        centro: parts[2] || '',
        depositoOrigem: parts[3] || '',
        depositoDestino: parts[4] || '',
      });
    }
  }

  return results;
}

/**
 * Separa seriais de um campo de texto livre (quebras de linha, vírgulas, espaços, ponto-e-vírgula)
 */
export function extractSerialsFromInput(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[\r\n,; \t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Calcula o tempo transcorrido em minutos e retorna classificação de SLA
 * SLA meta: 120 minutos (2 horas)
 */
export function calculateSLA(criadoEmIso: string, status: string): {
  minutos: number;
  slaStatus: 'no_prazo' | 'atencao' | 'estourado';
  rotuloFormatado: string;
} {
  const diffMs = Date.now() - new Date(criadoEmIso).getTime();
  const minutos = Math.max(0, Math.floor(diffMs / 60000));

  let slaStatus: 'no_prazo' | 'atencao' | 'estourado' = 'no_prazo';
  if (minutos > 180) {
    slaStatus = 'estourado';
  } else if (minutos > 90) {
    slaStatus = 'atencao';
  }

  // Se concluído, pode considerar congelado
  const horas = Math.floor(minutos / 60);
  const minsRestantes = minutos % 60;
  const rotuloFormatado = horas > 0 ? `${horas}h ${minsRestantes}m` : `${minutos} min`;

  return { minutos, slaStatus, rotuloFormatado };
}
