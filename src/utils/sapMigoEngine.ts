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
 * Isso evita que a MIGO abra dezenas de linhas repetidas para o mesmo SKU e trave na gravação.
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

  // Ordena previamente por Centro -> Material -> Origem -> Destino -> FIFO
  const sorted = [...items].sort((a, b) => {
    const keyA = `${a.centro.trim().toUpperCase()}|${a.material.trim().toUpperCase()}|${a.depositoOrigem.trim().toUpperCase()}|${a.depositoDestino.trim().toUpperCase()}`;
    const keyB = `${b.centro.trim().toUpperCase()}|${b.material.trim().toUpperCase()}|${b.depositoOrigem.trim().toUpperCase()}|${b.depositoDestino.trim().toUpperCase()}`;
    const cmp = keyA.localeCompare(keyB, 'pt-BR', { numeric: true });
    if (cmp !== 0) return cmp;
    return String(a.solicitationCode).localeCompare(String(b.solicitationCode), 'pt-BR', { numeric: true });
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

  // Agrupamento em Documentos MIGO (1 Documento por Centro ou 1 Documento Único)
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
      errorMessage: `Não foi possível conectar ao Agente Local MIGOU-SAP (${msg}). Inicie o Conector 1-Click ou utilize o Executor Direto .VBS.`,
    };
  }
}

/**
 * Escapa strings para uso seguro dentro de literais VBScript
 */
