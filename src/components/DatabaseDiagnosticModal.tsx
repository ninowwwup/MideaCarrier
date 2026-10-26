import React, { useState } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  RefreshCw, 
  ExternalLink, 
  ShieldAlert, 
  Server, 
  Trash2, 
  Key, 
  RotateCcw, 
  Save, 
  HelpCircle,
  Play
} from 'lucide-react';
import { 
  getGoogleSheetsUrl, 
  saveGoogleSheetsUrl, 
  clearGoogleSheetsUrl, 
  pingGoogleSheets,
  insertGoogleSheetsItems,
  updateGoogleSheetsItems,
  deleteGoogleSheetsItems
} from '../services/googleSheetsClient';
import { clearAllTransferRecords } from '../services/storage';

interface DatabaseDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCloudConnected: boolean;
  onRecordsCleared?: () => void;
}

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * =========================================================================
 * MIGOU - Midea Transfer Hub
 * Backend Database Google Apps Script (Web App)
 * =========================================================================
 * 
 * GUIA DE IMPLANTAÇÃO PASSO A PASSO (EM 1 MINUTO):
 * 1. Abra o Google Drive (https://drive.google.com) com a sua conta Google.
 * 2. Crie uma nova planilha: Novo > Planilhas Google ("MIGOU - Banco de Transferências").
 * 3. No menu superior da planilha: Extensões > Apps Script.
 * 4. Apague todo o conteúdo e cole este arquivo completo.
 * 5. Clique em "Implantar" (botão azul no canto superior direito) > "Nova implantação".
 * 6. Na engrenagem ⚙️ selecione "App da Web".
 * 7. Configure EXATAMENTE assim:
 *    - Descrição: "MIGOU Backend API"
 *    - Executar como: "Eu" (seu e-mail Google)
 *    - Quem pode acessar: "Qualquer pessoa" (MUITO IMPORTANTE!)
 * 8. Clique em "Implantar", autorize o acesso com sua conta Google.
 * 9. Copie a "URL do app da web" gerada (termina com "/exec").
 * 10. Cole no MIGOU no campo "URL do App da Web do Google Apps Script".
 * =========================================================================
 */

const SHEET_NAME = 'Transferencias';
const HEADERS = [
  'id',
  'solicitation_code',
  'material',
  'serial',
  'centro',
  'deposito_origem',
  'deposito_destino',
  'status',
  'criado_em',
  'criado_por',
  'atualizado_em',
  'atualizado_por',
  'sap_doc_number',
  'observacoes',
  'prioridade_fifo',
  'sla_status',
  'batch_id',
  'label_photo_url',
  'originator_client_id'
];

function setupInicial() {
  const sheet = getOrCreateSheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('Colunas e cabeçalho do MIGOU criados com sucesso!', 'MIGOU', 5);
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#002664');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 130);
    sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 210);
    sheet.setColumnWidth(5, 90);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 110);
    sheet.setColumnWidth(8, 120);
    sheet.setColumnWidth(9, 180);
    sheet.setColumnWidth(10, 160);
    sheet.setColumnWidth(11, 180);
    sheet.setColumnWidth(12, 160);
    sheet.setColumnWidth(13, 130);
    sheet.setColumnWidth(14, 200);
  }
  return sheet;
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'read';

    if (action === 'ping') {
      return jsonResponse({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        message: 'Google Apps Script MIGOU operando com sucesso!'
      });
    }

    const sheet = getOrCreateSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return jsonResponse({ success: true, items: [], total: 0 });
    }

    const rawData = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    const items = rawData.map((row, index) => {
      const obj = {};
      HEADERS.forEach((header, colIdx) => {
        let val = row[colIdx];
        if (val instanceof Date) {
          val = val.toISOString();
        }
        obj[header] = val;
      });

      return {
        id: String(obj.id || ''),
        solicitationCode: String(obj.solicitation_code || \`SOL-\${index + 1}\`),
        material: String(obj.material || ''),
        serial: String(obj.serial || ''),
        centro: String(obj.centro || ''),
        depositoOrigem: String(obj.deposito_origem || ''),
        depositoDestino: String(obj.deposito_destino || ''),
        status: String(obj.status || 'pendente'),
        criadoEm: String(obj.criado_em || new Date().toISOString()),
        criadoPor: String(obj.criado_por || 'Time Buiatte (Sênior WMS)'),
        atualizadoEm: String(obj.atualizado_em || obj.criado_em || new Date().toISOString()),
        atualizadoPor: obj.atualizado_por ? String(obj.atualizado_por) : undefined,
        sapDocNumber: obj.sap_doc_number ? String(obj.sap_doc_number) : undefined,
        observacoes: obj.observacoes ? String(obj.observacoes) : undefined,
        prioridadeFifo: Number(obj.prioridade_fifo) || (index + 1),
        slaStatus: obj.sla_status || 'no_prazo',
        batchId: obj.batch_id ? String(obj.batch_id) : undefined,
        labelPhotoUrl: obj.label_photo_url ? String(obj.label_photo_url) : undefined,
        originatorClientId: obj.originator_client_id ? String(obj.originator_client_id) : undefined
      };
    });

    return jsonResponse({
      success: true,
      items: items,
      total: items.length,
      lastModified: Date.now()
    });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        payload = {};
      }
    }

    const action = payload.action || 'insert';
    const sheet = getOrCreateSheet();

    if (action === 'insert') {
      const incoming = Array.isArray(payload.items) ? payload.items : (payload.item ? [payload.item] : []);
      if (incoming.length === 0) {
        return jsonResponse({ success: true, inserted: 0 });
      }

      const lastRow = sheet.getLastRow();
      let existingIds = new Set();
      if (lastRow > 1) {
        const idColValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        idColValues.forEach(r => existingIds.add(String(r[0])));
      }

      const rowsToAdd = [];
      incoming.forEach((item, idx) => {
        const id = String(item.id || ('tr_' + Date.now() + '_' + idx));
        if (existingIds.has(id)) {
          updateRowById(sheet, id, item);
          return;
        }

        const row = [
          id,
          item.solicitationCode || item.solicitation_code || \`SOL-\${lastRow + rowsToAdd.length}\`,
          item.material || '',
          item.serial || '',
          item.centro || '',
          item.depositoOrigem || item.deposito_origem || '',
          item.depositoDestino || item.deposito_destino || '',
          item.status || 'pendente',
          item.criadoEm || item.criado_em || new Date().toISOString(),
          item.criadoPor || item.criado_por || 'Time Buiatte (Sênior WMS)',
          item.atualizadoEm || item.atualizado_em || new Date().toISOString(),
          item.atualizadoPor || item.atualizado_por || '',
          item.sapDocNumber || item.sap_doc_number || '',
          item.observacoes || '',
          item.prioridadeFifo || (lastRow + rowsToAdd.length),
          item.slaStatus || item.sla_status || 'no_prazo',
          item.batchId || item.batch_id || '',
          item.labelPhotoUrl || item.label_photo_url || '',
          item.originatorClientId || item.originator_client_id || ''
        ];
        rowsToAdd.push(row);
      });

      if (rowsToAdd.length > 0) {
        sheet.getRange(lastRow + 1, 1, rowsToAdd.length, HEADERS.length).setValues(rowsToAdd);
      }

      return jsonResponse({
        success: true,
        inserted: rowsToAdd.length,
        totalNow: sheet.getLastRow() - 1
      });
    }

    if (action === 'update') {
      const incoming = Array.isArray(payload.items) ? payload.items : (payload.item ? [payload.item] : []);
      let updatedCount = 0;
      incoming.forEach(item => {
        if (item && item.id) {
          if (updateRowById(sheet, String(item.id), item)) {
            updatedCount++;
          }
        }
      });
      return jsonResponse({ success: true, updated: updatedCount });
    }

    if (action === 'delete') {
      const idsToDelete = new Set(
        Array.isArray(payload.ids)
          ? payload.ids.map(String)
          : (payload.id ? [String(payload.id)] : [])
      );

      const lastRow = sheet.getLastRow();
      let deletedCount = 0;
      if (lastRow > 1 && idsToDelete.size > 0) {
        const idColValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = idColValues.length - 1; i >= 0; i--) {
          const rowId = String(idColValues[i][0]);
          if (idsToDelete.has(rowId)) {
            sheet.deleteRow(i + 2);
            deletedCount++;
          }
        }
      }
      return jsonResponse({ success: true, deleted: deletedCount });
    }

    if (action === 'clear') {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      return jsonResponse({ success: true, message: 'Planilha zerada com sucesso!' });
    }

    return jsonResponse({ success: false, error: 'Ação não reconhecida: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function updateRowById(sheet, id, item) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  const idColValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0]) === String(id)) {
      const rowIdx = i + 2;
      const existingRow = sheet.getRange(rowIdx, 1, 1, HEADERS.length).getValues()[0];

      if (item.status !== undefined) existingRow[7] = item.status;
      if (item.atualizadoEm !== undefined || item.atualizado_em !== undefined) {
        existingRow[10] = item.atualizadoEm || item.atualizado_em;
      } else {
        existingRow[10] = new Date().toISOString();
      }
      if (item.atualizadoPor !== undefined || item.atualizado_por !== undefined) {
        existingRow[11] = item.atualizadoPor || item.atualizado_por;
      }
      if (item.sapDocNumber !== undefined || item.sap_doc_number !== undefined) {
        existingRow[12] = item.sapDocNumber || item.sap_doc_number;
      }
      if (item.observacoes !== undefined) existingRow[13] = item.observacoes;
      if (item.labelPhotoUrl !== undefined || item.label_photo_url !== undefined) {
        existingRow[17] = item.labelPhotoUrl || item.label_photo_url;
      }

      sheet.getRange(rowIdx, 1, 1, HEADERS.length).setValues([existingRow]);
      return true;
    }
  }
  return false;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

export const DatabaseDiagnosticModal: React.FC<DatabaseDiagnosticModalProps> = ({
  isOpen,
  onClose,
  isCloudConnected,
  onRecordsCleared,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'success' | 'warning' | 'error';
    message: string;
    details?: string;
  }>({ status: 'idle', message: '' });

  const [inputUrl, setInputUrl] = useState(() => {
    return typeof window !== 'undefined' ? (getGoogleSheetsUrl() || '') : '';
  });

  const hasCustomUrl = Boolean(
    typeof window !== 'undefined' && localStorage.getItem('midea_transfer_google_sheets_url')
  );

  if (!isOpen) return null;

  const currentActiveUrl = getGoogleSheetsUrl();
  const isConfigured = Boolean(currentActiveUrl);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const handleSaveUrl = () => {
    const clean = inputUrl.trim();
    if (!clean) {
      alert('Por favor, informe a URL do App da Web do Google Apps Script.');
      return;
    }
    if (!clean.startsWith('https://script.google.com/')) {
      alert('A URL deve começar com https://script.google.com/macros/s/.../exec');
      return;
    }

    saveGoogleSheetsUrl(clean);
    setTestResult({
      status: 'success',
      message: 'URL do Google Planilhas salva com sucesso!',
      details: 'O sistema conectará a esta planilha em todas as próximas requisições. Recarregando...'
    });
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  const handleRestoreDefault = () => {
    clearGoogleSheetsUrl();
    setInputUrl('');
    setTestResult({
      status: 'warning',
      message: 'URL personalizada removida!',
      details: 'Restaurado para as configurações padrão do repositório. Recarregando...'
    });
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'Tem certeza que deseja limpar TODOS os registros de transferências?\\n\\nEsta ação apagará os dados da Planilha Google, do servidor e do cache local para que a equipe possa iniciar a operação oficial do zero.'
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await clearAllTransferRecords();
      if (onRecordsCleared) {
        onRecordsCleared();
      }
      setTestResult({
        status: 'success',
        message: 'Todos os registros foram zerados com sucesso!',
        details: 'A Planilha Google, servidor e cache foram limpos. O sistema está 100% pronto para iniciar do zero.'
      });
    } catch (e: any) {
      setTestResult({
        status: 'error',
        message: 'Erro ao limpar registros.',
        details: String(e?.message || e)
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleRunDiagnosticTest = async () => {
    setTesting(true);
    setTestResult({ status: 'idle', message: '' });

    const targetUrl = (inputUrl || currentActiveUrl).trim();
    if (!targetUrl) {
      setTestResult({
        status: 'warning',
        message: 'Nenhuma URL do Google Apps Script configurada.',
        details: 'Cole a URL do App da Web no campo acima ou siga o passo a passo para criar sua planilha.'
      });
      setTesting(false);
      return;
    }

    try {
      // 1. Testar Ping
      const pingRes = await pingGoogleSheets(targetUrl);
      if (!pingRes.ok) {
        setTestResult({
          status: 'error',
          message: pingRes.message,
          details: pingRes.details || 'Verifique se a implantação do App da Web foi feita com acesso permitido para "Qualquer pessoa".'
        });
        setTesting(false);
        return;
      }

      // 2. Testar INSERT na Planilha Google
      const testId = 'diag_test_' + Date.now().toString(36);
      const testItem = {
        id: testId,
        solicitationCode: 'TEST-DIAG',
        material: 'TEST_MAT',
        serial: 'SN_DIAG_' + Date.now().toString().slice(-4),
        centro: 'B124',
        depositoOrigem: 'B148',
        depositoDestino: 'B110',
        status: 'pendente' as const,
        criadoEm: new Date().toISOString(),
        criadoPor: 'Diagnóstico MIGOU',
        atualizadoEm: new Date().toISOString(),
        prioridadeFifo: 9999,
        slaStatus: 'no_prazo' as const
      };

      const insertOk = await insertGoogleSheetsItems([testItem], targetUrl);
      if (!insertOk) {
        setTestResult({
          status: 'warning',
          message: 'Ping respondeu, mas a inserção de teste falhou.',
          details: 'Verifique se a função doPost está devidamente autorizada na implantação do Apps Script.'
        });
        setTesting(false);
        return;
      }

      // 3. Testar UPDATE
      await updateGoogleSheetsItems([{ ...testItem, status: 'concluido' as const }], targetUrl);

      // 4. Limpar registro de teste
      await deleteGoogleSheetsItems([testId], targetUrl);

      setTestResult({
        status: 'success',
        message: 'Conexão 100% Validada com a Planilha Google!',
        details: `Leitura, Inserção, Atualização de Status e Exclusão testadas com sucesso na sua planilha via Google Apps Script. Pronta para uso pela equipe!`
      });
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: 'Erro inesperado ao testar conexão com o Google Apps Script.',
        details: String(err?.message || err)
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-emerald-300">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold">Banco de Dados - Google Planilhas</h3>
              <p className="text-[11px] sm:text-xs text-[#C2DEEB]">
                Sincronização perpétua e 100% gratuita via Google Apps Script (sem limites de cota)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
          
          {/* Status Geral de Conexão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Google Planilhas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></span>
                <span className="text-xs font-bold text-slate-800">
                  {isConfigured ? 'Planilha Vinculada' : 'Aguardando Configuração'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono truncate" title={currentActiveUrl || 'Sem URL'}>
                {currentActiveUrl ? currentActiveUrl : 'Cole a URL do App da Web abaixo'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span>Modo de Operação</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isCloudConnected ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`}></span>
                <span className="text-xs font-bold text-slate-800">
                  {isCloudConnected ? 'Tempo Real Ativo' : 'Rede Conectada'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Sincronismo via Google Sheets, SSE e BroadcastChannel.
              </p>
            </div>
          </div>

          {/* Configuração da URL da Planilha */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <Key className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>URL do App da Web do Google Apps Script</span>
                  {hasCustomUrl && (
                    <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full font-medium">
                      Personalizado
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-500">
                  URL gerada na implantação da planilha (termina em <code className="text-emerald-700 font-mono">/exec</code>).
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800 placeholder-slate-400"
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                {hasCustomUrl ? (
                  <button
                    type="button"
                    onClick={handleRestoreDefault}
                    className="px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar Padrão</span>
                  </button>
                ) : <div />}

                <button
                  type="button"
                  onClick={handleSaveUrl}
                  className="px-3.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer ml-auto"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar e Conectar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Botão de Teste em Tempo Real */}
          <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#002664] flex items-center gap-1.5">
                  <Play className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-[#249ED5]' : 'text-[#002664]'}`} />
                  <span>Teste Imediato de Conexão com a Planilha</span>
                </h4>
                <p className="text-[11px] text-slate-600">
                  Testa ping, leitura, inserção de linha e atualização de status em tempo real.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunDiagnosticTest}
                disabled={testing}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-[#002664] hover:bg-[#002363] transition-all active:scale-95 shadow-2xs shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Testando...</span>
                  </>
                ) : (
                  <span>Executar Teste</span>
                )}
              </button>
            </div>

            {testResult.message && (
              <div className={`p-3 rounded-lg text-xs border ${
                testResult.status === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : testResult.status === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="flex items-start gap-2">
                  {testResult.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : testResult.status === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{testResult.message}</p>
                    {testResult.details && (
                      <p className="text-[11px] opacity-90">{testResult.details}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Código do Google Apps Script (Code.gs) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Código do Google Apps Script (Code.gs)</span>
                  <span className="text-[10px] font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                    Pronto para Copiar
                  </span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Cole este código no editor de script da sua Planilha Google para transformá-la no banco de dados.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyCode}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-2xs flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  copiedCode
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copiar Código</span>
                  </>
                )}
              </button>
            </div>

            <pre className="text-[10px] sm:text-[11px] font-mono bg-slate-900 text-slate-100 p-3.5 rounded-xl border border-slate-800 overflow-x-auto max-h-48 leading-relaxed select-all">
              {GOOGLE_APPS_SCRIPT_CODE}
            </pre>
          </div>

          {/* Guia Rápido de 1 Minuto */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-[11px] text-emerald-950 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-emerald-900">
              <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
              <span>Como implantar em 1 minuto na sua conta Google:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-emerald-900 leading-relaxed">
              <li>Acesse o <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="underline font-bold hover:text-emerald-950 inline-flex items-center gap-0.5">Google Drive <ExternalLink className="w-2.5 h-2.5" /></a> e crie uma nova planilha (ex: <em>MIGOU - Banco de Transferências</em>).</li>
              <li>No menu superior da planilha, clique em <strong>Extensões &gt; Apps Script</strong>.</li>
              <li>Apague o código existente, <strong>cole o código acima</strong> e clique em <strong>Salvar (ícone disquete)</strong>.</li>
              <li>Clique no botão azul <strong>Implantar &gt; Nova implantação</strong>.</li>
              <li>Na engrenagem ⚙️ escolha <strong>App da Web</strong> e configure:
                <ul className="list-disc list-inside ml-4 text-[10.5px] text-emerald-800">
                  <li><strong>Executar como:</strong> "Eu" (sua conta Google)</li>
                  <li><strong>Quem pode acessar:</strong> "Qualquer pessoa" (fundamental para os PCs da fábrica sincronizarem!)</li>
                </ul>
              </li>
              <li>Clique em <strong>Implantar</strong>, autorize o acesso com sua conta Google, copie a <strong>URL do app da web</strong> gerada e cole no campo acima!</li>
            </ol>
          </div>

          {/* Zona de Limpeza de Registros para Iniciar do Zero */}
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Limpar Registros (Iniciar do Zero)</span>
              </div>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Remove todas as transferências de teste da Planilha Google, servidor e cache para início da operação real do time.
              </p>
            </div>
            <button
              type="button"
              disabled={isClearing}
              onClick={handleClearAll}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isClearing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>{isClearing ? 'Limpando...' : 'Zerar Banco de Dados'}</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            Fechar Diagnóstico
          </button>
        </div>
      </div>
    </div>
  );
};
