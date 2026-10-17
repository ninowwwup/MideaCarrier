import { TransferItem } from '../types/transfer';

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
