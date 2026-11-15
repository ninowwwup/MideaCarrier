import { TransferItem } from '../types/transfer';

export type MigoTextMode = 'vazio' | 'contagem' | 'custom';
export type MigoPostMode = 'registrar' | 'verificar';

export interface MigoEngineOptions {
  textMode: MigoTextMode;
  customText?: string;
  splitByCentro: boolean;
  postMode: MigoPostMode;
}

export interface MigoGroupedLine {
  lineNumber: number;
  groupKey: string;
  material: string;
  centro: string;
  depositoOrigem: string;
  depositoDestino: string;
  quantidade: number;
  texto: string;
  serials: string[];
  itemIds: string[];
  solicitationCodes: string[];
}

export interface MigoCentroDocumentBatch {
  batchIndex: number;
  centro: string;
  totalLines: number;
  totalSerials: number;
  lines: MigoGroupedLine[];
  itemIds: string[];
}

export interface SapBridgeStatusResponse {
  bridgeOnline: boolean;
  sapRunning: boolean;
  sapLogged: boolean;
  sapUser?: string;
  sapSystem?: string;
  sapClient?: string;
  sapTransaction?: string;
  message?: string;
}

export interface SapBatchExecutionResult {
  centro: string;
  status: 'success' | 'verified' | 'error';
  docSap?: string;
  message: string;
  itemIds: string[];
  serialCount: number;
}

export const SAP_LOCAL_BRIDGE_URL = 'http://127.0.0.1:18311';

/**
 * Resolve o valor da coluna "Texto" (GOITEM-SGTXT) na MIGO 311
 */
export function resolveMigoItemText(options: MigoEngineOptions): string {
  if (options.textMode === 'vazio') return '';
  if (options.textMode === 'contagem') return 'Contagem';
  return (options.customText || 'Contagem').trim().slice(0, 50);
}

/**
 * Consolida solicitações individuais em Linhas Agrupadas para a Grade da MIGO 311
 * Chave de agrupamento da linha SAP: Centro + Material + Depósito Origem + Depósito Destino
 */
export function consolidateItemsForMigo311(
  items: TransferItem[],
  options: MigoEngineOptions
): {
  allGroupedLines: MigoGroupedLine[];
  batches: MigoCentroDocumentBatch[];
  totalInputItems: number;
  totalUniqueSerials: number;
  compressionRatioPct: number;
} {
  const textoValue = resolveMigoItemText(options);

  const sorted = [...items].sort((a, b) => {
    const keyA = `${a.centro.trim().toUpperCase()}|${a.material.trim().toUpperCase()}|${a.depositoOrigem.trim().toUpperCase()}|${a.depositoDestino.trim().toUpperCase()}`;
    const keyB = `${b.centro.trim().toUpperCase()}|${b.material.trim().toUpperCase()}|${b.depositoOrigem.trim().toUpperCase()}|${b.depositoDestino.trim().toUpperCase()}`;
    const cmp = keyA.localeCompare(keyB, 'pt-BR', { numeric: true });
    if (cmp !== 0) return cmp;
    return String(a.solicitationCode).localeCompare(String(b.solicitationCode), 'pt-BR', {
      numeric: true,
    });
  });

  const groupMap = new Map<
    string,
    {
      material: string;
      centro: string;
      depositoOrigem: string;
      depositoDestino: string;
      serialSet: Set<string>;
      itemIds: string[];
      solicitationCodes: string[];
    }
  >();

  for (const item of sorted) {
    const material = item.material.trim().toUpperCase();
    const centro = item.centro.trim().toUpperCase();
    const depositoOrigem = item.depositoOrigem.trim().toUpperCase();
    const depositoDestino = item.depositoDestino.trim().toUpperCase();
    const serial = item.serial.trim().toUpperCase();

    if (!material || !centro || !depositoOrigem || !depositoDestino || !serial) {
      continue;
    }

    const groupKey = `${centro}|${material}|${depositoOrigem}|${depositoDestino}`;
    let entry = groupMap.get(groupKey);
    if (!entry) {
      entry = {
        material,
        centro,
        depositoOrigem,
        depositoDestino,
        serialSet: new Set<string>(),
        itemIds: [],
        solicitationCodes: [],
      };
      groupMap.set(groupKey, entry);
    }

    entry.serialSet.add(serial);
    entry.itemIds.push(item.id);
    entry.solicitationCodes.push(item.solicitationCode);
  }

  const allGroupedLines: MigoGroupedLine[] = [];
  let globalLineIdx = 1;
  let totalUniqueSerials = 0;

  for (const [groupKey, entry] of groupMap.entries()) {
    const serials = Array.from(entry.serialSet);
    totalUniqueSerials += serials.length;
    allGroupedLines.push({
      lineNumber: globalLineIdx++,
      groupKey,
      material: entry.material,
      centro: entry.centro,
      depositoOrigem: entry.depositoOrigem,
      depositoDestino: entry.depositoDestino,
      quantidade: serials.length,
      texto: textoValue,
      serials,
      itemIds: entry.itemIds,
      solicitationCodes: entry.solicitationCodes,
    });
  }

  const batches: MigoCentroDocumentBatch[] = [];
  if (options.splitByCentro) {
    const byCentro = new Map<string, MigoGroupedLine[]>();
    for (const line of allGroupedLines) {
      const list = byCentro.get(line.centro) || [];
      list.push(line);
      byCentro.set(line.centro, list);
    }

    let batchIdx = 1;
    for (const [centro, centroLines] of byCentro.entries()) {
      const reindexedLines = centroLines.map((l, idx) => ({
        ...l,
        lineNumber: idx + 1,
      }));
      const batchItemIds = reindexedLines.flatMap((l) => l.itemIds);
      const batchSerials = reindexedLines.reduce((acc, l) => acc + l.quantidade, 0);

      batches.push({
        batchIndex: batchIdx++,
        centro,
        totalLines: reindexedLines.length,
        totalSerials: batchSerials,
        lines: reindexedLines,
        itemIds: batchItemIds,
      });
    }
  } else if (allGroupedLines.length > 0) {
    const centrosLabel = Array.from(new Set(allGroupedLines.map((l) => l.centro))).join('+');
    batches.push({
      batchIndex: 1,
      centro: centrosLabel || 'GERAL',
      totalLines: allGroupedLines.length,
      totalSerials: totalUniqueSerials,
      lines: allGroupedLines,
      itemIds: allGroupedLines.flatMap((l) => l.itemIds),
    });
  }

  const compressionRatioPct =
    totalUniqueSerials > 0
      ? Math.max(0, Math.round((1 - allGroupedLines.length / totalUniqueSerials) * 100))
      : 0;

  return {
    allGroupedLines,
    batches,
    totalInputItems: items.length,
    totalUniqueSerials,
    compressionRatioPct,
  };
}

/**
 * Formata a Grade Agrupada da MIGO exatamente na ordem das colunas da tela do usuário:
 * Txt.brv.material | Cen. | Depósito | Depósito RegTran. | Qtd.em UMR | Texto
 */
export function formatGroupedMigoGridTSV(
  lines: MigoGroupedLine[],
  includeTextoColumn: boolean
): string {
  return lines
    .map((line) => {
      const baseCols = [
        line.material,
        line.centro,
        line.depositoOrigem,
        line.depositoDestino,
        String(line.quantidade),
      ];
      if (includeTextoColumn && line.texto) {
        baseCols.push(line.texto);
      }
      return baseCols.join('\t');
    })
    .join('\r\n');
}

/**
 * Consulta o status da Ponte Local SAP (localhost:18311)
 */
export async function checkLocalSapBridgeStatus(): Promise<SapBridgeStatusResponse> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const response = await fetch(`${SAP_LOCAL_BRIDGE_URL}/status`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        bridgeOnline: false,
        sapRunning: false,
        sapLogged: false,
        message: 'Ponte SAP respondeu com status inválido.',
      };
    }

    const data = await response.json();
    return {
      bridgeOnline: true,
      sapRunning: Boolean(data.sapRunning),
      sapLogged: Boolean(data.sapLogged),
      sapUser: data.sapUser || '',
      sapSystem: data.sapSystem || '',
      sapClient: data.sapClient || '',
      sapTransaction: data.sapTransaction || '',
      message: data.message || '',
    };
  } catch {
    return {
      bridgeOnline: false,
      sapRunning: false,
      sapLogged: false,
      message: 'Conector Local MIGOU-SAP não detectado em execução.',
    };
  }
}

/**
 * Dispara a execução 1-Click para o Conector Local MIGOU-SAP (localhost:18311)
 */
export async function executeMigo311ViaLocalBridge(
  batches: MigoCentroDocumentBatch[],
  options: MigoEngineOptions
): Promise<{
  ok: boolean;
  results: SapBatchExecutionResult[];
  errorMessage?: string;
}> {
  try {
    const vbsScript = generateSapGuiVbsScript(batches, options, '__MIGOU_JSON_OUT_PATH__');
    const response = await fetch(`${SAP_LOCAL_BRIDGE_URL}/execute-migo311`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vbsScript,
        batches,
        options,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        results: [],
        errorMessage: errText || `Falha HTTP ${response.status} ao comunicar com a Ponte SAP.`,
      };
    }

    const data = await response.json();
    return {
      ok: Boolean(data.ok),
      results: Array.isArray(data.results) ? data.results : [],
      errorMessage: data.errorMessage,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro de conexão com localhost:18311';
    return {
      ok: false,
      results: [],
      errorMessage: `Não foi possível conectar ao Agente Local MIGOU-SAP (${msg}). Inicie o Conector 1-Click ou utilize o Executor Direto .VBS / Planilha Mestre Excel.`,
    };
  }
}

