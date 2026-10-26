/**
 * =========================================================================
 * MIGOU - Midea Transfer Hub
 * Backend Database Google Apps Script (Web App)
 * =========================================================================
 * 
 * GUIA DE IMPLANTAÇÃO PASSO A PASSO (EM 1 MINUTO):
 * 
 * 1. Abra o Google Drive (https://drive.google.com) com a sua conta Google.
 * 2. Crie uma nova planilha clicando em: Novo > Planilhas Google.
 *    Nomeie a planilha como: "MIGOU - Banco de Transferências".
 * 3. No menu superior da planilha, clique em: Extensões > Apps Script.
 * 4. Apague todo o conteúdo que estiver no editor e cole este arquivo completo.
 * 5. Clique no botão azul "Implantar" (canto superior direito) > "Nova implantação".
 * 6. Na janela que abrir, clique na engrenagem ⚙️ (ao lado de 'Selecione o tipo')
 *    e escolha "App da Web".
 * 7. Configure EXATAMENTE assim:
 *    - Descrição: "MIGOU Backend API"
 *    - Executar como: "Eu" (seu e-mail Google)
 *    - Quem pode acessar: "Qualquer pessoa" (MUITO IMPORTANTE!)
 * 8. Clique em "Implantar". O Google pedirá para autorizar o acesso.
 *    Clique em "Avançado" > "Acessar MIGOU Backend API (não seguro)" e confirme.
 * 9. Copie a "URL do app da web" gerada (termina com "/exec").
 * 10. Cole essa URL no MIGOU (no Modal de Diagnóstico ou na variável VITE_GOOGLE_SHEETS_URL).
 * 
 * Pronto! Todos os computadores da fábrica, WMS e escritório passarão a
 * registrar e sincronizar dados diretamente nessa planilha, sem limites de cota!
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

/**
 * Execute esta função no editor do Apps Script para criar a aba 'Transferencias' e todas as 19 colunas imediatamente!
 */
function setupInicial() {
  const sheet = getOrCreateSheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('Colunas e cabeçalho do MIGOU criados com sucesso!', 'MIGOU', 5);
}

/**
 * Obtém ou inicializa a aba de transferências formatada
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    
    // Formatação profissional com as cores da Midea
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#002664');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    // Ajustar larguras básicas das colunas
    sheet.setColumnWidth(1, 160); // id
    sheet.setColumnWidth(2, 130); // solicitation_code
    sheet.setColumnWidth(3, 130); // material
    sheet.setColumnWidth(4, 210); // serial
    sheet.setColumnWidth(5, 90);  // centro
    sheet.setColumnWidth(6, 110); // deposito_origem
    sheet.setColumnWidth(7, 110); // deposito_destino
    sheet.setColumnWidth(8, 120); // status
    sheet.setColumnWidth(9, 180); // criado_em
    sheet.setColumnWidth(10, 160); // criado_por
    sheet.setColumnWidth(11, 180); // atualizado_em
    sheet.setColumnWidth(12, 160); // atualizado_por
    sheet.setColumnWidth(13, 130); // sap_doc_number
    sheet.setColumnWidth(14, 200); // observacoes
  }
  return sheet;
}

/**
 * Endpoint GET: Consultar transferências ou testar conectividade (Ping)
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'read';

    // Healthcheck / Ping rápido
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
        solicitationCode: String(obj.solicitation_code || `SOL-${index + 1}`),
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

/**
 * Endpoint POST: Gravar, Atualizar, Deletar ou Limpar registros
 */
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

    // 1. Inserção de novos itens
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
          item.solicitationCode || item.solicitation_code || `SOL-${lastRow + rowsToAdd.length}`,
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

    // 2. Atualização de status e campos específicos
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

    // 3. Exclusão de itens específicos por ID
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

    // 4. Limpeza completa (Zerar banco)
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

/**
 * Atualiza campos de uma linha específica buscando pelo ID
 */
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

/**
 * Gera saída JSON adequada para App da Web
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