function escapeVbsString(val: string): string {
  return (val || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
}

/**
 * Gera o script VBScript (.vbs) autônomo de SAP GUI Scripting para execução na MIGO 311
 * - Verifica obrigatoriamente se o SAP Logon está aberto e logado
 * - Agrupa por Material + Centro + Origem + Destino
 * - Preenche na ordem exata: Txt.brv.material, Cen., Depósito, Depósito RegTran., Qtd.em UMR, Texto
 * - Cola todos os seriais do grupo de uma só vez na aba Nº de Série
 * - Rola automaticamente o TableControl (verticalScrollbar) sem travar na linha 15
 * - Captura o Documento SAP 49xxxxxxxx gerado ou isola erros
 */
export function generateSapGuiVbsScript(
  batches: MigoCentroDocumentBatch[],
  options: MigoEngineOptions,
  silentJsonOutputPath?: string
): string {
  const isSilentBridge = Boolean(silentJsonOutputPath);
  const vbsLines: string[] = [];

  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`' MIGOU SAP MIGO 311 - ROBO DE AUTOMACAO AGRUPADA (EXCLUSIVO TIME MIDEA)`);
  vbsLines.push(`' Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  vbsLines.push(`' Total de Documentos MIGO (Lotes por Centro): ${batches.length}`);
  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`Option Explicit`);
  vbsLines.push(``);
  vbsLines.push(`Dim SapGuiAuto, application, connection, session`);
  vbsLines.push(`Dim wshShell, fso`);
  vbsLines.push(`Set wshShell = CreateObject("WScript.Shell")`);
  vbsLines.push(`Set fso = CreateObject("Scripting.FileSystemObject")`);
  vbsLines.push(``);
  vbsLines.push(`' 1. Verifica se o SAP GUI esta aberto e com usuario Midea logado`);
  vbsLines.push(`On Error Resume Next`);
  vbsLines.push(`Set SapGuiAuto = GetObject("SAPGUI")`);
  vbsLines.push(`If Err.Number <> 0 Or IsEmpty(SapGuiAuto) Or (SapGuiAuto Is Nothing) Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "SAP Logon fechado. Abra o SAP GUI e faca login antes de executar."`);
  } else {
    vbsLines.push(`  MsgBox "O SAP Logon nao esta aberto nesta maquina." & vbCrLf & vbCrLf & "Por favor, abra o SAP GUI e faca login na sua conta Midea antes de disparar a MIGO 311.", vbCritical, "MIGOU SAP 311 - SAP Fechado"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`Set application = SapGuiAuto.GetScriptingEngine`);
  vbsLines.push(`If Err.Number <> 0 Or (application Is Nothing) Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "SAP GUI Scripting desabilitado no cliente SAP."`);
  } else {
    vbsLines.push(`  MsgBox "Nao foi possivel conectar ao motor SAP GUI Scripting." & vbCrLf & "Verifique se a opcao Scripting esta ativa nas Opcoes do SAP Logon.", vbCritical, "MIGOU SAP 311"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`If application.Children.Count = 0 Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "Nenhuma conexao SAP ativa. Faca login no SAP primeiro."`);
  } else {
    vbsLines.push(`  MsgBox "Nenhuma conexao ativa encontrada no SAP Logon." & vbCrLf & "Faca login no ambiente SAP da Midea antes de executar.", vbExclamation, "MIGOU SAP 311 - Login Necessario"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`Set connection = application.Children(0)`);
  vbsLines.push(`If connection.Children.Count = 0 Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "Nenhuma janela de sessao SAP aberta."`);
  } else {
    vbsLines.push(`  MsgBox "Nenhuma sessao SAP aberta. Faca login no SAP.", vbExclamation, "MIGOU SAP 311"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`Set session = connection.Children(0)`);
  vbsLines.push(`Dim currentSapUser`);
  vbsLines.push(`currentSapUser = Trim(CStr(session.Info.User))`);
  vbsLines.push(`If currentSapUser = "" Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "Sessao SAP na tela de login. Autentique-se com seu usuario Midea no SAP."`);
  } else {
    vbsLines.push(`  MsgBox "O SAP esta na tela de login sem usuario autenticado." & vbCrLf & "Faca login no SAP com seu usuario Midea e tente novamente.", vbExclamation, "MIGOU SAP 311 - Usuario Deslogado"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(`On Error GoTo 0`);
  vbsLines.push(``);

  // Funções auxiliares VBScript para localizar controles dinâmicos na MIGO (independente do número da subscreen 0001..0010)
  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`' FUNCOES AUXILIARES DE NAVEGACAO DINAMICA NA MIGO (ANTI-CRASH)`);
  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`Function FindControlByNameRecursive(rootObj, targetIdPart)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Set FindControlByNameRecursive = Nothing`);
  vbsLines.push(`  If rootObj Is Nothing Then Exit Function`);
  vbsLines.push(`  If InStr(1, CStr(rootObj.Id), targetIdPart, vbTextCompare) > 0 Then`);
  vbsLines.push(`    Set FindControlByNameRecursive = rootObj`);
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
  vbsLines.push(`    Set foundObj = FindControlByNameRecursive(childObj, targetIdPart)`);
  vbsLines.push(`    If Not (foundObj Is Nothing) Then`);
  vbsLines.push(`      Set FindControlByNameRecursive = foundObj`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  Next`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);
  vbsLines.push(`Sub CopyTextToClipboard(txtValue)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Dim tempFile, ts`);
  vbsLines.push(`  tempFile = fso.GetSpecialFolder(2) & "\\migou_sap_clip.txt"`);
  vbsLines.push(`  Set ts = fso.CreateTextFile(tempFile, True, False)`);
  vbsLines.push(`  ts.Write txtValue`);
  vbsLines.push(`  ts.Close`);
  vbsLines.push(`  wshShell.Run "cmd.exe /c clip < """ & tempFile & """", 0, True`);
  vbsLines.push(`End Sub`);
  vbsLines.push(``);
  vbsLines.push(`Sub SetGridCellByTechName(tblCtrl, technicalFieldName, visibleRowIndex, cellValue)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Dim cIdx, colObj, cellId`);
  vbsLines.push(`  For cIdx = 0 To tblCtrl.Columns.Count - 1`);
  vbsLines.push(`    Set colObj = tblCtrl.Columns(CLng(cIdx))`);
  vbsLines.push(`    If InStr(1, CStr(colObj.Name), technicalFieldName, vbTextCompare) > 0 Then`);
  vbsLines.push(`      cellId = colObj.Item(CLng(visibleRowIndex)).Id`);
  vbsLines.push(`      session.findById(cellId).Text = CStr(cellValue)`);
  vbsLines.push(`      Exit Sub`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  Next`);
  vbsLines.push(`End Sub`);
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

  // Função que executa 1 Lote (1 Documento MIGO 311 consolidado por Centro)
  vbsLines.push(`Function ExecuteMigoBatch(centroName, matArr, cenArr, origArr, destArr, qtdArr, txtArr, serArr, postModeStr, ByRef outDocSap, ByRef outMsg)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  outDocSap = ""`);
  vbsLines.push(`  outMsg = ""`);
  vbsLines.push(`  Dim usrArea, actionCombo, refCombo, bwartField, detailCloseBtn, tblGrid`);
  vbsLines.push(`  Dim totalRows, r, visibleRow, serialStrip, btnPasteSerial, chkItemOk, serialTab`);
  vbsLines.push(`  totalRows = UBound(matArr)`);
  vbsLines.push(``);
  vbsLines.push(`  ' 1. Abre / Reinicia a transacao MIGO limpa`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[0]/okcd").Text = "/nMIGO"`);
  vbsLines.push(`  session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`  DismissPopupIfPresent`);
  vbsLines.push(``);
  vbsLines.push(`  Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(``);
  vbsLines.push(`  ' 2. Garante A08 (Transferencia) e R10 (Outros/as) e Movimento 311`);
  vbsLines.push(`  Set actionCombo = FindControlByNameRecursive(usrArea, "GODYNPRO-ACTION")`);
  vbsLines.push(`  If Not (actionCombo Is Nothing) Then`);
  vbsLines.push(`    If actionCombo.Key <> "A08" Then`);
  vbsLines.push(`      actionCombo.Key = "A08"`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  Set refCombo = FindControlByNameRecursive(usrArea, "GODYNPRO-REFDOC")`);
  vbsLines.push(`  If Not (refCombo Is Nothing) Then`);
  vbsLines.push(`    If refCombo.Key <> "R10" Then`);
  vbsLines.push(`      refCombo.Key = "R10"`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  Set bwartField = FindControlByNameRecursive(usrArea, "GOHEAD-BWART")`);
  vbsLines.push(`  If Not (bwartField Is Nothing) Then`);
  vbsLines.push(`    If Trim(bwartField.Text) <> "311" Then`);
  vbsLines.push(`      bwartField.Text = "311"`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  ' 3. Preenche cada linha agrupada na Grade da MIGO (Txt.brv.material | Cen. | Deposito | Deposito RegTran. | Qtd.em UMR | Texto)`);
  vbsLines.push(`  For r = 0 To totalRows`);
  vbsLines.push(`    Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    Set tblGrid = FindControlByNameRecursive(usrArea, "tblSAPLMIGOTV_GOITEM")`);
  vbsLines.push(`    If tblGrid Is Nothing Then`);
  vbsLines.push(`      outMsg = "Grade de itens da MIGO (tblSAPLMIGOTV_GOITEM) nao localizada na tela."`);
  vbsLines.push(`      ExecuteMigoBatch = "error"`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Rola a grade da MIGO para manter a linha visivel no topo (evita erro de limite de linhas da macro antiga)`);
  vbsLines.push(`    If r > 0 Then`);
  vbsLines.push(`      tblGrid.verticalScrollbar.position = r`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`      Set tblGrid = FindControlByNameRecursive(usrArea, "tblSAPLMIGOTV_GOITEM")`);
  vbsLines.push(`      visibleRow = r - tblGrid.verticalScrollbar.position`);
  vbsLines.push(`      If visibleRow < 0 Then visibleRow = 0`);
  vbsLines.push(`    Else`);
  vbsLines.push(`      tblGrid.verticalScrollbar.position = 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`      Set tblGrid = FindControlByNameRecursive(usrArea, "tblSAPLMIGOTV_GOITEM")`);
  vbsLines.push(`      visibleRow = 0`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Preenche colunas exatamente como na sua tela MIGO 311`);
  vbsLines.push(`    SetGridCellByTechName tblGrid, "GOITEM-MATNR", visibleRow, matArr(r)`);
  vbsLines.push(`    SetGridCellByTechName tblGrid, "GOITEM-WERKS", visibleRow, cenArr(r)`);
  vbsLines.push(`    SetGridCellByTechName tblGrid, "GOITEM-LGORT", visibleRow, origArr(r)`);
  vbsLines.push(`    SetGridCellByTechName tblGrid, "GOITEM-UMLGO", visibleRow, destArr(r)`);
  vbsLines.push(`    SetGridCellByTechName tblGrid, "GOITEM-ERFMG", visibleRow, qtdArr(r)`);
  vbsLines.push(`    If Trim(CStr(txtArr(r))) <> "" Then`);
  vbsLines.push(`      SetGridCellByTechName tblGrid, "GOITEM-SGTXT", visibleRow, txtArr(r)`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Confirma a linha com Enter para carregar a aba Dados det. -> Nº de Serie da linha atual`);
  vbsLines.push(`    session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`    DismissPopupIfPresent`);
  vbsLines.push(``);
  vbsLines.push(`    ' Seleciona a aba Nº de Serie nos Dados do Item (se disponivel) e cola os seriais do grupo de uma vez`);
  vbsLines.push(`    Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    Dim detailLineField`);
  vbsLines.push(`    Set detailLineField = FindControlByNameRecursive(usrArea, "GODYNPRO-DETAIL_ZEILE")`);
  vbsLines.push(`    If Not (detailLineField Is Nothing) Then`);
  vbsLines.push(`      detailLineField.Text = CStr(r + 1)`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Abre a aba de Numeros de Serie (TABSTRIP)`);
  vbsLines.push(`    Dim serTabObj`);
  vbsLines.push(`    Set serTabObj = FindControlByNameRecursive(usrArea, "TS_GOITEM_SERIAL")`);
  vbsLines.push(`    If Not (serTabObj Is Nothing) Then`);
  vbsLines.push(`      serTabObj.Select`);
  vbsLines.push(`      Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Copia a lista de seriais do grupo para o Clipboard e aciona o botao Colar do SAP (ou preenche linhas GOSERIAL)`);
  vbsLines.push(`    CopyTextToClipboard serArr(r)`);
  vbsLines.push(`    Set btnPasteSerial = FindControlByNameRecursive(usrArea, "MIGO_OK_SER_CLIPBOARD")`);
  vbsLines.push(`    If btnPasteSerial Is Nothing Then`);
  vbsLines.push(`      ' Procura botao de colar seriais na subscreen SAPLMIGO:0335`);
  vbsLines.push(`      Dim subSerArea`);
  vbsLines.push(`      Set subSerArea = FindControlByNameRecursive(usrArea, "SAPLMIGO:0335")`);
  vbsLines.push(`      If Not (subSerArea Is Nothing) Then`);
  vbsLines.push(`        Set btnPasteSerial = FindControlByNameRecursive(subSerArea, "btn[")`);
  vbsLines.push(`      End If`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    If Not (btnPasteSerial Is Nothing) Then`);
  vbsLines.push(`      btnPasteSerial.press`);
  vbsLines.push(`      DismissPopupIfPresent`);
  vbsLines.push(`    Else`);
  vbsLines.push(`      ' Fallback: Preenche diretamente na tabela tblSAPLMIGOTV_GOSERIAL`);
  vbsLines.push(`      Dim tblSerial, sList, sIdx, serRowPos`);
  vbsLines.push(`      sList = Split(serArr(r), vbCrLf)`);
  vbsLines.push(`      For sIdx = 0 To UBound(sList)`);
  vbsLines.push(`        If Trim(sList(sIdx)) <> "" Then`);
  vbsLines.push(`          Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`          Set tblSerial = FindControlByNameRecursive(usrArea, "tblSAPLMIGOTV_GOSERIAL")`);
  vbsLines.push(`          If Not (tblSerial Is Nothing) Then`);
  vbsLines.push(`            If sIdx > 0 Then`);
  vbsLines.push(`              tblSerial.verticalScrollbar.position = sIdx`);
  vbsLines.push(`              Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`              Set tblSerial = FindControlByNameRecursive(usrArea, "tblSAPLMIGOTV_GOSERIAL")`);
  vbsLines.push(`              serRowPos = sIdx - tblSerial.verticalScrollbar.position`);
  vbsLines.push(`              If serRowPos < 0 Then serRowPos = 0`);
  vbsLines.push(`            Else`);
  vbsLines.push(`              serRowPos = 0`);
  vbsLines.push(`            End If`);
  vbsLines.push(`            SetGridCellByTechName tblSerial, "GOSERIAL-SERIALNO", serRowPos, Trim(sList(sIdx))`);
  vbsLines.push(`          End If`);
  vbsLines.push(`        End If`);
  vbsLines.push(`      Next`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Marca Item OK (GOITEM-TAKE_IT)`);
  vbsLines.push(`    Set usrArea = session.findById("wnd[0]/usr")`);
  vbsLines.push(`    Set chkItemOk = FindControlByNameRecursive(usrArea, "GOITEM-TAKE_IT")`);
  vbsLines.push(`    If Not (chkItemOk Is Nothing) Then`);
  vbsLines.push(`      chkItemOk.Selected = True`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  Next`);
  vbsLines.push(``);
  vbsLines.push(`  ' 4. Aciona VERIFICAR (btn[7]) antes de gravar para detectar qualquer trava do SAP`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[1]/btn[7]").press`);
  vbsLines.push(`  Dim sbarType, sbarText`);
  vbsLines.push(`  sbarType = CStr(session.findById("wnd[0]/sbar").MessageType)`);
  vbsLines.push(`  sbarText = CStr(session.findById("wnd[0]/sbar").Text)`);
  vbsLines.push(``);
  vbsLines.push(`  If session.Children.Count > 1 Then`);
  vbsLines.push(`    ' Janela de Log de Mensagens da MIGO surgiu`);
  vbsLines.push(`    If sbarType = "E" Or sbarType = "A" Then`);
  vbsLines.push(`      outMsg = "Alerta SAP na Verificacao (" & centroName & "): " & sbarText`);
  vbsLines.push(`      ExecuteMigoBatch = "error"`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  If sbarType = "E" Or sbarType = "A" Then`);
  vbsLines.push(`    outMsg = "Erro SAP (" & centroName & "): " & sbarText`);
  vbsLines.push(`    ExecuteMigoBatch = "error"`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  ' 5. Se o modo for apenas VERIFICAR, para aqui com a tela pronta para o analista conferir`);
  vbsLines.push(`  If postModeStr = "verificar" Then`);
  vbsLines.push(`    outMsg = "Lote do Centro " & centroName & " preenchido e verificado sem erros na tela da MIGO."`);
  vbsLines.push(`    ExecuteMigoBatch = "verified"`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  ' 6. Aciona REGISTRAR / GRAVAR (btn[11] ou Ctrl+S)`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[0]/btn[11]").press`);
  vbsLines.push(`  If Err.Number <> 0 Then`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(`    session.findById("wnd[0]/tbar[1]/btn[23]").press`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  DismissPopupIfPresent`);
  vbsLines.push(``);
  vbsLines.push(`  sbarType = CStr(session.findById("wnd[0]/sbar").MessageType)`);
  vbsLines.push(`  sbarText = CStr(session.findById("wnd[0]/sbar").Text)`);
  vbsLines.push(`  outDocSap = ExtractSapDocNumber(sbarText)`);
  vbsLines.push(``);
  vbsLines.push(`  If sbarType = "S" Or outDocSap <> "" Then`);
  vbsLines.push(`    outMsg = sbarText`);
  vbsLines.push(`    ExecuteMigoBatch = "success"`);
  vbsLines.push(`  Else`);
  vbsLines.push(`    outMsg = "Retorno SAP (" & centroName & "): " & sbarText`);
  vbsLines.push(`    ExecuteMigoBatch = "error"`);
  vbsLines.push(`  End If`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  // Dados embutidos dos lotes
  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`' EXECUCAO DOS LOTES AGRUPADOS`);
  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`Dim batchStatus, docSapGenerated, batchMessage`);
  vbsLines.push(`Dim summaryReport, jsonResults`);
  vbsLines.push(`summaryReport = ""`);
  vbsLines.push(`jsonResults = ""`);
  vbsLines.push(``);

  batches.forEach((batch, bIdx) => {
    const n = batch.lines.length - 1;
    vbsLines.push(`' --- Lote ${bIdx + 1}: Centro ${batch.centro} (${batch.totalLines} linha(s) agrupada(s), ${batch.totalSerials} seriais) ---`);
    vbsLines.push(`Dim mat_${bIdx}(${n}), cen_${bIdx}(${n}), orig_${bIdx}(${n}), dest_${bIdx}(${n}), qtd_${bIdx}(${n}), txt_${bIdx}(${n}), ser_${bIdx}(${n})`);

    batch.lines.forEach((line, lIdx) => {
      const serialsJoined = line.serials.map((s) => escapeVbsString(s)).join('" & vbCrLf & "');
      vbsLines.push(`mat_${bIdx}(${lIdx}) = "${escapeVbsString(line.material)}"`);
      vbsLines.push(`cen_${bIdx}(${lIdx}) = "${escapeVbsString(line.centro)}"`);
      vbsLines.push(`orig_${bIdx}(${lIdx}) = "${escapeVbsString(line.depositoOrigem)}"`);
      vbsLines.push(`dest_${bIdx}(${lIdx}) = "${escapeVbsString(line.depositoDestino)}"`);
      vbsLines.push(`qtd_${bIdx}(${lIdx}) = "${line.quantidade}"`);
      vbsLines.push(`txt_${bIdx}(${lIdx}) = "${escapeVbsString(line.texto)}"`);
      vbsLines.push(`ser_${bIdx}(${lIdx}) = "${serialsJoined}"`);
    });

    vbsLines.push(
      `batchStatus = ExecuteMigoBatch("${escapeVbsString(batch.centro)}", mat_${bIdx}, cen_${bIdx}, orig_${bIdx}, dest_${bIdx}, qtd_${bIdx}, txt_${bIdx}, ser_${bIdx}, "${options.postMode}", docSapGenerated, batchMessage)`
    );

    const itemIdsJson = JSON.stringify(batch.itemIds).replace(/"/g, '""');
    vbsLines.push(
      `If jsonResults <> "" Then jsonResults = jsonResults & ","`
    );
    vbsLines.push(
      `jsonResults = jsonResults & "{""centro"":""${escapeVbsString(batch.centro)}"",""status"":""" & batchStatus & """,""docSap"":""" & docSapGenerated & """,""message"":""" & Replace(batchMessage, """", "'") & """,""serialCount"":${batch.totalSerials},""itemIds"":${itemIdsJson}}"`
    );
    vbsLines.push(
      `summaryReport = summaryReport & "Centro ${escapeVbsString(batch.centro)} (${batch.totalSerials} seriais em ${batch.totalLines} linha(s)): " & UCase(batchStatus) & " -> Doc SAP: " & IIfStr(docSapGenerated <> "", docSapGenerated, batchMessage) & vbCrLf`
    );
    vbsLines.push(``);
  });

  vbsLines.push(`Function IIfStr(cond, valTrue, valFalse)`);
  vbsLines.push(`  If cond Then IIfStr = valTrue Else IIfStr = valFalse`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  if (isSilentBridge) {
    vbsLines.push(`Dim outTs`);
    vbsLines.push(`Set outTs = fso.CreateTextFile("${escapeVbsString(silentJsonOutputPath!)}", True, False)`);
    vbsLines.push(`outTs.Write "{""ok"":true,""results"":[" & jsonResults & "]}"`);
    vbsLines.push(`outTs.Close`);
  } else {
    vbsLines.push(`CopyTextToClipboard summaryReport`);
    vbsLines.push(
      `MsgBox "Execucao MIGO 311 Finalizada pelo MIGOU!" & vbCrLf & "Usuario SAP: " & currentSapUser & vbCrLf & vbCrLf & summaryReport & vbCrLf & "(O resumo dos Documentos SAP foi copiado para sua Area de Transferencia)", vbInformation, "MIGOU SAP MIGO 311 - Concluido"`
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
 * Um arquivo .bat leve com PowerShell nativo que cria a ponte entre o navegador (MIGOU) e o SAP Logon aberto na máquina.
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
 * Gera o código VBA V2 Otimizado para a planilha Excel (.xlsm)
 * Agrupa automaticamente por Material + Centro + Origem + Destino antes de ir na MIGO 311
 */
export function generateExcelVbaV2MacroCode(options: MigoEngineOptions): string {
  const defaultTexto = resolveMigoItemText(options);
  return `' =======================================================================================
' MACRO VBA V2 MIGOU - SAP MIGO 311 COM AGRUPAMENTO AUTOMATICO POR MATERIAL E CENTRO
' Substitui a macro antiga do arquivo .xlsm eliminando travamentos de linhas e de scroll.
' Colunas esperadas na aba ativa do Excel (A partir da Linha 2):
' Coluna A: Material | Coluna B: Serial (UII) | Coluna C: Centro | Coluna D: Dep. Origem | Coluna E: Dep. Destino
' =======================================================================================
Option Explicit

Public Sub Executar_MIGO_311_Agrupada_MIGOU()
    Dim SapGuiAuto As Object, app As Object, conn As Object, session As Object
    Dim ws As Worksheet, lastRow As Long, r As Long
    Dim dictGroups As Object, dictSerials As Object
    Dim mat As String, ser As String, cen As String, orig As String, dest As String
    Dim groupKey As String
    
    On Error Resume Next
    Set SapGuiAuto = GetObject("SAPGUI")
    If Err.Number <> 0 Or SapGuiAuto Is Nothing Then
        MsgBox "O SAP Logon nao esta aberto! Faca login no SAP com seu usuario Midea antes de rodar a macro.", vbCritical, "MIGOU SAP 311"
        Exit Sub
    End If
    Set app = SapGuiAuto.GetScriptingEngine
    Set conn = app.Children(0)
    Set session = conn.Children(0)
    If session Is Nothing Or Trim(CStr(session.Info.User)) = "" Then
        MsgBox "Nenhuma sessao SAP logada encontrada! Autentique-se no SAP primeiro.", vbCritical, "MIGOU SAP 311"
        Exit Sub
    End If
    On Error GoTo 0
    
    Set ws = ActiveSheet
    lastRow = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row
    If lastRow < 2 Then
        MsgBox "Nenhum item encontrado na planilha (preencha a partir da linha 2).", vbExclamation, "MIGOU SAP 311"
        Exit Sub
    End If
    
    ' 1. Agrupa automaticamente por Centro + Material + Dep. Origem + Dep. Destino
    Set dictGroups = CreateObject("Scripting.Dictionary")
    Set dictSerials = CreateObject("Scripting.Dictionary")
    
    For r = 2 To lastRow
        mat = UCase(Trim(CStr(ws.Cells(r, 1).Value)))
        ser = UCase(Trim(CStr(ws.Cells(r, 2).Value)))
        cen = UCase(Trim(CStr(ws.Cells(r, 3).Value)))
        orig = UCase(Trim(CStr(ws.Cells(r, 4).Value)))
        dest = UCase(Trim(CStr(ws.Cells(r, 5).Value)))
        
        If mat <> "" And ser <> "" And cen <> "" And orig <> "" And dest <> "" Then
            groupKey = cen & "|" & mat & "|" & orig & "|" & dest
            If Not dictGroups.Exists(groupKey) Then
                dictGroups.Add groupKey, 1
                dictSerials.Add groupKey, ser
            Else
                dictGroups(groupKey) = CLng(dictGroups(groupKey)) + 1
                dictSerials(groupKey) = dictSerials(groupKey) & vbCrLf & ser
            End If
        End If
    Next r
    
    If dictGroups.Count = 0 Then
        MsgBox "Nenhuma linha valida encontrada para processar.", vbExclamation, "MIGOU SAP 311"
        Exit Sub
    End If
    
    ' 2. Inicia /nMIGO limpa no SAP
    session.findById("wnd[0]/tbar[0]/okcd").Text = "/nMIGO"
    session.findById("wnd[0]").sendVKey 0
    
    Dim keys As Variant, idx As Long, parts As Variant
    Dim usrArea As Object, tblGrid As Object, visibleRow As Long
    keys = dictGroups.Keys
    
    For idx = 0 To dictGroups.Count - 1
        parts = Split(CStr(keys(idx)), "|")
        cen = parts(0)
        mat = parts(1)
        orig = parts(2)
        dest = parts(3)
        
        Set usrArea = session.findById("wnd[0]/usr")
        Set tblGrid = FindMigoControl(usrArea, "tblSAPLMIGOTV_GOITEM")
        
        If idx > 0 Then
            tblGrid.verticalScrollbar.Position = idx
            Set usrArea = session.findById("wnd[0]/usr")
            Set tblGrid = FindMigoControl(usrArea, "tblSAPLMIGOTV_GOITEM")
            visibleRow = idx - tblGrid.verticalScrollbar.Position
        Else
            tblGrid.verticalScrollbar.Position = 0
            visibleRow = 0
        End If
        
        ' Preenche Txt.brv.material | Cen. | Deposito | Deposito RegTran. | Qtd.em UMR | Texto
        SetMigoCell session, tblGrid, "GOITEM-MATNR", visibleRow, mat
        SetMigoCell session, tblGrid, "GOITEM-WERKS", visibleRow, cen
        SetMigoCell session, tblGrid, "GOITEM-LGORT", visibleRow, orig
        SetMigoCell session, tblGrid, "GOITEM-UMLGO", visibleRow, dest
        SetMigoCell session, tblGrid, "GOITEM-ERFMG", visibleRow, CStr(dictGroups(keys(idx)))
        ${
          defaultTexto
            ? `SetMigoCell session, tblGrid, "GOITEM-SGTXT", visibleRow, "${defaultTexto}"`
            : `' Coluna Texto opcional deixada em branco para maior velocidade`
        }
        
        session.findById("wnd[0]").sendVKey 0
        
        ' Cola os seriais consolidados da linha na aba Nº de Serie
        CopyStringToClipboard CStr(dictSerials(keys(idx)))
        Set usrArea = session.findById("wnd[0]/usr")
        Dim btnPaste As Object
        Set btnPaste = FindMigoControl(usrArea, "MIGO_OK_SER_CLIPBOARD")
        If Not btnPaste Is Nothing Then btnPaste.press
        
        Dim chkOk As Object
        Set chkOk = FindMigoControl(usrArea, "GOITEM-TAKE_IT")
        If Not chkOk Is Nothing Then chkOk.Selected = True
    Next idx
    
    ' 3. Verifica o documento na MIGO
    session.findById("wnd[0]/tbar[1]/btn[7]").press
    MsgBox "MIGO 311 preenchida e agrupada com sucesso (" & dictGroups.Count & " linhas consolidadas)!", vbInformation, "MIGOU SAP 311"
End Sub

Private Function FindMigoControl(rootObj As Object, idPart As String) As Object
    On Error Resume Next
    Set FindMigoControl = Nothing
    If InStr(1, CStr(rootObj.Id), idPart, vbTextCompare) > 0 Then
        Set FindMigoControl = rootObj
        Exit Function
    End If
    Dim i As Long, childObj As Object, foundObj As Object
    For i = 0 To rootObj.Children.Count - 1
        Set childObj = rootObj.Children(CLng(i))
        Set foundObj = FindMigoControl(childObj, idPart)
        If Not foundObj Is Nothing Then
            Set FindMigoControl = foundObj
            Exit Function
        End If
    Next i
End Function

Private Sub SetMigoCell(session As Object, tblCtrl As Object, colTechName As String, rowIdx As Long, valStr As String)
    On Error Resume Next
    Dim c As Long, colObj As Object
    For c = 0 To tblCtrl.Columns.Count - 1
        Set colObj = tblCtrl.Columns(CLng(c))
        If InStr(1, CStr(colObj.Name), colTechName, vbTextCompare) > 0 Then
            session.findById(colObj.Item(CLng(rowIdx)).Id).Text = valStr
            Exit Sub
        End If
    Next c
End Sub

Private Sub CopyStringToClipboard(txt As String)
    Dim objHTML As Object
    Set objHTML = CreateObject("htmlfile")
    objHTML.ParentWindow.ClipboardData.SetData "text", txt
End Sub`;
}