function escapeVbsString(val: string): string {
  return (val || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
}

/**
 * Gera o script VBScript (.vbs) CORRIGIDO para SAP GUI Scripting na MIGO 311
 * Correções críticas aplicadas:
 * 1. Usa `tblGrid.GetCell(visibleRow, colIdx).Text = valor` (API oficial do GuiTableControl no SAP GUI Scripting).
 * 2. Reconhece os campos híbridos reais da MIGO (`GOITEM-MAKTX` p/ Txt.brv.material, `GOITEM-NAME1` p/ Cen., `GOITEM-LGOBE` p/ Depósito, `GOITEM-UMLGO` p/ Depósito RegTran., `GOITEM-ERFMG` p/ Qtd.em UMR, `GOITEM-SGTXT` p/ Texto, `GOITEM-TAKE_IT` p/ OK).
 * 3. Localiza a aba `Nº de série` pelo ID real do SAP (`tabpOK_GOITEM_SERIAL`) e preenche os seriais diretamente em `tblSAPLMIGOTV_GOSERIAL.GetCell(sRow, 0).Text` com paginação automática (sem depender de Clipboard bloqueado!).
 * 4. Só reporta `SUCCESS` quando um Documento SAP `49xxxxxxxx` real é gerado, ou `VERIFIED` quando em modo de conferência.
 */
export function generateSapGuiVbsScript(
  batches: MigoCentroDocumentBatch[],
  options: MigoEngineOptions,
  silentJsonOutputPath?: string
): string {
  const isSilentBridge = Boolean(silentJsonOutputPath);
  const vbsLines: string[] = [];

  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`' MIGOU SAP MIGO 311 - ROBO DE AUTOMACAO AGRUPADA V2 (API GetCell + Serial Direto)`);
  vbsLines.push(`' Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`Option Explicit`);
  vbsLines.push(``);
  vbsLines.push(`Dim SapGuiAuto, application, connection, session`);
  vbsLines.push(`Dim wshShell, fso`);
  vbsLines.push(`Set wshShell = CreateObject("WScript.Shell")`);
  vbsLines.push(`Set fso = CreateObject("Scripting.FileSystemObject")`);
  vbsLines.push(``);
  vbsLines.push(`On Error Resume Next`);
  vbsLines.push(`Set SapGuiAuto = GetObject("SAPGUI")`);
  vbsLines.push(`If Err.Number <> 0 Or IsEmpty(SapGuiAuto) Or (SapGuiAuto Is Nothing) Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "SAP Logon fechado. Abra o SAP GUI e faca login antes de executar."`);
  } else {
    vbsLines.push(`  MsgBox "O SAP Logon nao esta aberto nesta maquina." & vbCrLf & "Abra o SAP GUI e faca login na sua conta Midea antes de disparar a MIGO 311.", vbCritical, "MIGOU SAP 311 - SAP Fechado"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`Set application = SapGuiAuto.GetScriptingEngine`);
  vbsLines.push(`If Err.Number <> 0 Or (application Is Nothing) Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "SAP GUI Scripting desabilitado nas opcoes do SAP Logon."`);
  } else {
    vbsLines.push(`  MsgBox "Nao foi possivel conectar ao SAP GUI Scripting." & vbCrLf & "Verifique se o Scripting esta habilitado nas Opcoes do SAP Logon.", vbCritical, "MIGOU SAP 311"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`If application.Children.Count = 0 Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "Nenhuma conexao SAP ativa. Faca login no SAP primeiro."`);
  } else {
    vbsLines.push(`  MsgBox "Nenhuma conexao ativa no SAP Logon. Faca login no SAP.", vbExclamation, "MIGOU SAP 311"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`Set connection = application.Children(0)`);
  vbsLines.push(`Set session = connection.Children(0)`);
  vbsLines.push(`Dim currentSapUser`);
  vbsLines.push(`currentSapUser = Trim(CStr(session.Info.User))`);
  vbsLines.push(`If currentSapUser = "" Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "Sessao SAP na tela de login. Autentique-se com seu usuario Midea."`);
  } else {
    vbsLines.push(`  MsgBox "O SAP esta na tela de login. Faca login com seu usuario Midea primeiro.", vbExclamation, "MIGOU SAP 311"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(`On Error GoTo 0`);
  vbsLines.push(``);

  // Funções de busca recursiva na árvore SAP GUI (independente do número da subscreen SAPLMIGO:0001..0010)
  vbsLines.push(`Function FindControlByIdPart(rootObj, targetIdPart)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Set FindControlByIdPart = Nothing`);
  vbsLines.push(`  If rootObj Is Nothing Then Exit Function`);
  vbsLines.push(`  If InStr(1, CStr(rootObj.Id), targetIdPart, vbTextCompare) > 0 Then`);
  vbsLines.push(`    Set FindControlByIdPart = rootObj`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  Dim childCount, idx, childObj, foundObj`);
  vbsLines.push(`  childCount = 0`);
  vbsLines.push(`  childCount = rootObj.Children.Count`);
  vbsLines.push(`  If Err.Number <> 0 Or childCount = 0 Then`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  For idx = 0 To childCount - 1`);
  vbsLines.push(`    Set childObj = rootObj.Children(CLng(idx))`);
  vbsLines.push(`    Set foundObj = FindControlByIdPart(childObj, targetIdPart)`);
  vbsLines.push(`    If Not (foundObj Is Nothing) Then`);
  vbsLines.push(`      Set FindControlByIdPart = foundObj`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  Next`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  // Descobre o índice exato de uma coluna no TableControl da MIGO (GOITEM-MAKTX / MATNR, GOITEM-NAME1 / WERKS, etc.)
  vbsLines.push(`Function ResolveMigoColIndex(tblCtrl, primaryTechName, secondaryTechName, fallbackColPos)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Dim cIdx, colName`);
  vbsLines.push(`  ResolveMigoColIndex = -1`);
  vbsLines.push(`  For cIdx = 0 To tblCtrl.Columns.Count - 1`);
  vbsLines.push(`    colName = UCase(CStr(tblCtrl.Columns(CLng(cIdx)).Name))`);
  vbsLines.push(`    If InStr(1, colName, UCase(primaryTechName), vbTextCompare) > 0 Then`);
  vbsLines.push(`      ResolveMigoColIndex = cIdx`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  Next`);
  vbsLines.push(`  If secondaryTechName <> "" Then`);
  vbsLines.push(`    For cIdx = 0 To tblCtrl.Columns.Count - 1`);
  vbsLines.push(`      colName = UCase(CStr(tblCtrl.Columns(CLng(cIdx)).Name))`);
  vbsLines.push(`      If InStr(1, colName, UCase(secondaryTechName), vbTextCompare) > 0 Then`);
  vbsLines.push(`        ResolveMigoColIndex = cIdx`);
  vbsLines.push(`        Exit Function`);
  vbsLines.push(`      End If`);
  vbsLines.push(`    Next`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  If fallbackColPos >= 0 And fallbackColPos < tblCtrl.Columns.Count Then`);
  vbsLines.push(`    ResolveMigoColIndex = fallbackColPos`);
  vbsLines.push(`  End If`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  vbsLines.push(`Function ExtractSapDocNumber(statusText)`);
  vbsLines.push(`  Dim regEx, matches`);
  vbsLines.push(`  Set regEx = New RegExp`);
  vbsLines.push(`  regEx.Pattern = "(49[0-9]{8}|[0-9]{10})"`);
  vbsLines.push(`  regEx.Global = False`);
  vbsLines.push(`  If regEx.Test(statusText) Then`);
  vbsLines.push(`    Set matches = regEx.Execute(statusText)`);
  vbsLines.push(`    ExtractSapDocNumber = matches(0).Value`);
  vbsLines.push(`  Else`);
  vbsLines.push(`    ExtractSapDocNumber = ""`);
  vbsLines.push(`  End If`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  vbsLines.push(`Sub DismissPopupIfPresent()`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  If session.Children.Count > 1 Then`);
  vbsLines.push(`    session.findById("wnd[1]/tbar[0]/btn[0]").press`);
  vbsLines.push(`    If Err.Number <> 0 Then`);
  vbsLines.push(`      Err.Clear`);
  vbsLines.push(`      session.findById("wnd[1]").sendVKey 0`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  Err.Clear`);
  vbsLines.push(`End Sub`);
  vbsLines.push(``);

  vbsLines.push(`Sub WriteBridgeError(outPath, errMsg)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Dim ts`);
  vbsLines.push(`  Set ts = fso.CreateTextFile(outPath, True, False)`);
  vbsLines.push(`  ts.Write "{""ok"":false,""errorMessage"":""" & Replace(errMsg, """", "'") & """,""results"":[]}"`);
  vbsLines.push(`  ts.Close`);
  vbsLines.push(`End Sub`);
  vbsLines.push(``);

  // Função Principal que executa 1 Documento MIGO 311 Agrupado
  vbsLines.push(`Function ExecuteMigoBatch(centroName, matArr, cenArr, origArr, destArr, qtdArr, txtArr, serArr, postModeStr, ByRef outDocSap, ByRef outMsg)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  outDocSap = ""`);
  vbsLines.push(`  outMsg = ""`);
  vbsLines.push(`  Dim usrArea, actionCombo, refCombo, bwartField, tblGrid`);
  vbsLines.push(`  Dim totalRows, r, visibleRow, curScroll, visCount`);
  vbsLines.push(`  Dim colMat, colCen, colOrig, colDest, colQtd, colTxt, colOk`);
  vbsLines.push(`  totalRows = UBound(matArr)`);
  vbsLines.push(``);
  vbsLines.push(`  ' 1. Abre /nMIGO limpa`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[0]/okcd").Text = "/nMIGO"`);
  vbsLines.push(`  session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`  DismissPopupIfPresent`);
  vbsLines.push(``);
  vbsLines.push(`  Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(``);
  vbsLines.push(`  ' 2. Garante A08 (Transferencia) + R10 (Outros/as) + Movimento 311`);
  vbsLines.push(`  Set actionCombo = FindControlByIdPart(usrArea, "GODYNPRO-ACTION")`);
  vbsLines.push(`  If Not (actionCombo Is Nothing) Then`);
  vbsLines.push(`    If actionCombo.Key <> "A08" Then`);
  vbsLines.push(`      actionCombo.Key = "A08"`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  Set refCombo = FindControlByIdPart(usrArea, "GODYNPRO-REFDOC")`);
  vbsLines.push(`  If Not (refCombo Is Nothing) Then`);
  vbsLines.push(`    If refCombo.Key <> "R10" Then`);
  vbsLines.push(`      refCombo.Key = "R10"`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  Set bwartField = FindControlByIdPart(usrArea, "GOHEAD-BWART")`);
  vbsLines.push(`  If Not (bwartField Is Nothing) Then`);
  vbsLines.push(`    If Trim(CStr(bwartField.Text)) <> "311" Then`);
  vbsLines.push(`      bwartField.Text = "311"`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  ' 3. Loop pelas Linhas Agrupadas (Material + Centro + Origem + Destino + Qtd Consolidada)`);
  vbsLines.push(`  For r = 0 To totalRows`);
  vbsLines.push(`    Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    Set tblGrid = FindControlByIdPart(usrArea, "tblSAPLMIGOTV_GOITEM")`);
  vbsLines.push(`    If tblGrid Is Nothing Then`);
  vbsLines.push(`      outMsg = "Grade de itens da MIGO (tblSAPLMIGOTV_GOITEM) nao encontrada."`);
  vbsLines.push(`      ExecuteMigoBatch = "error"`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Calcula scroll da grade somente se a linha r ultrapassar as linhas visiveis da tela`);
  vbsLines.push(`    curScroll = tblGrid.verticalScrollbar.Position`);
  vbsLines.push(`    visCount = tblGrid.VisibleRowCount`);
  vbsLines.push(`    If visCount <= 0 Then visCount = 3`);
  vbsLines.push(`    If r >= (curScroll + visCount) Then`);
  vbsLines.push(`      tblGrid.verticalScrollbar.Position = r`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`      Set tblGrid = FindControlByIdPart(usrArea, "tblSAPLMIGOTV_GOITEM")`);
  vbsLines.push(`      curScroll = tblGrid.verticalScrollbar.Position`);
  vbsLines.push(`    End If`);
  vbsLines.push(`    visibleRow = r - curScroll`);
  vbsLines.push(`    If visibleRow < 0 Then visibleRow = 0`);
  vbsLines.push(``);
  vbsLines.push(`    ' Resolve os indices reais das colunas da sua tela MIGO 311:`);
  vbsLines.push(`    ' Col 1: Txt.brv.material (GOITEM-MAKTX ou GOITEM-MATNR)`);
  vbsLines.push(`    ' Col 2: Cen. (GOITEM-NAME1 ou GOITEM-WERKS)`);
  vbsLines.push(`    ' Col 3: Deposito (GOITEM-LGOBE ou GOITEM-LGORT)`);
  vbsLines.push(`    ' Col 4: Deposito RegTran. (GOITEM-UMLGO)`);
  vbsLines.push(`    ' Col 5: Qtd.em UMR (GOITEM-ERFMG)`);
  vbsLines.push(`    ' Col 6: Texto (GOITEM-SGTXT)`);
  vbsLines.push(`    ' Col 7: OK (GOITEM-TAKE_IT)`);
  vbsLines.push(`    colMat = ResolveMigoColIndex(tblGrid, "GOITEM-MAKTX", "GOITEM-MATNR", 1)`);
  vbsLines.push(`    colCen = ResolveMigoColIndex(tblGrid, "GOITEM-NAME1", "GOITEM-WERKS", 2)`);
  vbsLines.push(`    colOrig = ResolveMigoColIndex(tblGrid, "GOITEM-LGOBE", "GOITEM-LGORT", 3)`);
  vbsLines.push(`    colDest = ResolveMigoColIndex(tblGrid, "GOITEM-UMLGO", "", 4)`);
  vbsLines.push(`    colQtd = ResolveMigoColIndex(tblGrid, "GOITEM-ERFMG", "", 5)`);
  vbsLines.push(`    colTxt = ResolveMigoColIndex(tblGrid, "GOITEM-SGTXT", "", 6)`);
  vbsLines.push(`    colOk = ResolveMigoColIndex(tblGrid, "GOITEM-TAKE_IT", "", 7)`);
  vbsLines.push(``);
  vbsLines.push(`    ' Preenche celulas usando a API oficial GetCell(visibleRow, colIdx) do SAP GUI Scripting!`);
  vbsLines.push(`    If colMat >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colMat)).Text = CStr(matArr(r))`);
  vbsLines.push(`    If colCen >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colCen)).Text = CStr(cenArr(r))`);
  vbsLines.push(`    If colOrig >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colOrig)).Text = CStr(origArr(r))`);
  vbsLines.push(`    If colDest >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colDest)).Text = CStr(destArr(r))`);
  vbsLines.push(`    If colQtd >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colQtd)).Text = CStr(qtdArr(r))`);
  vbsLines.push(`    If colTxt >= 0 And Trim(CStr(txtArr(r))) <> "" Then`);
  vbsLines.push(`      tblGrid.GetCell(CLng(visibleRow), CLng(colTxt)).Text = CStr(txtArr(r))`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Pressiona Enter para o SAP validar a linha e liberar a aba Nº de Serie em Dados det.`);
  vbsLines.push(`    session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`    DismissPopupIfPresent`);
  vbsLines.push(``);
  vbsLines.push(`    ' Garante que Dados det. esta apontando para a linha atual (r + 1)`);
  vbsLines.push(`    Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    Dim detailZeile`);
  vbsLines.push(`    Set detailZeile = FindControlByIdPart(usrArea, "GODYNPRO-DETAIL_ZEILE")`);
  vbsLines.push(`    If Not (detailZeile Is Nothing) Then`);
  vbsLines.push(`      If CLng(Trim(CStr(detailZeile.Text))) <> (r + 1) Then`);
  vbsLines.push(`        detailZeile.Text = CStr(r + 1)`);
  vbsLines.push(`        session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`        DismissPopupIfPresent`);
  vbsLines.push(`        Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`      End If`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Seleciona a aba Nº de Serie (tabpOK_GOITEM_SERIAL)`);
  vbsLines.push(`    Dim serTab`);
  vbsLines.push(`    Set serTab = FindControlByIdPart(usrArea, "tabpOK_GOITEM_SERIAL")`);
  vbsLines.push(`    If serTab Is Nothing Then`);
  vbsLines.push(`      Set serTab = FindControlByIdPart(usrArea, "SERIAL")`);
  vbsLines.push(`    End If`);
  vbsLines.push(`    If Not (serTab Is Nothing) Then`);
  vbsLines.push(`      serTab.Select`);
  vbsLines.push(`      DismissPopupIfPresent`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Preenche todos os Seriais desta linha diretamente na tabela tblSAPLMIGOTV_GOSERIAL via GetCell`);
  vbsLines.push(`    Dim sList, sIdx, tblSerial, serVisCount, serPageRow`);
  vbsLines.push(`    sList = Split(CStr(serArr(r)), "|")`);
  vbsLines.push(`    Set tblSerial = FindControlByIdPart(usrArea, "tblSAPLMIGOTV_GOSERIAL")`);
  vbsLines.push(`    If Not (tblSerial Is Nothing) Then`);
  vbsLines.push(`      serVisCount = tblSerial.VisibleRowCount`);
  vbsLines.push(`      If serVisCount <= 0 Then serVisCount = 4`);
  vbsLines.push(`      serPageRow = 0`);
  vbsLines.push(`      For sIdx = 0 To UBound(sList)`);
  vbsLines.push(`        If Trim(CStr(sList(sIdx))) <> "" Then`);
  vbsLines.push(`          If serPageRow >= serVisCount Then`);
  vbsLines.push(`            session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`            Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`            Set tblSerial = FindControlByIdPart(usrArea, "tblSAPLMIGOTV_GOSERIAL")`);
  vbsLines.push(`            tblSerial.verticalScrollbar.Position = sIdx`);
  vbsLines.push(`            Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`            Set tblSerial = FindControlByIdPart(usrArea, "tblSAPLMIGOTV_GOSERIAL")`);
  vbsLines.push(`            serPageRow = sIdx - tblSerial.verticalScrollbar.Position`);
  vbsLines.push(`            If serPageRow < 0 Then serPageRow = 0`);
  vbsLines.push(`          End If`);
  vbsLines.push(`          tblSerial.GetCell(CLng(serPageRow), 0).Text = Trim(CStr(sList(sIdx)))`);
  vbsLines.push(`          serPageRow = serPageRow + 1`);
  vbsLines.push(`        End If`);
  vbsLines.push(`      Next`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      DismissPopupIfPresent`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Marca Item OK (GOITEM-TAKE_IT) no detalhe ou na coluna OK da grade`);
  vbsLines.push(`    Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    Dim chkOk`);
  vbsLines.push(`    Set chkOk = FindControlByIdPart(usrArea, "chkGOITEM-TAKE_IT")`);
  vbsLines.push(`    If Not (chkOk Is Nothing) Then`);
  vbsLines.push(`      chkOk.Selected = True`);
  vbsLines.push(`    Else`);
  vbsLines.push(`      Set tblGrid = FindControlByIdPart(usrArea, "tblSAPLMIGOTV_GOITEM")`);
  vbsLines.push(`      If Not (tblGrid Is Nothing) And colOk >= 0 Then`);
  vbsLines.push(`        tblGrid.GetCell(CLng(visibleRow), CLng(colOk)).Selected = True`);
  vbsLines.push(`      End If`);
  vbsLines.push(`    End If`);
  vbsLines.push(`    session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`    DismissPopupIfPresent`);
  vbsLines.push(`  Next`);
  vbsLines.push(``);
  vbsLines.push(`  ' 4. Clica em VERIFICAR (btn[7])`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[1]/btn[7]").press`);
  vbsLines.push(`  Dim sbarType, sbarText`);
  vbsLines.push(`  sbarType = CStr(session.findById("wnd[0]/sbar").MessageType)`);
  vbsLines.push(`  sbarText = CStr(session.findById("wnd[0]/sbar").Text)`);
  vbsLines.push(``);
  vbsLines.push(`  If sbarType = "E" Or sbarType = "A" Then`);
  vbsLines.push(`    outMsg = "Erro SAP na Verificacao (" & centroName & "): " & sbarText`);
  vbsLines.push(`    ExecuteMigoBatch = "error"`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  If postModeStr = "verificar" Then`);
  vbsLines.push(`    outMsg = "Preenchido e verificado na tela da MIGO (" & (totalRows + 1) & " linha(s) agrupada(s)). Confira e clique em Registrar."`);
  vbsLines.push(`    ExecuteMigoBatch = "verified"`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  ' 5. Clica em REGISTRAR (btn[23] na barra da MIGO ou btn[11] Gravar)`);
  vbsLines.push(`  Err.Clear`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[1]/btn[23]").press`);
  vbsLines.push(`  If Err.Number <> 0 Then`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(`    session.findById("wnd[0]/tbar[0]/btn[11]").press`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  DismissPopupIfPresent`);
  vbsLines.push(``);
  vbsLines.push(`  sbarType = CStr(session.findById("wnd[0]/sbar").MessageType)`);
  vbsLines.push(`  sbarText = CStr(session.findById("wnd[0]/sbar").Text)`);
  vbsLines.push(`  outDocSap = ExtractSapDocNumber(sbarText)`);
  vbsLines.push(``);
  vbsLines.push(`  If outDocSap <> "" Then`);
  vbsLines.push(`    outMsg = sbarText`);
  vbsLines.push(`    ExecuteMigoBatch = "success"`);
  vbsLines.push(`  ElseIf InStr(1, sbarText, "código de função", vbTextCompare) > 0 Or InStr(1, sbarText, "codigo de funcao", vbTextCompare) > 0 Then`);
  vbsLines.push(`    outMsg = "A MIGO preencheu os itens na tela, mas aguarda confirmacao visual no SAP (verifique janela de log ou clique em Registrar)."`);
  vbsLines.push(`    ExecuteMigoBatch = "verified"`);
  vbsLines.push(`  Else`);
  vbsLines.push(`    outMsg = "Retorno SAP (" & centroName & "): " & sbarText`);
  vbsLines.push(`    ExecuteMigoBatch = "error"`);
  vbsLines.push(`  End If`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  vbsLines.push(`Dim batchStatus, docSapGenerated, batchMessage`);
  vbsLines.push(`Dim summaryReport, jsonResults`);
  vbsLines.push(`summaryReport = ""`);
  vbsLines.push(`jsonResults = ""`);
  vbsLines.push(``);

  batches.forEach((batch, bIdx) => {
    const n = batch.lines.length - 1;
    vbsLines.push(
      `Dim mat_${bIdx}(${n}), cen_${bIdx}(${n}), orig_${bIdx}(${n}), dest_${bIdx}(${n}), qtd_${bIdx}(${n}), txt_${bIdx}(${n}), ser_${bIdx}(${n})`
    );

    batch.lines.forEach((line, lIdx) => {
      const serialsPipe = line.serials.map((s) => escapeVbsString(s)).join('|');
      vbsLines.push(`mat_${bIdx}(${lIdx}) = "${escapeVbsString(line.material)}"`);
      vbsLines.push(`cen_${bIdx}(${lIdx}) = "${escapeVbsString(line.centro)}"`);
      vbsLines.push(`orig_${bIdx}(${lIdx}) = "${escapeVbsString(line.depositoOrigem)}"`);
      vbsLines.push(`dest_${bIdx}(${lIdx}) = "${escapeVbsString(line.depositoDestino)}"`);
      vbsLines.push(`qtd_${bIdx}(${lIdx}) = "${line.quantidade}"`);
      vbsLines.push(`txt_${bIdx}(${lIdx}) = "${escapeVbsString(line.texto)}"`);
      vbsLines.push(`ser_${bIdx}(${lIdx}) = "${serialsPipe}"`);
    });

    vbsLines.push(
      `batchStatus = ExecuteMigoBatch("${escapeVbsString(batch.centro)}", mat_${bIdx}, cen_${bIdx}, orig_${bIdx}, dest_${bIdx}, qtd_${bIdx}, txt_${bIdx}, ser_${bIdx}, "${options.postMode}", docSapGenerated, batchMessage)`
    );

    const itemIdsJson = JSON.stringify(batch.itemIds).replace(/"/g, '""');
    vbsLines.push(`If jsonResults <> "" Then jsonResults = jsonResults & ","`);
    vbsLines.push(
      `jsonResults = jsonResults & "{""centro"":""${escapeVbsString(batch.centro)}"",""status"":""" & batchStatus & """,""docSap"":""" & docSapGenerated & """,""message"":""" & Replace(batchMessage, """", "'") & """,""serialCount"":${batch.totalSerials},""itemIds"":${itemIdsJson}}"`
    );
    vbsLines.push(
      `summaryReport = summaryReport & "Centro ${escapeVbsString(batch.centro)} (${batch.totalSerials} seriais em ${batch.totalLines} linha(s)): " & UCase(batchStatus) & " -> " & IIfStr(docSapGenerated <> "", "Doc SAP: " & docSapGenerated, batchMessage) & vbCrLf`
    );
    vbsLines.push(``);
  });

  vbsLines.push(`Function IIfStr(cond, valTrue, valFalse)`);
  vbsLines.push(`  If cond Then IIfStr = valTrue Else IIfStr = valFalse`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  if (isSilentBridge) {
    vbsLines.push(`Dim outTs`);
    vbsLines.push(
      `Set outTs = fso.CreateTextFile("${escapeVbsString(silentJsonOutputPath!)}", True, False)`
    );
    vbsLines.push(`outTs.Write "{""ok"":true,""results"":[" & jsonResults & "]}"`);
    vbsLines.push(`outTs.Close`);
  } else {
    vbsLines.push(
      `MsgBox "Execucao MIGO 311 Finalizada pelo MIGOU!" & vbCrLf & "Usuario SAP: " & currentSapUser & vbCrLf & vbCrLf & summaryReport, vbInformation, "MIGOU SAP MIGO 311"`
    );
  }

  return vbsLines.join('\r\n');
}

/**
 * Baixa o arquivo .VBS de Execução Direta 1-Click para rodar no Windows
 */
export function downloadSapGuiVbsExecutor(
  batches: MigoCentroDocumentBatch[],
  options: MigoEngineOptions
): void {
  const vbsContent = generateSapGuiVbsScript(batches, options);
  const blob = new Blob([vbsContent], { type: 'text/vbscript;charset=windows-1252;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const centrosTag = batches.map((b) => b.centro).join('_');
  link.href = url;
  link.download = `MIGOU_MIGO311_${centrosTag}_${new Date().toISOString().slice(0, 10)}.vbs`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Gera o Conector Local 1-Click (MIGOU-Conector-SAP-1Click.bat)
 */
export function downloadLocalSapBridgeLauncher(): void {
  const batLines: string[] = [
    `@echo off`,
    `title MIGOU SAP MIGO 311 - Conector Local 1-Click (Exclusivo Time Midea)`,
    `color 1F`,
    `echo ===============================================================================`,
    `echo   MIGOU SAP MIGO 311 - CONECTOR LOCAL 1-CLICK (PORTA 18311)`,
    `echo   Mantem o navegador conectado ao seu SAP Logon para execucao com 1 clique.`,
    `echo ===============================================================================`,
    `echo.`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command ^`,
    `"$listener = New-Object System.Net.HttpListener; ^`,
    `$listener.Prefixes.Add('${SAP_LOCAL_BRIDGE_URL}/'); ^`,
    `$listener.Start(); ^`,
    `Write-Host '[OK] Conector MIGOU-SAP ativo em ${SAP_LOCAL_BRIDGE_URL}' -ForegroundColor Green; ^`,
    `Write-Host 'Deixe esta janela aberta enquanto utiliza o MIGOU no navegador.' -ForegroundColor Cyan; ^`,
    `while ($listener.IsListening) { ^`,
    `  $ctx = $listener.GetContext(); ^`,
    `  $req = $ctx.Request; ^`,
    `  $res = $ctx.Response; ^`,
    `  $res.Headers.Add('Access-Control-Allow-Origin', '*'); ^`,
    `  $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); ^`,
    `  $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type'); ^`,
    `  if ($req.HttpMethod -eq 'OPTIONS') { $res.StatusCode = 200; $res.Close(); continue; } ^`,
    `  if ($req.Url.AbsolutePath -eq '/status') { ^`,
    `    $vbsCheck = $env:TEMP + '\\migou_sap_check.vbs'; ^`,
    `    $outCheck = $env:TEMP + '\\migou_sap_check.json'; ^`,
    `    if (Test-Path $outCheck) { Remove-Item $outCheck -Force } ^`,
    `    $cLines = @( ^`,
    `      'On Error Resume Next', ^`,
    `      'Set fso = CreateObject(\"Scripting.FileSystemObject\")', ^`,
    `      'Set ts = fso.CreateTextFile(\"' + $outCheck.Replace('\\','\\\\') + '\", True, False)', ^`,
    `      'Set SapGuiAuto = GetObject(\"SAPGUI\")', ^`,
    `      'If Err.Number <> 0 Or IsEmpty(SapGuiAuto) Then', ^`,
    `      '  ts.Write \"{\"\"sapRunning\"\":false,\"\"sapLogged\"\":false,\"\"message\"\":\"\"SAP Logon fechado\"\"}\"', ^`,
    `      'Else', ^`,
    `      '  Set app = SapGuiAuto.GetScriptingEngine', ^`,
    `      '  If app.Children.Count = 0 Then', ^`,
    `      '    ts.Write \"{\"\"sapRunning\"\":true,\"\"sapLogged\"\":false,\"\"message\"\":\"\"SAP aberto sem login\"\"}\"', ^`,
    `      '  Else', ^`,
    `      '    Set conn = app.Children(0)', ^`,
    `      '    Set sess = conn.Children(0)', ^`,
    `      '    usr = Trim(CStr(sess.Info.User))', ^`,
    `      '    sys = Trim(CStr(sess.Info.SystemName))', ^`,
    `      '    clt = Trim(CStr(sess.Info.Client))', ^`,
    `      '    tx = Trim(CStr(sess.Info.Transaction))', ^`,
    `      '    If usr <> \"\" Then', ^`,
    `      '      ts.Write \"{\"\"sapRunning\"\":true,\"\"sapLogged\"\":true,\"\"sapUser\"\":\"\"\" & usr & \"\"\",\"\"sapSystem\"\":\"\"\" & sys & \"\"\",\"\"sapClient\"\":\"\"\" & clt & \"\"\",\"\"sapTransaction\"\":\"\"\" & tx & \"\"\"}\"', ^`,
    `      '    Else', ^`,
    `      '      ts.Write \"{\"\"sapRunning\"\":true,\"\"sapLogged\"\":false,\"\"message\"\":\"\"Tela de login SAP\"\"}\"', ^`,
    `      '    End If', ^`,
    `      '  End If', ^`,
    `      'End If', ^`,
    `      'ts.Close' ^`,
    `    ); ^`,
    `    [System.IO.File]::WriteAllLines($vbsCheck, $cLines); ^`,
    `    Start-Process -FilePath 'cscript.exe' -ArgumentList '//Nologo', $vbsCheck -Wait -WindowStyle Hidden; ^`,
    `    $jsonBytes = if (Test-Path $outCheck) { [System.Text.Encoding]::UTF8.GetBytes((Get-Content $outCheck -Raw)) } else { [System.Text.Encoding]::UTF8.GetBytes('{\"sapRunning\":false,\"sapLogged\":false}') }; ^`,
    `    $res.ContentType = 'application/json'; ^`,
    `    $res.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length); ^`,
    `    $res.Close(); ^`,
    `    continue; ^`,
    `  } ^`,
    `  if ($req.Url.AbsolutePath -eq '/execute-migo311' -and $req.HttpMethod -eq 'POST') { ^`,
    `    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8); ^`,
    `    $body = $reader.ReadToEnd() | ConvertFrom-Json; ^`,
    `    $vbsExec = $env:TEMP + '\\migou_sap_exec.vbs'; ^`,
    `    $outExec = $env:TEMP + '\\migou_sap_exec.json'; ^`,
    `    if (Test-Path $outExec) { Remove-Item $outExec -Force } ^`,
    `    $scriptText = [string]$body.vbsScript; ^`,
    `    $scriptText = $scriptText.Replace('__MIGOU_JSON_OUT_PATH__', $outExec); ^`,
    `    [System.IO.File]::WriteAllText($vbsExec, $scriptText, [System.Text.Encoding]::Default); ^`,
    `    Write-Host ('[' + (Get-Date -Format 'HH:mm:ss') + '] Executando lote MIGO 311 no SAP...') -ForegroundColor Yellow; ^`,
    `    Start-Process -FilePath 'cscript.exe' -ArgumentList '//Nologo', $vbsExec -Wait -WindowStyle Hidden; ^`,
    `    $respJson = if (Test-Path $outExec) { Get-Content $outExec -Raw } else { '{\"ok\":false,\"errorMessage\":\"Falha ao ler resposta do VBScript SAP.\"}' }; ^`,
    `    Write-Host ('[' + (Get-Date -Format 'HH:mm:ss') + '] Finalizado: ' + $respJson) -ForegroundColor Green; ^`,
    `    $bytes = [System.Text.Encoding]::UTF8.GetBytes($respJson); ^`,
    `    $res.ContentType = 'application/json'; ^`,
    `    $res.OutputStream.Write($bytes, 0, $bytes.Length); ^`,
    `    $res.Close(); ^`,
    `    continue; ^`,
    `  } ^`,
    `  $res.StatusCode = 404; $res.Close(); ^`,
    `}"`,
    `pause`,
  ];

  const content = batLines.join('\r\n');
  const blob = new Blob([content], { type: 'application/x-bat;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'MIGOU-Conector-SAP-1Click.bat';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * SCRIPT MESTRE VBA EXCEL V3 (COM CONSTRUTOR DE PAINEL VISUAL PREMIUM + AGRUPAMENTO + EXECUÇÃO SAP MIGO 311)
 * - Inclui `Sub Construir_Painel_Visual_MIGOU()`: Ao rodar 1 vez numa planilha em branco, desenha automaticamente
 *   todo o Painel Visual Midea/MIGOU, cria os cartões de KPI, cria as duas tabelas (Entrada e Prévia Agrupada MIGO)
 *   e desenha os 4 Botões Clicáveis na planilha para compartilhar com os colegas de trabalho!
 * - Inclui `Sub Simular_Agrupamento_MIGO311()`: Consolida por Centro + Material + Origem + Destino.
 * - Inclui `Sub Executar_SAP_MIGO_311_Mestre()`: Usa `tblGrid.GetCell(row, col)` + `GOITEM-MAKTX` (`Txt.brv.material`) +
 *   `tabpOK_GOITEM_SERIAL` + preenchimento direto em `tblSAPLMIGOTV_GOSERIAL` (sem depender de Clipboard!).
 */
export function generateExcelVbaV2MacroCode(options: MigoEngineOptions): string {
  const defaultTexto = resolveMigoItemText(options);
  return `' =======================================================================================
' SISTEMA MESTRE EXCEL VBA V3 - MIGOU SAP MIGO 311 (MIDEA CARRIER)
' Autor: MIGOU Automation Engine - Exclusivo Time Midea
'
' COMO USAR E COMPARTILHAR COM SEUS COLEGAS:
' 1. No Excel, aperte ALT + F11 -> Inserir -> Modulo (tenha apenas 1 modulo no projeto) e cole este codigo.
' 2. Execute uma unica vez a macro "Construir_Painel_Visual_MIGOU" (F5).
'    Ela vai desenhar automaticamente toda a interface visual azul Safira do MIGOU,
'    criar os seletores, as tabelas e os BOTOES CLICAVEIS na planilha!
' 3. Salve o arquivo como "Painel_Mestre_MIGO311_MIGOU.xlsm" e compartilhe com o time!
' =======================================================================================
Option Explicit

' =======================================================================================
' 1. CONSTRUTOR AUTOMATICO DO LAYOUT VISUAL NO EXCEL (RODE 1 VEZ PARA CRIAR O PAINEL)
' =======================================================================================
Public Sub Construir_Painel_Visual_MIGOU()
    Dim ws As Worksheet
    Dim shp As Shape
    Application.ScreenUpdating = False
    
    Set ws = ActiveSheet
    On Error Resume Next
    ws.Name = "PAINEL_MIGO_311"
    On Error GoTo 0
    
    ' Remove botoes antigos para nao duplicar
    For Each shp In ws.Shapes
        If Left(shp.Name, 9) = "BTN_MIGOU" Then shp.Delete
    Next shp
    
    ws.Cells.ClearFormats
    ActiveWindow.DisplayGridlines = True
    ws.Cells.Font.Name = "Segoe UI"
    ws.Cells.Font.Size = 10
    
    ' 1. Faixa Superior Azul Safira MIGOU (Linhas 1 a 3)
    ws.Range("A1:P3").Interior.Color = RGB(6, 25, 62)
    ws.Range("A1:P1").RowHeight = 8
    ws.Range("A2:P2").RowHeight = 28
    ws.Range("A3:P3").RowHeight = 18
    
    ws.Range("B2").Value = "MIGOU SAP - CENTRAL MESTRE DE AUTOMACAO MIGO 311 (AGRUPAMENTO INTELIGENTE)"
    ws.Range("B2").Font.Color = RGB(255, 255, 255)
    ws.Range("B2").Font.Bold = True
    ws.Range("B2").Font.Size = 14
    
    ws.Range("B3").Value = "Agrupa automaticamente por Material + Centro + Deposito Origem/Destino - Preenche Numeros de Serie - Captura Doc SAP 49xxxxxxxx"
    ws.Range("B3").Font.Color = RGB(186, 230, 253)
    ws.Range("B3").Font.Size = 9
    
    ' 2. Painel de Parametros e KPIs (Linhas 5 a 7)
    ws.Rows(4).RowHeight = 10
    ws.Rows(5).RowHeight = 18
    ws.Rows(6).RowHeight = 24
    ws.Rows(7).RowHeight = 10
    
    ' Configuracoes (B5:E6)
    ws.Range("B5").Value = "COLUNA TEXTO NA MIGO:"
    ws.Range("C5").Value = "MODO DE EXECUCAO NO SAP:"
    ws.Range("D5").Value = "DIVISAO POR CENTRO:"
    ws.Range("B5:D5").Font.Bold = True
    ws.Range("B5:D5").Font.Size = 8
    ws.Range("B5:D5").Font.Color = RGB(71, 85, 105)
    
    ws.Range("B6").Value = "${defaultTexto || ''}"
    ws.Range("B6").Interior.Color = RGB(240, 249, 255)
    ws.Range("B6").Borders.LineStyle = xlContinuous
    ws.Range("B6").Font.Bold = True
    ws.Range("B6").HorizontalAlignment = xlCenter
    
    With ws.Range("C6")
        .Value = "VERIFICAR E GRAVAR"
        .Interior.Color = RGB(236, 253, 245)
        .Borders.LineStyle = xlContinuous
        .Font.Bold = True
        .HorizontalAlignment = xlCenter
        .Validation.Delete
        .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="VERIFICAR E GRAVAR,APENAS PREENCHER E VERIFICAR"
    End With
    
    With ws.Range("D6")
        .Value = "1 DOC POR CENTRO"
        .Interior.Color = RGB(240, 249, 255)
        .Borders.LineStyle = xlContinuous
        .Font.Bold = True
        .HorizontalAlignment = xlCenter
        .Validation.Delete
        .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="1 DOC POR CENTRO,TUDO NO MESMO DOC"
    End With
    
    ' Cartoes de Resumo (I5:O6)
    ws.Range("I5").Value = "TOTAL SERIAIS:"
    ws.Range("J5").Value = "LINHAS MIGO:"
    ws.Range("K5").Value = "ULTIMO USUARIO SAP:"
    ws.Range("L5").Value = "STATUS EXECUCAO:"
    ws.Range("I5:L5").Font.Bold = True
    ws.Range("I5:L5").Font.Size = 8
    ws.Range("I5:L5").Font.Color = RGB(71, 85, 105)
    
    ws.Range("I6").Value = 0
    ws.Range("J6").Value = 0
    ws.Range("K6").Value = "-"
    ws.Range("L6").Value = "Aguardando Lote"
    ws.Range("I6:L6").Font.Bold = True
    ws.Range("I6:L6").Font.Size = 11
    ws.Range("I6:L6").Interior.Color = RGB(248, 250, 252)
    ws.Range("I6:L6").Borders.LineStyle = xlContinuous
    ws.Range("I6:K6").HorizontalAlignment = xlCenter
    
    ' 3. Cabecalhos da Tabela 1 (Entrada Bruta - Colunas B a G)
    ws.Rows(8).RowHeight = 26
    ws.Rows(9).RowHeight = 22
    
    ws.Range("B8:G8").Merge
    ws.Range("B8").Value = "1. DADOS DE ENTRADA (COLE AQUI DO MIGOU OU EXCEL - 1 SERIAL POR LINHA)"
    ws.Range("B8").Interior.Color = RGB(0, 72, 142)
    ws.Range("B8").Font.Color = RGB(255, 255, 255)
    ws.Range("B8").Font.Bold = True
    ws.Range("B8").VerticalAlignment = xlCenter
    
    ws.Range("B9").Value = "Material (SKU)"
    ws.Range("C9").Value = "Serial (UII)"
    ws.Range("D9").Value = "Centro"
    ws.Range("E9").Value = "Dep. Origem"
    ws.Range("F9").Value = "Dep. Destino"
    ws.Range("G9").Value = "Doc SAP / Retorno"
    
    With ws.Range("B9:G9")
        .Interior.Color = RGB(224, 242, 254)
        .Font.Color = RGB(6, 25, 62)
        .Font.Bold = True
        .Borders.LineStyle = xlContinuous
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With
    
    ' 4. Cabecalhos da Tabela 2 (Grade MIGO 311 Agrupada - Colunas I a P)
    ws.Range("I8:P8").Merge
    ws.Range("I8").Value = "2. ESPELHO AGRUPADO DA MIGO 311 (COMO A MACRO PREENCHERA NO SAP)"
    ws.Range("I8").Interior.Color = RGB(6, 25, 62)
    ws.Range("I8").Font.Color = RGB(255, 255, 255)
    ws.Range("I8").Font.Bold = True
    ws.Range("I8").VerticalAlignment = xlCenter
    
    ws.Range("I9").Value = "Linha"
    ws.Range("J9").Value = "Txt.brv.material"
    ws.Range("K9").Value = "Cen."
    ws.Range("L9").Value = "Deposito"
    ws.Range("M9").Value = "Deposito RegTran."
    ws.Range("N9").Value = "Qtd.em UMR"
    ws.Range("O9").Value = "Seriais do Grupo"
    ws.Range("P9").Value = "Status SAP / Doc 49x"
    
    With ws.Range("I9:P9")
        .Interior.Color = RGB(224, 242, 254)
        .Font.Color = RGB(6, 25, 62)
        .Font.Bold = True
        .Borders.LineStyle = xlContinuous
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With
    
    ' Larguras das Colunas
    ws.Columns("A").ColumnWidth = 2
    ws.Columns("B").ColumnWidth = 18
    ws.Columns("C").ColumnWidth = 22
    ws.Columns("D").ColumnWidth = 9
    ws.Columns("E").ColumnWidth = 12
    ws.Columns("F").ColumnWidth = 12
    ws.Columns("G").ColumnWidth = 22
    ws.Columns("H").ColumnWidth = 3
    ws.Columns("I").ColumnWidth = 7
    ws.Columns("J").ColumnWidth = 18
    ws.Columns("K").ColumnWidth = 8
    ws.Columns("L").ColumnWidth = 11
    ws.Columns("M").ColumnWidth = 16
    ws.Columns("N").ColumnWidth = 12
    ws.Columns("O").ColumnWidth = 28
    ws.Columns("P").ColumnWidth = 26
    
    ' 5. Criacao dos Botoes Visuais de Acao no Topo
    CreateActionButton ws, "BTN_MIGOU_AGRUPAR", "1. AGRUPAR E SIMULAR MIGO", "Simular_Agrupamento_MIGO311", 435, 38, 175, 28, RGB(0, 131, 202)
    CreateActionButton ws, "BTN_MIGOU_EXECUTAR", "2. EXECUTAR NO SAP (MIGO 311)", "Executar_SAP_MIGO_311_Mestre", 620, 38, 205, 28, RGB(16, 185, 129)
    CreateActionButton ws, "BTN_MIGOU_LIMPAR", "LIMPAR", "Limpar_Painel_MIGOU", 835, 38, 80, 28, RGB(225, 29, 72)
    
    Application.ScreenUpdating = True
    MsgBox "Painel Visual MIGOU MIGO 311 construido com sucesso!" & vbCrLf & vbCrLf & _
           "Agora basta colar os itens nas colunas B a F (a partir da linha 10) e clicar nos botoes do topo!", vbInformation, "MIGOU SAP 311"
End Sub

Private Sub CreateActionButton(ws As Worksheet, btnName As String, captionText As String, macroName As String, leftPos As Double, topPos As Double, widthVal As Double, heightVal As Double, fillColor As Long)
    Dim shp As Shape
    ' Constantes numericas nativas do Office (compativeis com qualquer versao do Excel)
    Set shp = ws.Shapes.AddShape(5, leftPos, topPos, widthVal, heightVal)
    shp.Name = btnName
    shp.Fill.ForeColor.RGB = fillColor
    shp.Line.Visible = 0
    shp.TextFrame2.TextRange.Text = captionText
    shp.TextFrame2.TextRange.Font.Name = "Segoe UI"
    shp.TextFrame2.TextRange.Font.Size = 9.5
    shp.TextFrame2.TextRange.Font.Bold = -1
    shp.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
    shp.TextFrame2.VerticalAnchor = 3
    shp.TextFrame2.TextRange.ParagraphFormat.Alignment = 2
    shp.OnAction = macroName
End Sub

' =======================================================================================
' 2. MOTOR DE AGRUPAMENTO NO EXCEL (CONSOLIDA POR CENTRO + MATERIAL + ORIGEM + DESTINO)
' =======================================================================================
Public Sub Simular_Agrupamento_MIGO311()
    Dim ws As Worksheet
    Dim lastRow As Long, r As Long, outRow As Long
    Dim dictQtd As Object, dictSerials As Object, dictRows As Object
    Dim mat As String, ser As String, cen As String, orig As String, dest As String
    Dim groupKey As String, seenSerialKey As String
    Dim dictSeenSerial As Object
    
    Set ws = ActiveSheet
    lastRow = ws.Cells(ws.Rows.Count, "B").End(xlUp).Row
    
    ' Se o usuario colou na Coluna A em vez da B, detecta automaticamente!
    Dim colOffset As Long
    If lastRow < 10 And ws.Cells(ws.Rows.Count, "A").End(xlUp).Row >= 2 Then
        colOffset = 0 ' Colunas A..E
        lastRow = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row
    Else
        colOffset = 1 ' Colunas B..F do Painel Visual
    End If
    
    Dim startRow As Long
    startRow = IIf(colOffset = 1, 10, 2)
    
    If lastRow < startRow Then
        MsgBox "Cole os dados de Material, Serial, Centro, Dep. Origem e Dep. Destino antes de agrupar.", vbExclamation, "MIGOU SAP 311"
        Exit Sub
    End If
    
    Set dictQtd = CreateObject("Scripting.Dictionary")
    Set dictSerials = CreateObject("Scripting.Dictionary")
    Set dictRows = CreateObject("Scripting.Dictionary")
    Set dictSeenSerial = CreateObject("Scripting.Dictionary")
    
    For r = startRow To lastRow
        mat = UCase(Trim(CStr(ws.Cells(r, 1 + colOffset).Value)))
        ser = UCase(Trim(CStr(ws.Cells(r, 2 + colOffset).Value)))
        cen = UCase(Trim(CStr(ws.Cells(r, 3 + colOffset).Value)))
        orig = UCase(Trim(CStr(ws.Cells(r, 4 + colOffset).Value)))
        dest = UCase(Trim(CStr(ws.Cells(r, 5 + colOffset).Value)))
        
        If mat <> "" And ser <> "" And cen <> "" And orig <> "" And dest <> "" Then
            groupKey = cen & "|" & mat & "|" & orig & "|" & dest
            seenSerialKey = groupKey & "|" & ser
            
            If Not dictSeenSerial.Exists(seenSerialKey) Then
                dictSeenSerial.Add seenSerialKey, True
                If Not dictQtd.Exists(groupKey) Then
                    dictQtd.Add groupKey, 1
                    dictSerials.Add groupKey, ser
                    dictRows.Add groupKey, CStr(r)
                Else
                    dictQtd(groupKey) = CLng(dictQtd(groupKey)) + 1
                    dictSerials(groupKey) = dictSerials(groupKey) & "|" & ser
                    dictRows(groupKey) = dictRows(groupKey) & "," & CStr(r)
                End If
            End If
        End If
    Next r
    
    If colOffset = 1 Then
        ws.Range("I10:P5000").ClearContents
        ws.Range("I10:P5000").Interior.ColorIndex = xlNone
        
        Dim keys As Variant, idx As Long, parts As Variant
        keys = dictQtd.Keys
        outRow = 10
        
        For idx = 0 To dictQtd.Count - 1
            parts = Split(CStr(keys(idx)), "|")
            ws.Cells(outRow, "I").Value = idx + 1
            ws.Cells(outRow, "J").Value = parts(1) ' Material
            ws.Cells(outRow, "K").Value = parts(0) ' Centro
            ws.Cells(outRow, "L").Value = parts(2) ' Origem
            ws.Cells(outRow, "M").Value = parts(3) ' Destino
            ws.Cells(outRow, "N").Value = CLng(dictQtd(keys(idx))) ' Qtd Consolidada
            ws.Cells(outRow, "O").Value = Replace(CStr(dictSerials(keys(idx))), "|", ", ")
            ws.Cells(outRow, "P").Value = "Pronto p/ MIGO (" & dictQtd(keys(idx)) & " UIIs)"
            
            ws.Range("I" & outRow & ":P" & outRow).Borders.LineStyle = xlContinuous
            ws.Cells(outRow, "I").HorizontalAlignment = xlCenter
            ws.Cells(outRow, "K").HorizontalAlignment = xlCenter
            ws.Cells(outRow, "L").HorizontalAlignment = xlCenter
            ws.Cells(outRow, "M").HorizontalAlignment = xlCenter
            ws.Cells(outRow, "N").HorizontalAlignment = xlCenter
            ws.Cells(outRow, "N").Font.Bold = True
            outRow = outRow + 1
        Next idx
        
        ws.Range("I6").Value = dictSeenSerial.Count
        ws.Range("J6").Value = dictQtd.Count
        ws.Range("L6").Value = dictQtd.Count & " linha(s) agrupada(s)"
    End If
End Sub

' =======================================================================================
' 3. EXECUTOR MESTRE SAP GUI MIGO 311 (COM GetCell + ABA Nº DE SERIE DIRETA)
' =======================================================================================
Public Sub Executar_SAP_MIGO_311_Mestre()
    Dim SapGuiAuto As Object, app As Object, conn As Object, session As Object
    Dim ws As Worksheet
    
    Set ws = ActiveSheet
    
    ' 1. Atualiza o agrupamento antes de ir ao SAP
    Simular_Agrupamento_MIGO311
    
    Dim lastGroupRow As Long
    lastGroupRow = ws.Cells(ws.Rows.Count, "J").End(xlUp).Row
    If lastGroupRow < 10 Then
        MsgBox "Nenhuma linha agrupada encontrada na tabela da direita (Colunas I a P)." & vbCrLf & _
               "Se ainda nao montou o painel, execute 'Construir_Painel_Visual_MIGOU' primeiro.", vbExclamation, "MIGOU SAP 311"
        Exit Sub
    End If
    
    ' 2. Conecta ao SAP Logon e exige usuario logado
    On Error Resume Next
    Set SapGuiAuto = GetObject("SAPGUI")
    If Err.Number <> 0 Or SapGuiAuto Is Nothing Then
        MsgBox "O SAP Logon nao esta aberto! Abra o SAP e faca login antes de executar.", vbCritical, "MIGOU SAP 311"
        Exit Sub
    End If
    Set app = SapGuiAuto.GetScriptingEngine
    If app Is Nothing Or app.Children.Count = 0 Then
        MsgBox "Nenhuma conexao SAP ativa! Faca login no SAP primeiro.", vbCritical, "MIGOU SAP 311"
        Exit Sub
    End If
    Set conn = app.Children(0)
    Set session = conn.Children(0)
    If session Is Nothing Or Trim(CStr(session.Info.User)) = "" Then
        MsgBox "Sessao SAP nao autenticada! Faca login com seu usuario Midea no SAP.", vbCritical, "MIGOU SAP 311"
        Exit Sub
    End If
    On Error GoTo 0
    
    ws.Range("K6").Value = CStr(session.Info.User)
    
    Dim textoPadrao As String, modoExec As String, divisaoCentro As String
    textoPadrao = Trim(CStr(ws.Range("B6").Value))
    modoExec = UCase(Trim(CStr(ws.Range("C6").Value)))
    divisaoCentro = UCase(Trim(CStr(ws.Range("D6").Value)))
    
    ' 3. Descobre os Centros unicos para rodar 1 Documento MIGO por Centro (ou tudo junto)
    Dim dictCentros As Object
    Set dictCentros = CreateObject("Scripting.Dictionary")
    Dim r As Long, cName As String
    
    For r = 10 To lastGroupRow
        cName = UCase(Trim(CStr(ws.Cells(r, "K").Value)))
        If cName <> "" Then
            If InStr(1, divisaoCentro, "TUDO", vbTextCompare) > 0 Then
                cName = "TODOS"
            End If
            If Not dictCentros.Exists(cName) Then dictCentros.Add cName, True
        End If
    Next r
    
    Dim cKeys As Variant, cIdx As Long, currentCentroFilter As String
    Dim docSapGerado As String, msgRetorno As String, statusExec As String
    Dim relatorioFinal As String
    cKeys = dictCentros.Keys
    relatorioFinal = ""
    
    For cIdx = 0 To dictCentros.Count - 1
        currentCentroFilter = CStr(cKeys(cIdx))
        statusExec = ProcessarLoteMigoNoSap(session, ws, 10, lastGroupRow, currentCentroFilter, textoPadrao, modoExec, docSapGerado, msgRetorno)
        
        ' Atualiza Status e Doc SAP na planilha (Coluna P e Coluna G)
        For r = 10 To lastGroupRow
            If currentCentroFilter = "TODOS" Or UCase(Trim(CStr(ws.Cells(r, "K").Value))) = currentCentroFilter Then
                If statusExec = "SUCCESS" Then
                    ws.Cells(r, "P").Value = "CONCLUIDO - Doc: " & docSapGerado
                    ws.Cells(r, "P").Interior.Color = RGB(209, 250, 229)
                    PreencherDocSapNaEntrada ws, CStr(ws.Cells(r, "J").Value), CStr(ws.Cells(r, "K").Value), docSapGerado
                ElseIf statusExec = "VERIFIED" Then
                    ws.Cells(r, "P").Value = "VERIFICADO NA TELA SAP"
                    ws.Cells(r, "P").Interior.Color = RGB(224, 242, 254)
                Else
                    ws.Cells(r, "P").Value = "ERRO: " & msgRetorno
                    ws.Cells(r, "P").Interior.Color = RGB(254, 226, 226)
                End If
            End If
        Next r
        
        relatorioFinal = relatorioFinal & "Centro " & currentCentroFilter & ": " & statusExec & " -> " & IIf(docSapGerado <> "", "Doc SAP " & docSapGerado, msgRetorno) & vbCrLf
        
        ' Se o modo for APENAS PREENCHER E VERIFICAR, para no primeiro lote para o analista ver a tela aberta!
        If InStr(1, modoExec, "APENAS", vbTextCompare) > 0 Then Exit For
    Next cIdx
    
    ws.Range("L6").Value = "Finalizado (" & Format(Now, "hh:mm:ss") & ")"
    MsgBox "Processamento SAP MIGO 311 Concluido!" & vbCrLf & vbCrLf & relatorioFinal, vbInformation, "MIGOU SAP MIGO 311"
End Sub

Private Sub PreencherDocSapNaEntrada(ws As Worksheet, matTarget As String, cenTarget As String, docSap As String)
    Dim lastIn As Long, i As Long
    lastIn = ws.Cells(ws.Rows.Count, "B").End(xlUp).Row
    For i = 10 To lastIn
        If UCase(Trim(CStr(ws.Cells(i, "B").Value))) = matTarget And UCase(Trim(CStr(ws.Cells(i, "D").Value))) = cenTarget Then
            ws.Cells(i, "G").Value = docSap
            ws.Cells(i, "G").Interior.Color = RGB(209, 250, 229)
            ws.Cells(i, "G").Font.Bold = True
        End If
    Next i
End Sub

Private Function ProcessarLoteMigoNoSap(session As Object, ws As Worksheet, startRow As Long, endRow As Long, filtroCentro As String, textoItem As String, modoExec As String, ByRef outDocSap As String, ByRef outMsg As String) As String
    On Error Resume Next
    outDocSap = ""
    outMsg = ""
    
    Dim usrArea As Object, actionCombo As Object, refCombo As Object, bwartField As Object, tblGrid As Object
    Dim r As Long, migoRowIdx As Long, visibleRow As Long, curScroll As Long, visCount As Long
    Dim colMat As Long, colCen As Long, colOrig As Long, colDest As Long, colQtd As Long, colTxt As Long, colOk As Long
    Dim mat As String, cen As String, orig As String, dest As String, qtd As String, serCsv As String
    
    ' 1. Abre /nMIGO limpa
    session.findById("wnd[0]/tbar[0]/okcd").Text = "/nMIGO"
    session.findById("wnd[0]").sendVKey 0
    FecharPopupsSap session
    
    Set usrArea = session.findById("wnd[0]/usr")
    
    ' 2. Garante Transferencia (A08) + Outros/as (R10) + Movimento 311
    Set actionCombo = BuscarControleSap(usrArea, "GODYNPRO-ACTION")
    If Not actionCombo Is Nothing Then
        If actionCombo.Key <> "A08" Then
            actionCombo.Key = "A08"
            session.findById("wnd[0]").sendVKey 0
            Set usrArea = session.findById("wnd[0]/usr")
        End If
    End If
    
    Set refCombo = BuscarControleSap(usrArea, "GODYNPRO-REFDOC")
    If Not refCombo Is Nothing Then
        If refCombo.Key <> "R10" Then
            refCombo.Key = "R10"
            session.findById("wnd[0]").sendVKey 0
            Set usrArea = session.findById("wnd[0]/usr")
        End If
    End If
    
    Set bwartField = BuscarControleSap(usrArea, "GOHEAD-BWART")
    If Not bwartField Is Nothing Then
        If Trim(CStr(bwartField.Text)) <> "311" Then
            bwartField.Text = "311"
            session.findById("wnd[0]").sendVKey 0
            Set usrArea = session.findById("wnd[0]/usr")
        End If
    End If
    
    ' 3. Percorre as linhas agrupadas deste Centro
    migoRowIdx = 0
    For r = startRow To endRow
        cen = UCase(Trim(CStr(ws.Cells(r, "K").Value)))
        If filtroCentro = "TODOS" Or cen = filtroCentro Then
            mat = UCase(Trim(CStr(ws.Cells(r, "J").Value)))
            orig = UCase(Trim(CStr(ws.Cells(r, "L").Value)))
            dest = UCase(Trim(CStr(ws.Cells(r, "M").Value)))
            qtd = Trim(CStr(ws.Cells(r, "N").Value))
            serCsv = Trim(CStr(ws.Cells(r, "O").Value))
            
            Set usrArea = session.findById("wnd[0]/usr")
            Set tblGrid = BuscarControleSap(usrArea, "tblSAPLMIGOTV_GOITEM")
            If tblGrid Is Nothing Then
                outMsg = "Grade de itens da MIGO (tblSAPLMIGOTV_GOITEM) nao encontrada."
                ProcessarLoteMigoNoSap = "ERROR"
                Exit Function
            End If
            
            curScroll = tblGrid.verticalScrollbar.Position
            visCount = tblGrid.VisibleRowCount
            If visCount <= 0 Then visCount = 3
            If migoRowIdx >= (curScroll + visCount) Then
                tblGrid.verticalScrollbar.Position = migoRowIdx
                Set usrArea = session.findById("wnd[0]/usr")
                Set tblGrid = BuscarControleSap(usrArea, "tblSAPLMIGOTV_GOITEM")
                curScroll = tblGrid.verticalScrollbar.Position
            End If
            visibleRow = migoRowIdx - curScroll
            If visibleRow < 0 Then visibleRow = 0
            
            colMat = ResolverColunaMigo(tblGrid, "GOITEM-MAKTX", "GOITEM-MATNR", 1)
            colCen = ResolverColunaMigo(tblGrid, "GOITEM-NAME1", "GOITEM-WERKS", 2)
            colOrig = ResolverColunaMigo(tblGrid, "GOITEM-LGOBE", "GOITEM-LGORT", 3)
            colDest = ResolverColunaMigo(tblGrid, "GOITEM-UMLGO", "", 4)
            colQtd = ResolverColunaMigo(tblGrid, "GOITEM-ERFMG", "", 5)
            colTxt = ResolverColunaMigo(tblGrid, "GOITEM-SGTXT", "", 6)
            colOk = ResolverColunaMigo(tblGrid, "GOITEM-TAKE_IT", "", 7)
            
            If colMat >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colMat)).Text = mat
            If colCen >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colCen)).Text = cen
            If colOrig >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colOrig)).Text = orig
            If colDest >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colDest)).Text = dest
            If colQtd >= 0 Then tblGrid.GetCell(CLng(visibleRow), CLng(colQtd)).Text = qtd
            If colTxt >= 0 And textoItem <> "" Then tblGrid.GetCell(CLng(visibleRow), CLng(colTxt)).Text = textoItem
            
            session.findById("wnd[0]").sendVKey 0
            FecharPopupsSap session
            
            ' Garante que o detalhe aponta para a linha (migoRowIdx + 1)
            Set usrArea = session.findById("wnd[0]/usr")
            Dim detailZeile As Object
            Set detailZeile = BuscarControleSap(usrArea, "GODYNPRO-DETAIL_ZEILE")
            If Not detailZeile Is Nothing Then
                If CLng(Trim(CStr(detailZeile.Text))) <> (migoRowIdx + 1) Then
                    detailZeile.Text = CStr(migoRowIdx + 1)
                    session.findById("wnd[0]").sendVKey 0
                    FecharPopupsSap session
                    Set usrArea = session.findById("wnd[0]/usr")
                End If
            End If
            
            ' Seleciona a aba Nº de Serie (tabpOK_GOITEM_SERIAL)
            Dim serTab As Object
            Set serTab = BuscarControleSap(usrArea, "tabpOK_GOITEM_SERIAL")
            If serTab Is Nothing Then Set serTab = BuscarControleSap(usrArea, "SERIAL")
            If Not serTab Is Nothing Then
                serTab.Select
                FecharPopupsSap session
                Set usrArea = session.findById("wnd[0]/usr")
            End If
            
            ' Preenche os seriais diretamente em tblSAPLMIGOTV_GOSERIAL via GetCell
            Dim sArr As Variant, sIdx As Long, tblSerial As Object, serVisCount As Long, serPageRow As Long
            sArr = Split(serCsv, ",")
            Set tblSerial = BuscarControleSap(usrArea, "tblSAPLMIGOTV_GOSERIAL")
            If Not tblSerial Is Nothing Then
                serVisCount = tblSerial.VisibleRowCount
                If serVisCount <= 0 Then serVisCount = 4
                serPageRow = 0
                For sIdx = 0 To UBound(sArr)
                    If Trim(CStr(sArr(sIdx))) <> "" Then
                        If serPageRow >= serVisCount Then
                            session.findById("wnd[0]").sendVKey 0
                            Set usrArea = session.findById("wnd[0]/usr")
                            Set tblSerial = BuscarControleSap(usrArea, "tblSAPLMIGOTV_GOSERIAL")
                            tblSerial.verticalScrollbar.Position = sIdx
                            Set usrArea = session.findById("wnd[0]/usr")
                            Set tblSerial = BuscarControleSap(usrArea, "tblSAPLMIGOTV_GOSERIAL")
                            serPageRow = sIdx - tblSerial.verticalScrollbar.Position
                            If serPageRow < 0 Then serPageRow = 0
                        End If
                        tblSerial.GetCell(CLng(serPageRow), 0).Text = Trim(CStr(sArr(sIdx)))
                        serPageRow = serPageRow + 1
                    End If
                Next sIdx
                session.findById("wnd[0]").sendVKey 0
                FecharPopupsSap session
            End If
            
            ' Marca Item OK (GOITEM-TAKE_IT)
            Set usrArea = session.findById("wnd[0]/usr")
            Dim chkOk As Object
            Set chkOk = BuscarControleSap(usrArea, "chkGOITEM-TAKE_IT")
            If Not chkOk Is Nothing Then
                chkOk.Selected = True
            Else
                Set tblGrid = BuscarControleSap(usrArea, "tblSAPLMIGOTV_GOITEM")
                If Not tblGrid Is Nothing And colOk >= 0 Then
                    tblGrid.GetCell(CLng(visibleRow), CLng(colOk)).Selected = True
                End If
            End If
            session.findById("wnd[0]").sendVKey 0
            FecharPopupsSap session
            
            migoRowIdx = migoRowIdx + 1
        End If
    Next r
    
    ' 4. Clica em Verificar (btn[7])
    session.findById("wnd[0]/tbar[1]/btn[7]").press
    Dim sbarType As String, sbarText As String
    sbarType = CStr(session.findById("wnd[0]/sbar").MessageType)
    sbarText = CStr(session.findById("wnd[0]/sbar").Text)
    
    If sbarType = "E" Or sbarType = "A" Then
        outMsg = sbarText
        ProcessarLoteMigoNoSap = "ERROR"
        Exit Function
    End If
    
    If InStr(1, modoExec, "APENAS", vbTextCompare) > 0 Then
        outMsg = "Preenchido e verificado na tela do SAP (" & migoRowIdx & " linhas)."
        ProcessarLoteMigoNoSap = "VERIFIED"
        Exit Function
    End If
    
    ' 5. Clica em Registrar / Gravar (btn[23] ou btn[11])
    Err.Clear
    session.findById("wnd[0]/tbar[1]/btn[23]").press
    If Err.Number <> 0 Then
        Err.Clear
        session.findById("wnd[0]/tbar[0]/btn[11]").press
    End If
    FecharPopupsSap session
    
    sbarText = CStr(session.findById("wnd[0]/sbar").Text)
    outDocSap = ExtrairNumeroDocSap(sbarText)
    
    If outDocSap <> "" Then
        outMsg = sbarText
        ProcessarLoteMigoNoSap = "SUCCESS"
    Else
        outMsg = IIf(sbarText <> "", sbarText, "Preenchido na tela; confirme a gravacao no SAP.")
        ProcessarLoteMigoNoSap = "VERIFIED"
    End If
End Function

Public Sub Limpar_Painel_MIGOU()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    ws.Range("B10:G5000").ClearContents
    ws.Range("B10:G5000").Interior.ColorIndex = xlNone
    ws.Range("I10:P5000").ClearContents
    ws.Range("I10:P5000").Interior.ColorIndex = xlNone
    ws.Range("I6").Value = 0
    ws.Range("J6").Value = 0
    ws.Range("L6").Value = "Painel Limpo"
End Sub

Private Function BuscarControleSap(rootObj As Object, targetIdPart As String) As Object
    On Error Resume Next
    Set BuscarControleSap = Nothing
    If rootObj Is Nothing Then Exit Function
    If InStr(1, CStr(rootObj.Id), targetIdPart, vbTextCompare) > 0 Then
        Set BuscarControleSap = rootObj
        Exit Function
    End If
    Dim childCount As Long, idx As Long, childObj As Object, foundObj As Object
    childCount = rootObj.Children.Count
    If Err.Number <> 0 Or childCount = 0 Then
        Err.Clear
        Exit Function
    End If
    For idx = 0 To childCount - 1
        Set childObj = rootObj.Children(CLng(idx))
        Set foundObj = BuscarControleSap(childObj, targetIdPart)
        If Not foundObj Is Nothing Then
            Set BuscarControleSap = foundObj
            Exit Function
        End If
    Next idx
End Function

Private Function ResolverColunaMigo(tblCtrl As Object, primaryTech As String, secondaryTech As String, fallbackPos As Long) As Long
    On Error Resume Next
    Dim c As Long, colName As String
    ResolverColunaMigo = -1
    For c = 0 To tblCtrl.Columns.Count - 1
        colName = UCase(CStr(tblCtrl.Columns(CLng(c)).Name))
        If InStr(1, colName, UCase(primaryTech), vbTextCompare) > 0 Then
            ResolverColunaMigo = c
            Exit Function
        End If
    Next c
    If secondaryTech <> "" Then
        For c = 0 To tblCtrl.Columns.Count - 1
            colName = UCase(CStr(tblCtrl.Columns(CLng(c)).Name))
            If InStr(1, colName, UCase(secondaryTech), vbTextCompare) > 0 Then
                ResolverColunaMigo = c
                Exit Function
            End If
        Next c
    End If
    If fallbackPos >= 0 And fallbackPos < tblCtrl.Columns.Count Then
        ResolverColunaMigo = fallbackPos
    End If
End Function

Private Sub FecharPopupsSap(session As Object)
    On Error Resume Next
    If session.Children.Count > 1 Then
        session.findById("wnd[1]/tbar[0]/btn[0]").press
        If Err.Number <> 0 Then
            Err.Clear
            session.findById("wnd[1]").sendVKey 0
        End If
    End If
    Err.Clear
End Sub

Private Function ExtrairNumeroDocSap(txt As String) As String
    Dim regEx As Object, matches As Object
    Set regEx = CreateObject("VBScript.RegExp")
    regEx.Pattern = "(49[0-9]{8}|[0-9]{10})"
    regEx.Global = False
    If regEx.Test(txt) Then
        Set matches = regEx.Execute(txt)
        ExtrairNumeroDocSap = matches(0).Value
    Else
        ExtrairNumeroDocSap = ""
    End If
End Function`;
}

/**
 * Baixa o Módulo VBA Mestre (.bas) pronto para importar no Excel (Alt+F11 -> Arquivo -> Importar Arquivo)
 */
export function downloadExcelMasterVbaModule(options: MigoEngineOptions): void {
  const code = `Attribute VB_Name = "Modulo_Mestre_MIGOU_MIGO311"\r\n` + generateExcelVbaV2MacroCode(options);
  const blob = new Blob([code], { type: 'text/plain;charset=windows-1252;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Modulo_Mestre_MIGOU_MIGO311.bas';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Gera um Construtor Automático (.vbs) que abre o Microsoft Excel na máquina do usuário,
 * desenha todo o Painel Visual Safira MIGOU, preenche os itens atuais e a Prévia Agrupada da MIGO 311!
 */
export function downloadAutoExcelDashboardBuilderVbs(
  rawItems: TransferItem[],
  groupedLines: MigoGroupedLine[],
  options: MigoEngineOptions
): void {
  const defaultTexto = escapeVbsString(resolveMigoItemText(options));
  const lines: string[] = [];

  lines.push(`' ============================================================================`);
  lines.push(`' CONSTRUTOR AUTOMATICO DO PAINEL EXCEL MIGO 311 - MIGOU (MIDEA CARRIER)`);
  lines.push(`' Abre o Excel, desenha o layout visual e preenche o lote atual ja agrupado!`);
  lines.push(`' ============================================================================`);
  lines.push(`Option Explicit`);
  lines.push(`Dim xlApp, wb, ws`);
  lines.push(`On Error Resume Next`);
  lines.push(`Set xlApp = CreateObject("Excel.Application")`);
  lines.push(`If Err.Number <> 0 Or (xlApp Is Nothing) Then`);
  lines.push(`  MsgBox "Nao foi possivel iniciar o Microsoft Excel nesta maquina.", vbCritical, "MIGOU Excel Builder"`);
  lines.push(`  WScript.Quit 1`);
  lines.push(`End If`);
  lines.push(`On Error GoTo 0`);
  lines.push(`xlApp.Visible = True`);
  lines.push(`xlApp.ScreenUpdating = False`);
  lines.push(`Set wb = xlApp.Workbooks.Add`);
  lines.push(`Set ws = wb.ActiveSheet`);
  lines.push(`ws.Name = "PAINEL_MIGO_311"`);
  lines.push(`ws.Cells.Font.Name = "Segoe UI"`);
  lines.push(`ws.Cells.Font.Size = 10`);
  lines.push(``);
  lines.push(`' 1. Topo Safira MIGOU`);
  lines.push(`ws.Range("A1:P3").Interior.Color = RGB(6, 25, 62)`);
  lines.push(`ws.Range("A1:P1").RowHeight = 8`);
  lines.push(`ws.Range("A2:P2").RowHeight = 28`);
  lines.push(`ws.Range("A3:P3").RowHeight = 18`);
  lines.push(`ws.Range("B2").Value = "MIGOU SAP - CENTRAL MESTRE DE AUTOMACAO MIGO 311 (AGRUPAMENTO INTELIGENTE)"`);
  lines.push(`ws.Range("B2").Font.Color = RGB(255, 255, 255)`);
  lines.push(`ws.Range("B2").Font.Bold = True`);
  lines.push(`ws.Range("B2").Font.Size = 14`);
  lines.push(`ws.Range("B3").Value = "Agrupa automaticamente por Material + Centro + Deposito Origem/Destino - Preenche Numeros de Serie - Captura Doc SAP 49xxxxxxxx"`);
  lines.push(`ws.Range("B3").Font.Color = RGB(186, 230, 253)`);
  lines.push(`ws.Range("B3").Font.Size = 9`);
  lines.push(``);
  lines.push(`' 2. Painel de Parametros e KPIs`);
  lines.push(`ws.Range("B5").Value = "COLUNA TEXTO NA MIGO:"`);
  lines.push(`ws.Range("C5").Value = "MODO DE EXECUCAO NO SAP:"`);
  lines.push(`ws.Range("D5").Value = "DIVISAO POR CENTRO:"`);
  lines.push(`ws.Range("B5:D5").Font.Bold = True`);
  lines.push(`ws.Range("B5:D5").Font.Size = 8`);
  lines.push(`ws.Range("B6").Value = "${defaultTexto}"`);
  lines.push(`ws.Range("C6").Value = "${options.postMode === 'registrar' ? 'VERIFICAR E GRAVAR' : 'APENAS PREENCHER E VERIFICAR'}"`);
  lines.push(`ws.Range("D6").Value = "${options.splitByCentro ? '1 DOC POR CENTRO' : 'TUDO NO MESMO DOC'}"`);
  lines.push(`ws.Range("B6:D6").Interior.Color = RGB(240, 249, 255)`);
  lines.push(`ws.Range("B6:D6").Borders.LineStyle = 1`);
  lines.push(`ws.Range("B6:D6").Font.Bold = True`);
  lines.push(``);
  lines.push(`ws.Range("I5").Value = "TOTAL SERIAIS:"`);
  lines.push(`ws.Range("J5").Value = "LINHAS MIGO:"`);
  lines.push(`ws.Range("K5").Value = "USUARIO SAP:"`);
  lines.push(`ws.Range("L5").Value = "STATUS:"`);
  lines.push(`ws.Range("I5:L5").Font.Bold = True`);
  lines.push(`ws.Range("I5:L5").Font.Size = 8`);
  lines.push(`ws.Range("I6").Value = ${rawItems.length}`);
  lines.push(`ws.Range("J6").Value = ${groupedLines.length}`);
  lines.push(`ws.Range("K6").Value = "-"`);
  lines.push(`ws.Range("L6").Value = "Lote Carregado (${groupedLines.length} linhas)"`);
  lines.push(`ws.Range("I6:L6").Font.Bold = True`);
  lines.push(`ws.Range("I6:L6").Interior.Color = RGB(248, 250, 252)`);
  lines.push(`ws.Range("I6:L6").Borders.LineStyle = 1`);
  lines.push(``);
  lines.push(`' 3. Cabecalhos Tabela 1 (Entrada) e Tabela 2 (Espelho MIGO Agrupado)`);
  lines.push(`ws.Range("B8:G8").Merge`);
  lines.push(`ws.Range("B8").Value = "1. DADOS DE ENTRADA (ITENS DA FILA MIGOU - 1 SERIAL POR LINHA)"`);
  lines.push(`ws.Range("B8").Interior.Color = RGB(0, 72, 142)`);
  lines.push(`ws.Range("B8").Font.Color = RGB(255, 255, 255)`);
  lines.push(`ws.Range("B8").Font.Bold = True`);
  lines.push(`ws.Range("B9").Value = "Material (SKU)"`);
  lines.push(`ws.Range("C9").Value = "Serial (UII)"`);
  lines.push(`ws.Range("D9").Value = "Centro"`);
  lines.push(`ws.Range("E9").Value = "Dep. Origem"`);
  lines.push(`ws.Range("F9").Value = "Dep. Destino"`);
  lines.push(`ws.Range("G9").Value = "Doc SAP / Retorno"`);
  lines.push(`ws.Range("B9:G9").Interior.Color = RGB(224, 242, 254)`);
  lines.push(`ws.Range("B9:G9").Font.Bold = True`);
  lines.push(`ws.Range("B9:G9").Borders.LineStyle = 1`);
  lines.push(``);
  lines.push(`ws.Range("I8:P8").Merge`);
  lines.push(`ws.Range("I8").Value = "2. ESPELHO AGRUPADO DA MIGO 311 (LINHAS CONSOLIDADAS P/ SAP)"`);
  lines.push(`ws.Range("I8").Interior.Color = RGB(6, 25, 62)`);
  lines.push(`ws.Range("I8").Font.Color = RGB(255, 255, 255)`);
  lines.push(`ws.Range("I8").Font.Bold = True`);
  lines.push(`ws.Range("I9").Value = "Linha"`);
  lines.push(`ws.Range("J9").Value = "Txt.brv.material"`);
  lines.push(`ws.Range("K9").Value = "Cen."`);
  lines.push(`ws.Range("L9").Value = "Depósito"`);
  lines.push(`ws.Range("M9").Value = "Depósito RegTran."`);
  lines.push(`ws.Range("N9").Value = "Qtd.em UMR"`);
  lines.push(`ws.Range("O9").Value = "Seriais do Grupo"`);
  lines.push(`ws.Range("P9").Value = "Status SAP / Doc 49x"`);
  lines.push(`ws.Range("I9:P9").Interior.Color = RGB(224, 242, 254)`);
  lines.push(`ws.Range("I9:P9").Font.Bold = True`);
  lines.push(`ws.Range("I9:P9").Borders.LineStyle = 1`);
  lines.push(``);

  // Preenche os itens individuais na Tabela 1 (B10:F...)
  rawItems.forEach((item, idx) => {
    const r = 10 + idx;
    lines.push(`ws.Cells(${r}, "B").Value = "${escapeVbsString(item.material)}"`);
    lines.push(`ws.Cells(${r}, "C").Value = "${escapeVbsString(item.serial)}"`);
    lines.push(`ws.Cells(${r}, "D").Value = "${escapeVbsString(item.centro)}"`);
    lines.push(`ws.Cells(${r}, "E").Value = "${escapeVbsString(item.depositoOrigem)}"`);
    lines.push(`ws.Cells(${r}, "F").Value = "${escapeVbsString(item.depositoDestino)}"`);
    lines.push(`ws.Range("B${r}:G${r}").Borders.LineStyle = 1`);
  });

  // Preenche as linhas agrupadas na Tabela 2 (I10:P...)
  groupedLines.forEach((gLine, idx) => {
    const r = 10 + idx;
    lines.push(`ws.Cells(${r}, "I").Value = ${idx + 1}`);
    lines.push(`ws.Cells(${r}, "J").Value = "${escapeVbsString(gLine.material)}"`);
    lines.push(`ws.Cells(${r}, "K").Value = "${escapeVbsString(gLine.centro)}"`);
    lines.push(`ws.Cells(${r}, "L").Value = "${escapeVbsString(gLine.depositoOrigem)}"`);
    lines.push(`ws.Cells(${r}, "M").Value = "${escapeVbsString(gLine.depositoDestino)}"`);
    lines.push(`ws.Cells(${r}, "N").Value = ${gLine.quantidade}`);
    lines.push(`ws.Cells(${r}, "N").Font.Bold = True`);
    lines.push(`ws.Cells(${r}, "O").Value = "${escapeVbsString(gLine.serials.join(', '))}"`);
    lines.push(`ws.Cells(${r}, "P").Value = "Pronto p/ MIGO (${gLine.quantidade} UIIs)"`);
    lines.push(`ws.Range("I${r}:P${r}").Borders.LineStyle = 1`);
  });

  lines.push(`ws.Columns("B:P").AutoFit`);
  lines.push(`xlApp.ScreenUpdating = True`);
  lines.push(
    `MsgBox "Painel Visual Excel MIGOU criado e preenchido com " & ${rawItems.length} & " seriais agrupados em " & ${groupedLines.length} & " linhas!" & vbCrLf & vbCrLf & "Dica: Para deixar os botoes automaticos permanentes para seus colegas, aperte ALT+F11, cole o Codigo VBA Mestre e salve como .XLSM!", vbInformation, "MIGOU Excel Builder"`
  );

  const blob = new Blob([lines.join('\r\n')], { type: 'text/vbscript;charset=windows-1252;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Abrir_Painel_Excel_MIGOU_MIGO311.vbs`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
