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
 * Formata os itens JÁ ORDENADOS E SEM DUPLICIDADE para colar diretamente na célula K2
 * da aba `Planilha1 (311)` da planilha `BASE MIGO.xlsm` (Colunas K a R):
 * Col K (11): Material | Col L (12): Qtd (1) | Col M (13): Centro | Col N (14): Dep. Origem |
 * Col O (15): Vazio | Col P (16): Dep. Destino | Col Q (17): Texto | Col R (18): Serial UII
 */
export function formatForBaseMigo311ColumnsKR(
  groupedLines: MigoGroupedLine[],
  options: MigoEngineOptions
): string {
  const textoVal = resolveMigoItemText(options);
  const rows: string[] = [];

  for (const group of groupedLines) {
    for (const serial of group.serials) {
      rows.push(
        [
          group.material,       // Col K (11) - Material
          '1',                  // Col L (12) - Quantidade unitária (somada pela macro)
          group.centro,         // Col M (13) - Centro Origem
          group.depositoOrigem, // Col N (14) - Depósito Origem
          '',                   // Col O (15) - Coluna intermediária da planilha 311
          group.depositoDestino,// Col P (16) - Depósito Destino
          textoVal,             // Col Q (17) - Texto
          serial,               // Col R (18) - Serial UII
        ].join('\t')
      );
    }
  }

  return rows.join('\r\n');
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
 * Gera o script VBScript (.vbs) V4 CALIBRADO COM OS OBJETOS REAIS DO SAP MIDEA (BASE MIGO.xlsm)
 * Arquitetura idêntica ao `MIGO_311_3` da Midea + Melhorias de Agrupamento e Segurança:
 * 1. Cabeçalho via `FindByNameEx("GODYNPRO-ACTION", 34).Key = "A08"`, `FindByNameEx("GODYNPRO-REFDOC", 34).Key = "R10"`, `FindByNameEx("GODEFAULT_TV-BWART", 32).Text = "311"`.
 * 2. Recolhe Cabeçalho e Detalhe (`MIGO_OK_HEADER_CLOSE` + `MIGO_OK_DETAIL_CLOSE`) antes de preencher a grade `SAPLMIGOTV_GOITEM` (tipo 80).
 * 3. Preenche `cur_row = FindByNameEx("SAPLMIGOTV_GOITEM", 80).Rows(CurrentRow)` usando os nomes técnicos exatos da Midea:
 *    - `GOITEM-MAKTX` (com trava `material_assigned = False` para preencher apenas o primeiro campo de material)
 *    - `GOITEM-TAKE_IT` (`.Selected = True`)
 *    - `GOITEM-ERFMG` (Quantidade consolidada do grupo)
 *    - `GOITEM-LGOBE` (Depósito Origem)
 *    - `GOITEM-NAME1` (Centro Origem)
 *    - `GOITEM-SGTXT` (Texto)
 *    - `GOITEM-UMLGOBE` (Depósito Destino — campo real da Midea!)
 * 4. Reabre o Detalhe (`MIGO_OK_DETAIL_OPEN`) e injeta os UIIs na subscreen customizada `SAPLMIGO:0360`:
 *    - `tabpOK_GOITEM_SERIAL` -> `btnOK_SER_SEARCH` -> `btn%_SO_UII_%_APP_%-VALU_PUSH`
 *    - Copia apenas os UIIs daquele grupo para o Clipboard -> `wnd[1]/tbar[0]/btn[24]` (Colar) -> `wnd[1]/tbar[0]/btn[8]` (Confirmar)
 *    - `wnd[0]/tbar[1]/btn[8]` (Executar busca UII) -> se `Qtd > 1`: `sendVKey 5` (Selecionar tudo) + `wnd[0]/tbar[1]/btn[47]` (Adotar UIIs) -> `btnOK_NEXT_ITEM`.
 */
export function generateSapGuiVbsScript(
  batches: MigoCentroDocumentBatch[],
  options: MigoEngineOptions,
  silentJsonOutputPath?: string
): string {
  const isSilentBridge = Boolean(silentJsonOutputPath);
  const vbsLines: string[] = [];

  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`' MIGOU SAP MIGO 311 - ROBO DE AUTOMACAO V4 (MOTOR OFICIAL MIDEA SAPLMIGO:0360 UII)`);
  vbsLines.push(`' Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  vbsLines.push(`' ============================================================================`);
  vbsLines.push(`Option Explicit`);
  vbsLines.push(``);
  vbsLines.push(`Dim SapGuiAuto, SAPApp, SAPCon, session, dummy`);
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
  vbsLines.push(`Set SAPApp = SapGuiAuto.GetScriptingEngine`);
  vbsLines.push(`If Err.Number <> 0 Or (SAPApp Is Nothing) Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "SAP GUI Scripting desabilitado nas opcoes do SAP Logon."`);
  } else {
    vbsLines.push(`  MsgBox "Nao foi possivel conectar ao SAP GUI Scripting." & vbCrLf & "Verifique se o Scripting esta habilitado nas Opcoes do SAP Logon.", vbCritical, "MIGOU SAP 311"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`If SAPApp.Children.Count = 0 Then`);
  if (isSilentBridge) {
    vbsLines.push(`  WriteBridgeError "${escapeVbsString(silentJsonOutputPath!)}", "Nenhuma conexao SAP ativa. Faca login no SAP primeiro."`);
  } else {
    vbsLines.push(`  MsgBox "Nenhuma conexao ativa no SAP Logon. Faca login no SAP.", vbExclamation, "MIGOU SAP 311"`);
  }
  vbsLines.push(`  WScript.Quit 1`);
  vbsLines.push(`End If`);
  vbsLines.push(``);
  vbsLines.push(`Set SAPCon = SAPApp.Children(0)`);
  vbsLines.push(`Set session = SAPCon.Children(0)`);
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

  // Função para copiar os UIIs do grupo atual para o Clipboard do Windows antes do btn[24]
  vbsLines.push(`Sub PutSerialsInClipboard(serialsPipeStr)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Dim clipText, tmpFile, ts`);
  vbsLines.push(`  clipText = Replace(CStr(serialsPipeStr), "|", vbCrLf)`);
  vbsLines.push(`  tmpFile = wshShell.ExpandEnvironmentStrings("%TEMP%") & "\\migou_uii_batch.txt"`);
  vbsLines.push(`  Set ts = fso.CreateTextFile(tmpFile, True, False)`);
  vbsLines.push(`  ts.Write clipText`);
  vbsLines.push(`  ts.Close`);
  vbsLines.push(`  wshShell.Run "cmd.exe /c clip < """ & tmpFile & """", 0, True`);
  vbsLines.push(`  Err.Clear`);
  vbsLines.push(`End Sub`);
  vbsLines.push(``);

  // Busca flexível para os botões da aba Serial (caso SAPLMIGO:0009 mude para 0007/0008)
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

  vbsLines.push(`Function ExtractSapDocNumber(statusText)`);
  vbsLines.push(`  Dim regEx, matches`);
  vbsLines.push(`  Set regEx = New RegExp`);
  vbsLines.push(`  regEx.Pattern = "(49[0-9]{8}|50[0-9]{8}|[0-9]{10})"`);
  vbsLines.push(`  regEx.Global = False`);
  vbsLines.push(`  If regEx.Test(statusText) Then`);
  vbsLines.push(`    Set matches = regEx.Execute(statusText)`);
  vbsLines.push(`    ExtractSapDocNumber = matches(0).Value`);
  vbsLines.push(`  Else`);
  vbsLines.push(`    ExtractSapDocNumber = ""`);
  vbsLines.push(`  End If`);
  vbsLines.push(`End Function`);
  vbsLines.push(``);

  vbsLines.push(`Sub WriteBridgeError(outPath, errMsg)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  Dim ts`);
  vbsLines.push(`  Set ts = fso.CreateTextFile(outPath, True, False)`);
  vbsLines.push(`  ts.Write "{""ok"":false,""errorMessage"":""" & Replace(errMsg, """", "'") & """,""results"":[]}"`);
  vbsLines.push(`  ts.Close`);
  vbsLines.push(`End Sub`);
  vbsLines.push(``);

  // Função Principal que executa 1 Documento MIGO 311 Agrupado usando os comandos exatos de MIGO_311_3
  vbsLines.push(`Function ExecuteMigoBatch(centroName, matArr, cenArr, origArr, destArr, qtdArr, txtArr, serArr, postModeStr, ByRef outDocSap, ByRef outMsg)`);
  vbsLines.push(`  On Error Resume Next`);
  vbsLines.push(`  outDocSap = ""`);
  vbsLines.push(`  outMsg = ""`);
  vbsLines.push(`  Dim total_items, i, ii, CurrentRow, pageSize, cur_row, col_count`);
  vbsLines.push(`  Dim material_assigned, special_stock_assigned, item_index, current_quantity`);
  vbsLines.push(`  Dim serTabObj, btnSerSearchObj, btnNextItemObj, error_result, result, MessageType`);
  vbsLines.push(`  total_items = UBound(matArr) + 1`);
  vbsLines.push(``);
  vbsLines.push(`  SAPApp.AllowSystemMessages = False`);
  vbsLines.push(`  SAPApp.HistoryEnabled = False`);
  vbsLines.push(`  dummy = session.LockSessionUI()`);
  vbsLines.push(``);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  ' PASSO 1: ABRIR A MIGO E CONFIGURAR CABECALHO (A08 + R10 + GODEFAULT_TV-BWART 311)`);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[0]/okcd").Text = "/nmigo"`);
  vbsLines.push(`  session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(``);
  vbsLines.push(`  session.findById("wnd[0]/usr").FindByNameEx("GODYNPRO-ACTION", 34).Key = "A08"`);
  vbsLines.push(`  session.findById("wnd[0]/usr/").FindByNameEx("GODYNPRO-REFDOC", 34).Key = "R10"`);
  vbsLines.push(`  If session.findById("wnd[0]/usr").FindByNameEx("GODEFAULT_TV-BWART", 32).Text <> "311" Then`);
  vbsLines.push(`    session.findById("wnd[0]/usr").FindByNameEx("GODEFAULT_TV-BWART", 32).Text = "311"`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(``);
  vbsLines.push(`  If session.findById("wnd[0]/sbar").MessageType = "E" Then`);
  vbsLines.push(`    outMsg = "Erro ao iniciar MIGO (" & centroName & "): " & session.findById("wnd[0]/sbar").Text`);
  vbsLines.push(`    SAPApp.HistoryEnabled = True`);
  vbsLines.push(`    dummy = session.UnlockSessionUI()`);
  vbsLines.push(`    ExecuteMigoBatch = "error"`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  If session.ActiveWindow.Name = "wnd[1]" Then session.findById("wnd[1]").Close`);
  vbsLines.push(``);
  vbsLines.push(`  session.SendCommand ("MIGO_OK_HEADER_OPEN")`);
  vbsLines.push(`  session.SendCommand ("MIGO_OK_HEADER_CLOSE")`);
  vbsLines.push(`  session.SendCommand ("MIGO_OK_DETAIL_CLOSE")`);
  vbsLines.push(``);
  vbsLines.push(`  pageSize = session.findById("wnd[0]/usr").FindByNameEx("SAPLMIGOTV_GOITEM", 80).verticalScrollbar.pageSize`);
  vbsLines.push(`  If Err.Number <> 0 Or pageSize <= 0 Then pageSize = 10`);
  vbsLines.push(`  Err.Clear`);
  vbsLines.push(`  session.findById("wnd[0]/usr").FindByNameEx("SAPLMIGOTV_GOITEM", 80).verticalScrollbar.Position = 0`);
  vbsLines.push(``);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  ' PASSO 2: INSERIR OS ITENS AGRUPADOS NA GRADE (SAPLMIGOTV_GOITEM)`);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  CurrentRow = 0`);
  vbsLines.push(`  For i = 0 To total_items - 1`);
  vbsLines.push(`    If CurrentRow >= pageSize Then`);
  vbsLines.push(`      session.findById("wnd[0]/tbar[0]/btn[0]").press`);
  vbsLines.push(`      session.findById("wnd[0]/tbar[0]/btn[82]").press`);
  vbsLines.push(`      CurrentRow = 1`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    Set cur_row = session.findById("wnd[0]/usr").FindByNameEx("SAPLMIGOTV_GOITEM", 80).Rows(CurrentRow)`);
  vbsLines.push(`    If cur_row Is Nothing Then`);
  vbsLines.push(`      outMsg = "Nao foi possivel acessar a linha " & (CurrentRow + 1) & " da grade SAPLMIGOTV_GOITEM."`);
  vbsLines.push(`      SAPApp.HistoryEnabled = True`);
  vbsLines.push(`      dummy = session.UnlockSessionUI()`);
  vbsLines.push(`      ExecuteMigoBatch = "error"`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    col_count = 0`);
  vbsLines.push(`    material_assigned = False`);
  vbsLines.push(`    special_stock_assigned = False`);
  vbsLines.push(``);
  vbsLines.push(`    For ii = 0 To cur_row.Count - 1`);
  vbsLines.push(`      col_count = col_count + 1`);
  vbsLines.push(`      If cur_row(ii + 0).Name = "GOITEM-MAKTX" And material_assigned = False Then`);
  vbsLines.push(`        material_assigned = True`);
  vbsLines.push(`        cur_row(ii + 0).Text = CStr(matArr(i))`);
  vbsLines.push(`      ElseIf cur_row(ii + 0).Name = "GOITEM-TAKE_IT" Then`);
  vbsLines.push(`        cur_row(ii + 0).Selected = True`);
  vbsLines.push(`      ElseIf cur_row(ii + 0).Name = "GOITEM-ERFMG" Then`);
  vbsLines.push(`        cur_row(ii + 0).Text = CStr(qtdArr(i))`);
  vbsLines.push(`      ElseIf cur_row(ii + 0).Name = "GOITEM-LGOBE" Then`);
  vbsLines.push(`        cur_row(ii + 0).Text = CStr(origArr(i))`);
  vbsLines.push(`      ElseIf cur_row(ii + 0).Name = "GOITEM-NAME1" Then`);
  vbsLines.push(`        cur_row(ii + 0).Text = CStr(cenArr(i))`);
  vbsLines.push(`      ElseIf cur_row(ii + 0).Name = "GOITEM-SOBKZ" And special_stock_assigned = False Then`);
  vbsLines.push(`        special_stock_assigned = True`);
  vbsLines.push(`      ElseIf cur_row(ii + 0).Name = "GOITEM-SGTXT" Then`);
  vbsLines.push(`        cur_row(ii + 0).Text = CStr(txtArr(i))`);
  vbsLines.push(`      ElseIf cur_row(ii + 0).Name = "GOITEM-UMLGOBE" Then`);
  vbsLines.push(`        cur_row(ii + 0).Text = CStr(destArr(i))`);
  vbsLines.push(`      Else`);
  vbsLines.push(`        col_count = col_count - 1`);
  vbsLines.push(`      End If`);
  vbsLines.push(`      If col_count > 7 Then Exit For`);
  vbsLines.push(`    Next`);
  vbsLines.push(``);
  vbsLines.push(`    Set cur_row = Nothing`);
  vbsLines.push(`    CurrentRow = CurrentRow + 1`);
  vbsLines.push(`  Next`);
  vbsLines.push(``);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  ' PASSO 3: REABRIR DETALHE E INSERIR OS SERIAIS UII (SAPLMIGO:0360)`);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  session.SendCommand ("MIGO_OK_DETAIL_OPEN")`);
  vbsLines.push(``);
  vbsLines.push(`  For item_index = 1 To total_items`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(`    session.findById("wnd[0]/usr/ssubSUB_MAIN_CARRIER:SAPLMIGO:0009/subSUB_ITEMDETAIL:SAPLMIGO:0303/subSUB_DETAIL:SAPLMIGO:0305/tabsTS_GOITEM/tabpOK_GOITEM_SERIAL").Select`);
  vbsLines.push(`    If Err.Number <> 0 Then`);
  vbsLines.push(`      Err.Clear`);
  vbsLines.push(`      Set serTabObj = FindControlByIdPart(session.findById("wnd[0]/usr"), "tabpOK_GOITEM_SERIAL")`);
  vbsLines.push(`      If Not (serTabObj Is Nothing) Then serTabObj.Select`);
  vbsLines.push(`    End If`);
  vbsLines.push(`    If Err.Number <> 0 Then`);
  vbsLines.push(`      outMsg = "Erro ao selecionar aba Serial - Item " & item_index & " (" & matArr(item_index - 1) & "): " & Err.Description`);
  vbsLines.push(`      SAPApp.HistoryEnabled = True`);
  vbsLines.push(`      dummy = session.UnlockSessionUI()`);
  vbsLines.push(`      ExecuteMigoBatch = "error"`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Pressiona btnOK_SER_SEARCH na subscreen SAPLMIGO:0360`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(`    session.findById("wnd[0]/usr/ssubSUB_MAIN_CARRIER:SAPLMIGO:0009/subSUB_ITEMDETAIL:SAPLMIGO:0303/subSUB_DETAIL:SAPLMIGO:0305/tabsTS_GOITEM/tabpOK_GOITEM_SERIAL/ssubSUB_TS_GOITEM_SERIAL:SAPLMIGO:0360/btnOK_SER_SEARCH").press`);
  vbsLines.push(`    If Err.Number <> 0 Then`);
  vbsLines.push(`      Err.Clear`);
  vbsLines.push(`      Set btnSerSearchObj = FindControlByIdPart(session.findById("wnd[0]/usr"), "btnOK_SER_SEARCH")`);
  vbsLines.push(`      If Not (btnSerSearchObj Is Nothing) Then btnSerSearchObj.press`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    ' Abre selecao multipla de UII (SO_UII)`);
  vbsLines.push(`    session.findById("wnd[0]/usr/btn%_SO_UII_%_APP_%-VALU_PUSH").press`);
  vbsLines.push(``);
  vbsLines.push(`    ' Copia os UIIs exclusivos deste item agrupado para o Clipboard e cola (btn[24])`);
  vbsLines.push(`    PutSerialsInClipboard serArr(item_index - 1)`);
  vbsLines.push(`    session.findById("wnd[1]/tbar[0]/btn[24]").press`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(`    session.findById("wnd[1]/tbar[0]/btn[8]").press`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(``);
  vbsLines.push(`    If session.findById("wnd[0]/sbar").MessageType = "E" Then`);
  vbsLines.push(`      outMsg = "Erro na busca serial UII - Item " & item_index & " (" & matArr(item_index - 1) & "): " & session.findById("wnd[0]/sbar").Text`);
  vbsLines.push(`      SAPApp.HistoryEnabled = True`);
  vbsLines.push(`      dummy = session.UnlockSessionUI()`);
  vbsLines.push(`      ExecuteMigoBatch = "error"`);
  vbsLines.push(`      Exit Function`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    current_quantity = CLng(qtdArr(item_index - 1))`);
  vbsLines.push(`    session.findById("wnd[0]/tbar[1]/btn[8]").press`);
  vbsLines.push(``);
  vbsLines.push(`    If current_quantity > 1 Then`);
  vbsLines.push(`      session.findById("wnd[0]").sendVKey 5`);
  vbsLines.push(`      session.findById("wnd[0]/tbar[1]/btn[47]").press`);
  vbsLines.push(`    End If`);
  vbsLines.push(``);
  vbsLines.push(`    If item_index < total_items Then`);
  vbsLines.push(`      Err.Clear`);
  vbsLines.push(`      session.findById("wnd[0]/usr/ssubSUB_MAIN_CARRIER:SAPLMIGO:0009/subSUB_ITEMDETAIL:SAPLMIGO:0303/subSUB_DETAIL:SAPLMIGO:0305/btnOK_NEXT_ITEM").press`);
  vbsLines.push(`      If Err.Number <> 0 Then`);
  vbsLines.push(`        Err.Clear`);
  vbsLines.push(`        Set btnNextItemObj = FindControlByIdPart(session.findById("wnd[0]/usr"), "btnOK_NEXT_ITEM")`);
  vbsLines.push(`        If Not (btnNextItemObj Is Nothing) Then btnNextItemObj.press`);
  vbsLines.push(`      End If`);
  vbsLines.push(`    End If`);
  vbsLines.push(`  Next`);
  vbsLines.push(``);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  ' PASSO 4: FINALIZACAO (MODO VERIFICAR NA TELA OU SALVAR DOC btn[11])`);
  vbsLines.push(`  ' =========================================================================`);
  vbsLines.push(`  If postModeStr = "verificar" Then`);
  vbsLines.push(`    SAPApp.HistoryEnabled = True`);
  vbsLines.push(`    dummy = session.UnlockSessionUI()`);
  vbsLines.push(`    outMsg = "Preenchimento de " & total_items & " item(ns) agrupado(s) e UIIs concluido na MIGO! Revise na tela do SAP e clique em Salvar."`);
  vbsLines.push(`    ExecuteMigoBatch = "verified"`);
  vbsLines.push(`    Exit Function`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  ' Salvar documento no SAP Midea (wnd[0]/tbar[0]/btn[11]) exatamente como na BASE MIGO.xlsm`);
  vbsLines.push(`  error_result = ""`);
  vbsLines.push(`  session.findById("wnd[0]/tbar[0]/btn[11]").press`);
  vbsLines.push(`  MessageType = session.findById("wnd[0]/sbar").MessageType`);
  vbsLines.push(`  If MessageType = "W" Then`);
  vbsLines.push(`    session.findById("wnd[0]").sendVKey 0`);
  vbsLines.push(`  End If`);
  vbsLines.push(``);
  vbsLines.push(`  Err.Clear`);
  vbsLines.push(`  session.findById("wnd[1]/tbar[0]/btn[0]")`);
  vbsLines.push(`  If Err.Number = 0 Then`);
  vbsLines.push(`    session.findById("wnd[1]/tbar[0]/btn[18]").press`);
  vbsLines.push(`    session.findById("wnd[1]/tbar[0]/btn[19]").press`);
  vbsLines.push(`    Err.Clear`);
  vbsLines.push(`    session.findById("wnd[1]/usr/lbl[5,3]")`);
  vbsLines.push(`    If Err.Number = 0 Then`);
  vbsLines.push(`      error_result = "Item " & session.findById("wnd[1]/usr/lbl[5,3]").Text & ": " & session.findById("wnd[1]/usr/lbl[10,3]").Text`);
  vbsLines.push(`    End If`);
  vbsLines.push(`    session.findById("wnd[1]/tbar[0]/btn[0]").press`);
  vbsLines.push(`  End If`);
  vbsLines.push(`  Err.Clear`);
  vbsLines.push(``);
  vbsLines.push(`  result = CStr(session.findById("wnd[0]/sbar").Text)`);
  vbsLines.push(`  outDocSap = ExtractSapDocNumber(result)`);
  vbsLines.push(``);
  vbsLines.push(`  SAPApp.HistoryEnabled = True`);
  vbsLines.push(`  dummy = session.UnlockSessionUI()`);
  vbsLines.push(``);
  vbsLines.push(`  If outDocSap <> "" Then`);
  vbsLines.push(`    outMsg = result`);
  vbsLines.push(`    ExecuteMigoBatch = "success"`);
  vbsLines.push(`  ElseIf error_result <> "" Then`);
  vbsLines.push(`    outMsg = error_result & " (" & result & ")"`);
  vbsLines.push(`    ExecuteMigoBatch = "error"`);
  vbsLines.push(`  Else`);
  vbsLines.push(`    outMsg = "Itens e UIIs preenchidos na tela (" & result & "). Confira no SAP."`);
  vbsLines.push(`    ExecuteMigoBatch = "verified"`);
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
 * SCRIPT MESTRE VBA EXCEL V4 (CALIBRADO COM OS OBJETOS REAIS DO SAP MIDEA - BASE MIGO.xlsm)
 * Funciona tanto:
 * A) Na nova aba visual `PAINEL_MIGO_311` (construída automaticamente por `Construir_Painel_Visual_MIGOU`)
 * B) Diretamente na aba `Planilha1 (311)` da `BASE MIGO.xlsm` (`Sub MIGO_311_3()` lendo das Colunas K a R)!
 *
 * Correções críticas aplicadas sobre a macro antiga `MIGO_311_3`:
 * 1. Auto-Ordenação do bloco por `Centro + Material + Dep. Origem + Dep. Destino` ANTES de agrupar, garantindo
 *    que o `.Range(...).Copy` dos seriais UII seja 100% contíguo mesmo se a lista colada estiver fora de ordem!
 * 2. Inclusão obrigatória do `Centro` (`arrPlant`) na condição de quebra de grupo (`isNewGroup`).
 * 3. Remoção de seriais UII duplicados na mesma transferência.
 * 4. Uso exato do motor Midea: `GODEFAULT_TV-BWART`, `MIGO_OK_HEADER_CLOSE`, `MIGO_OK_DETAIL_CLOSE`,
 *    `SAPLMIGOTV_GOITEM` (`GOITEM-MAKTX`, `GOITEM-UMLGOBE`, `GOITEM-ERFMG`, `GOITEM-LGOBE`, `GOITEM-NAME1`, `GOITEM-SGTXT`, `GOITEM-TAKE_IT`)
 *    e busca de UIIs na `SAPLMIGO:0360` (`btnOK_SER_SEARCH` -> `btn%_SO_UII_%_APP_%-VALU_PUSH` -> `btn[24]` -> `btn[8]` -> `sendVKey 5` -> `btn[47]`).
 */
export function generateExcelVbaV2MacroCode(options: MigoEngineOptions): string {
  const defaultTexto = resolveMigoItemText(options);
  return `' =======================================================================================
' SISTEMA MESTRE EXCEL VBA V4 - MIGOU SAP MIGO 311 (MOTOR OFICIAL MIDEA SAPLMIGO:0360 UII)
' Compativel com:
'   1) Novo Painel Visual "PAINEL_MIGO_311" (Colunas B a F -> Botoes Visuais no Topo)
'   2) Planilha "311" da BASE MIGO.xlsm atual (Colunas K a R -> Sub MIGO_311_3)
' =======================================================================================
Option Explicit

Public SapGuiAuto As Object
Public SAPApp As Object
Public SAPCon As Object
Public session As Object

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
    
    ws.Range("B2").Value = "MIGOU SAP - CENTRAL MESTRE MIGO 311 V4 (MOTOR OFICIAL MIDEA UII)"
    ws.Range("B2").Font.Color = RGB(255, 255, 255)
    ws.Range("B2").Font.Bold = True
    ws.Range("B2").Font.Size = 14
    
    ws.Range("B3").Value = "Ordena e Agrupa automaticamente por Centro + Material + Origem + Destino - Injeta Seriais via SO_UII (SAPLMIGO:0360)"
    ws.Range("B3").Font.Color = RGB(186, 230, 253)
    ws.Range("B3").Font.Size = 9
    
    ' 2. Painel de Parametros e KPIs (Linhas 5 a 7)
    ws.Rows(4).RowHeight = 10
    ws.Rows(5).RowHeight = 18
    ws.Rows(6).RowHeight = 24
    ws.Rows(7).RowHeight = 10
    
    ws.Range("B5").Value = "COLUNA TEXTO NA MIGO:"
    ws.Range("C5").Value = "MODO DE FINALIZACAO:"
    ws.Range("D5").Value = "ORDENACAO AUTOMATICA:"
    ws.Range("B5:D5").Font.Bold = True
    ws.Range("B5:D5").Font.Size = 8
    ws.Range("B5:D5").Font.Color = RGB(71, 85, 105)
    
    ws.Range("B6").Value = "${defaultTexto || ''}"
    ws.Range("B6").Interior.Color = RGB(240, 249, 255)
    ws.Range("B6").Borders.LineStyle = 1
    ws.Range("B6").Font.Bold = True
    ws.Range("B6").HorizontalAlignment = -4108
    
    With ws.Range("C6")
        .Value = "${options.postMode === 'registrar' ? 'SALVAR DOC AUTOMATICAMENTE' : 'PREENCHER P/ REVISAO (PADRAO MIDEA)'}"
        .Interior.Color = RGB(236, 253, 245)
        .Borders.LineStyle = 1
        .Font.Bold = True
        .HorizontalAlignment = -4108
        .Validation.Delete
        .Validation.Add Type:=3, AlertStyle:=1, Formula1:="PREENCHER P/ REVISAO (PADRAO MIDEA),SALVAR DOC AUTOMATICAMENTE"
    End With
    
    With ws.Range("D6")
        .Value = "ATIVA (CENTRO+MAT+ROTA)"
        .Interior.Color = RGB(240, 249, 255)
        .Borders.LineStyle = 1
        .Font.Bold = True
        .HorizontalAlignment = -4108
    End With
    
    ws.Range("I5").Value = "TOTAL SERIAIS:"
    ws.Range("J5").Value = "GRUPOS MIGO:"
    ws.Range("K5").Value = "USUARIO SAP:"
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
    ws.Range("I6:L6").Borders.LineStyle = 1
    ws.Range("I6:K6").HorizontalAlignment = -4108
    
    ' 3. Cabecalhos da Tabela 1 (Entrada Bruta - Colunas B a G)
    ws.Rows(8).RowHeight = 26
    ws.Rows(9).RowHeight = 22
    
    ws.Range("B8:G8").Merge
    ws.Range("B8").Value = "1. DADOS DE ENTRADA (COLE AQUI DO MIGOU - B10:F...)"
    ws.Range("B8").Interior.Color = RGB(0, 72, 142)
    ws.Range("B8").Font.Color = RGB(255, 255, 255)
    ws.Range("B8").Font.Bold = True
    ws.Range("B8").VerticalAlignment = -4108
    
    ws.Range("B9").Value = "Material (SKU)"
    ws.Range("C9").Value = "Serial (UII)"
    ws.Range("D9").Value = "Centro"
    ws.Range("E9").Value = "Dep. Origem"
    ws.Range("F9").Value = "Dep. Destino"
    ws.Range("G9").Value = "Texto / Status"
    
    With ws.Range("B9:G9")
        .Interior.Color = RGB(224, 242, 254)
        .Font.Color = RGB(6, 25, 62)
        .Font.Bold = True
        .Borders.LineStyle = 1
        .HorizontalAlignment = -4108
        .VerticalAlignment = -4108
    End With
    
    ' 4. Cabecalhos da Tabela 2 (Espelho Agrupado da Grade MIGO 311 - Colunas I a P)
    ws.Range("I8:P8").Merge
    ws.Range("I8").Value = "2. ESPELHO AGRUPADO DA MIGO 311 (INTERVALOS CONTIGUOS DE UII)"
    ws.Range("I8").Interior.Color = RGB(6, 25, 62)
    ws.Range("I8").Font.Color = RGB(255, 255, 255)
    ws.Range("I8").Font.Bold = True
    ws.Range("I8").VerticalAlignment = -4108
    
    ws.Range("I9").Value = "Item"
    ws.Range("J9").Value = "Txt.brv.material"
    ws.Range("K9").Value = "Cen."
    ws.Range("L9").Value = "Deposito"
    ws.Range("M9").Value = "Deposito RegTran."
    ws.Range("N9").Value = "Qtd.em UMR"
    ws.Range("O9").Value = "Linhas UII (De:Ate)"
    ws.Range("P9").Value = "Status SAP MIGO"
    
    With ws.Range("I9:P9")
        .Interior.Color = RGB(224, 242, 254)
        .Font.Color = RGB(6, 25, 62)
        .Font.Bold = True
        .Borders.LineStyle = 1
        .HorizontalAlignment = -4108
        .VerticalAlignment = -4108
    End With
    
    ws.Columns("A").ColumnWidth = 2
    ws.Columns("B").ColumnWidth = 18
    ws.Columns("C").ColumnWidth = 22
    ws.Columns("D").ColumnWidth = 9
    ws.Columns("E").ColumnWidth = 12
    ws.Columns("F").ColumnWidth = 12
    ws.Columns("G").ColumnWidth = 20
    ws.Columns("H").ColumnWidth = 3
    ws.Columns("I").ColumnWidth = 7
    ws.Columns("J").ColumnWidth = 18
    ws.Columns("K").ColumnWidth = 8
    ws.Columns("L").ColumnWidth = 11
    ws.Columns("M").ColumnWidth = 16
    ws.Columns("N").ColumnWidth = 12
    ws.Columns("O").ColumnWidth = 20
    ws.Columns("P").ColumnWidth = 28
    
    CreateActionButton ws, "BTN_MIGOU_AGRUPAR", "1. ORDENAR E AGRUPAR LOTE", "Simular_Agrupamento_MIGO311", 435, 38, 175, 28, RGB(0, 131, 202)
    CreateActionButton ws, "BTN_MIGOU_EXECUTAR", "2. EXECUTAR MIGO 311 NO SAP", "Executar_SAP_MIGO_311_Mestre", 620, 38, 205, 28, RGB(16, 185, 129)
    CreateActionButton ws, "BTN_MIGOU_LIMPAR", "LIMPAR", "Limpar_Painel_MIGOU", 835, 38, 80, 28, RGB(225, 29, 72)
    
    Application.ScreenUpdating = True
    MsgBox "Painel Visual MIGOU MIGO 311 V4 construido com sucesso!" & vbCrLf & vbCrLf & _
           "Cole os itens a partir da celula B10 e clique em '2. EXECUTAR MIGO 311 NO SAP'!", vbInformation, "MIGOU SAP 311"
End Sub

Private Sub CreateActionButton(ws As Worksheet, btnName As String, captionText As String, macroName As String, leftPos As Double, topPos As Double, widthVal As Double, heightVal As Double, fillColor As Long)
    Dim shp As Shape
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
' 2. AUTO-ORDENACAO E AGRUPAMENTO INTELIGENTE NO PAINEL VISUAL (COLUNAS B a F)
' =======================================================================================
Public Sub Simular_Agrupamento_MIGO311()
    Dim ws As Worksheet
    Dim lastRow As Long, i As Long
    Set ws = ActiveSheet
    
    lastRow = ws.Cells(ws.Rows.Count, "B").End(-4162).Row
    If lastRow < 10 Then
        MsgBox "Cole os itens nas colunas B a F (a partir da linha 10) antes de agrupar.", vbExclamation, "MIGOU SAP 311"
        Exit Sub
    End If
    
    Application.ScreenUpdating = False
    
    ' 1. Ordena fisicamente B10:G[lastRow] por Centro (D) -> Material (B) -> Origem (E) -> Destino (F)
    ' Isso garante que todos os seriais UII (Coluna C) do mesmo grupo fiquem 100% contiguos!
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add Key:=ws.Range("D10:D" & lastRow), Order:=1
        .SortFields.Add Key:=ws.Range("B10:B" & lastRow), Order:=1
        .SortFields.Add Key:=ws.Range("E10:E" & lastRow), Order:=1
        .SortFields.Add Key:=ws.Range("F10:F" & lastRow), Order:=1
        .SetRange ws.Range("B10:G" & lastRow)
        .Header = 2
        .Apply
    End With
    
    ws.Range("I10:P5000").ClearContents
    ws.Range("I10:P5000").Interior.ColorIndex = -4142
    
    Dim grpCount As Long, outRow As Long
    Dim curMat As String, curCen As String, curFrom As String, curTo As String
    Dim prevMat As String, prevCen As String, prevFrom As String, prevTo As String
    Dim arrStart As Long, arrEnd As Long, curQty As Long
    
    grpCount = 0
    outRow = 10
    
    For i = 10 To lastRow
        curMat = UCase(Trim(ws.Cells(i, "B").Text))
        curCen = UCase(Trim(ws.Cells(i, "D").Text))
        curFrom = UCase(Trim(ws.Cells(i, "E").Text))
        curTo = UCase(Trim(ws.Cells(i, "F").Text))
        
        If curMat <> "" Then
            If grpCount = 0 Or curMat <> prevMat Or curCen <> prevCen Or curFrom <> prevFrom Or curTo <> prevTo Then
                If grpCount > 0 Then
                    EscreverLinhaEspelho ws, outRow, grpCount, prevMat, prevCen, prevFrom, prevTo, curQty, "C" & arrStart & ":C" & arrEnd
                    outRow = outRow + 1
                End If
                grpCount = grpCount + 1
                prevMat = curMat
                prevCen = curCen
                prevFrom = curFrom
                prevTo = curTo
                arrStart = i
                arrEnd = i
                curQty = 1
            Else
                arrEnd = i
                curQty = curQty + 1
            End If
        End If
    Next i
    
    If grpCount > 0 Then
        EscreverLinhaEspelho ws, outRow, grpCount, prevMat, prevCen, prevFrom, prevTo, curQty, "C" & arrStart & ":C" & arrEnd
    End If
    
    ws.Range("I6").Value = (lastRow - 9)
    ws.Range("J6").Value = grpCount
    ws.Range("L6").Value = grpCount & " grupo(s) prontos"
    Application.ScreenUpdating = True
End Sub

Private Sub EscreverLinhaEspelho(ws As Worksheet, outRow As Long, idx As Long, mat As String, cen As String, orig As String, dest As String, qtd As Long, rangeStr As String)
    ws.Cells(outRow, "I").Value = idx
    ws.Cells(outRow, "J").Value = mat
    ws.Cells(outRow, "K").Value = cen
    ws.Cells(outRow, "L").Value = orig
    ws.Cells(outRow, "M").Value = dest
    ws.Cells(outRow, "N").Value = qtd
    ws.Cells(outRow, "O").Value = rangeStr
    ws.Cells(outRow, "P").Value = "Pronto (" & qtd & " UIIs)"
    ws.Range("I" & outRow & ":P" & outRow).Borders.LineStyle = 1
    ws.Range("I" & outRow & ",K" & outRow & ":O" & outRow).HorizontalAlignment = -4108
    ws.Cells(outRow, "N").Font.Bold = True
End Sub

' =======================================================================================
' 3. EXECUTOR MESTRE SAP MIGO 311 (COMPATIVEL COM PAINEL VISUAL E COM ABA "311" K:R)
' =======================================================================================
Public Sub Executar_SAP_MIGO_311_Mestre()
    MIGO_311_3
End Sub

Public Sub MIGO_311_3()
    Dim sht As Worksheet
    Dim isVisualPanel As Boolean
    Dim i As Long, ii As Integer, last_row As Long, start_row As Long
    Dim total_items As Integer, CurrentRow As Long, pageSize As Long
    Dim cur_row As Object, col_count As Integer, item_index As Integer
    
    ' Detecta automaticamente se estamos no PAINEL_MIGO_311 (Colunas B..F) ou na aba "311" da BASE MIGO.xlsm (Colunas K..R)
    Set sht = ActiveSheet
    If sht.Cells(sht.Rows.Count, "B").End(-4162).Row >= 10 And UCase(Trim(sht.Range("B9").Text)) = "MATERIAL (SKU)" Then
        isVisualPanel = True
        Simular_Agrupamento_MIGO311
        start_row = 10
        last_row = sht.Cells(sht.Rows.Count, "B").End(-4162).Row
    Else
        isVisualPanel = False
        On Error Resume Next
        If sht.Name <> "311" Then Set sht = Sheets("311")
        On Error GoTo 0
        start_row = 2
        last_row = sht.Cells(sht.Rows.Count, 11).End(-4162).Row
        
        ' CORRECAO CRITICA 1: Ordena automaticamente as Colunas K:R da aba "311" por Centro(M) + Material(K) + Origem(N) + Destino(P)
        ' antes de montar os intervalos R(arrStart):R(arrEnd) para nao misturar seriais!
        If last_row > 2 Then
            With sht.Sort
                .SortFields.Clear
                .SortFields.Add Key:=sht.Range("M2:M" & last_row), Order:=1
                .SortFields.Add Key:=sht.Range("K2:K" & last_row), Order:=1
                .SortFields.Add Key:=sht.Range("N2:N" & last_row), Order:=1
                .SortFields.Add Key:=sht.Range("P2:P" & last_row), Order:=1
                .SetRange sht.Range("K2:R" & last_row)
                .Header = 2
                .Apply
            End With
        End If
    End If
    
    If last_row < start_row Then
        MsgBox "Nenhum item encontrado para processar na MIGO 311.", vbExclamation, "MIGOU SAP 311"
        Exit Sub
    End If
    
    ' =========================================================================
    ' PASSO 1: LER O EXCEL E AGRUPAR OS ITENS (CENTRO + MATERIAL + ORIGEM + DESTINO)
    ' =========================================================================
    Dim arrMat() As String, arrQty() As Double, arrPlant() As String
    Dim arrFrom() As String, arrTo() As String, arrTxt() As String
    Dim arrStart() As Long, arrEnd() As Long
    Dim grpCount As Integer
    grpCount = 0
    
    Dim material As String, plant As String, from_loc As String, to_loc As String, txt_val As String
    Dim row_qty As Double, serialColLetter As String
    serialColLetter = IIf(isVisualPanel, "C", "R")
    
    For i = start_row To last_row
        If isVisualPanel Then
            material = Trim(sht.Cells(i, "B").Text)
            plant = Trim(sht.Cells(i, "D").Text)
            from_loc = Trim(sht.Cells(i, "E").Text)
            to_loc = Trim(sht.Cells(i, "F").Text)
            txt_val = Trim(sht.Range("B6").Text)
            row_qty = 1
        Else
            material = Trim(sht.Cells(i, 11).Text)
            row_qty = Val(sht.Cells(i, 12).Value)
            If row_qty <= 0 Then row_qty = 1
            plant = Trim(sht.Cells(i, 13).Text)
            from_loc = Trim(sht.Cells(i, 14).Text)
            to_loc = Trim(sht.Cells(i, 16).Text)
            txt_val = Trim(sht.Cells(i, 17).Text)
        End If
        
        If material = "" Then Exit For
        
        Dim isNewGroup As Boolean
        isNewGroup = False
        
        ' CORRECAO CRITICA 2: Inclui obrigatoriamente o Centro (plant <> arrPlant(grpCount)) na chave do grupo!
        If grpCount = 0 Then
            isNewGroup = True
        ElseIf material <> arrMat(grpCount) Or plant <> arrPlant(grpCount) Or from_loc <> arrFrom(grpCount) Or to_loc <> arrTo(grpCount) Then
            isNewGroup = True
        End If
        
        If isNewGroup Then
            grpCount = grpCount + 1
            ReDim Preserve arrMat(1 To grpCount)
            ReDim Preserve arrQty(1 To grpCount)
            ReDim Preserve arrPlant(1 To grpCount)
            ReDim Preserve arrFrom(1 To grpCount)
            ReDim Preserve arrTo(1 To grpCount)
            ReDim Preserve arrTxt(1 To grpCount)
            ReDim Preserve arrStart(1 To grpCount)
            ReDim Preserve arrEnd(1 To grpCount)
            
            arrMat(grpCount) = material
            arrPlant(grpCount) = plant
            arrFrom(grpCount) = from_loc
            arrTo(grpCount) = to_loc
            arrTxt(grpCount) = txt_val
            arrStart(grpCount) = i
            arrEnd(grpCount) = i
            arrQty(grpCount) = row_qty
        Else
            arrEnd(grpCount) = i
            arrQty(grpCount) = arrQty(grpCount) + row_qty
        End If
    Next i
    
    total_items = grpCount
    If total_items = 0 Then Exit Sub
    
    ' =========================================================================
    ' PASSO 2: CONECTAR AO SAP GUI E CONFIGURAR CABECALHO MIGO 311 MIDEA
    ' =========================================================================
    On Error Resume Next
    Set SapGuiAuto = GetObject("SAPGUI")
    If Err.Number <> 0 Or SapGuiAuto Is Nothing Then
        MsgBox "O SAP Logon nao esta aberto! Abra o SAP e faca login primeiro.", vbCritical, "MIGOU SAP 311"
        Exit Sub
    End If
    Set SAPApp = SapGuiAuto.GetScriptingEngine
    Set SAPCon = SAPApp.Children(0)
    Set session = SAPCon.Children(0)
    If Err.Number <> 0 Or session Is Nothing Then
        MsgBox "Nenhuma sessao SAP ativa encontrada! Faca login no SAP.", vbCritical, "MIGOU SAP 311"
        Exit Sub
    End If
    On Error GoTo 0
    
    If isVisualPanel Then sht.Range("K6").Value = CStr(session.Info.User)
    
    Dim dummy As Variant
    SAPApp.AllowSystemMessages = False
    SAPApp.HistoryEnabled = False
    dummy = session.LockSessionUI()
    
    session.findById("wnd[0]/tbar[0]/okcd").Text = "/nmigo"
    session.findById("wnd[0]").sendVKey 0
    
    session.findById("wnd[0]/usr").FindByNameEx("GODYNPRO-ACTION", 34).Key = "A08" ' Transferencia
    session.findById("wnd[0]/usr/").FindByNameEx("GODYNPRO-REFDOC", 34).Key = "R10" ' Outros
    If session.findById("wnd[0]/usr").FindByNameEx("GODEFAULT_TV-BWART", 32).Text <> "311" Then
        session.findById("wnd[0]/usr").FindByNameEx("GODEFAULT_TV-BWART", 32).Text = "311"
    End If
    session.findById("wnd[0]").sendVKey 0
    
    If session.findById("wnd[0]/sbar").MessageType = "E" Then
        If isVisualPanel Then
            sht.Range("L6").Value = "Erro Cabecalho MIGO"
        Else
            sht.Cells(2, 10).Value = session.findById("wnd[0]/sbar").Text
        End If
        GoTo CleanupSection
    End If
    
    If session.ActiveWindow.Name = "wnd[1]" Then session.findById("wnd[1]").Close
    
    session.SendCommand ("MIGO_OK_HEADER_OPEN")
    session.SendCommand ("MIGO_OK_HEADER_CLOSE")
    session.SendCommand ("MIGO_OK_DETAIL_CLOSE")
    
    pageSize = session.findById("wnd[0]/usr").FindByNameEx("SAPLMIGOTV_GOITEM", 80).verticalScrollbar.pageSize
    session.findById("wnd[0]/usr").FindByNameEx("SAPLMIGOTV_GOITEM", 80).verticalScrollbar.Position = 0
    
    ' =========================================================================
    ' PASSO 3: INSERIR OS ITENS AGRUPADOS NA GRADE (SAPLMIGOTV_GOITEM)
    ' =========================================================================
    CurrentRow = 0
    
    For i = 1 To total_items
        If CurrentRow >= pageSize Then
            session.findById("wnd[0]/tbar[0]/btn[0]").press
            session.findById("wnd[0]/tbar[0]/btn[82]").press
            CurrentRow = 1
        End If
        
        Set cur_row = session.findById("wnd[0]/usr").FindByNameEx("SAPLMIGOTV_GOITEM", 80).Rows(CurrentRow)
        col_count = 0
        Dim material_assigned As Boolean: material_assigned = False
        Dim special_stock_assigned As Boolean: special_stock_assigned = False
        
        For ii = 0 To cur_row.Count - 1
            col_count = col_count + 1
            If cur_row(ii + 0).Name = "GOITEM-MAKTX" And material_assigned = False Then
                material_assigned = True
                cur_row(ii + 0).Text = arrMat(i)
            ElseIf cur_row(ii + 0).Name = "GOITEM-TAKE_IT" Then
                cur_row(ii + 0).Selected = True
            ElseIf cur_row(ii + 0).Name = "GOITEM-ERFMG" Then
                cur_row(ii + 0).Text = CStr(arrQty(i))
            ElseIf cur_row(ii + 0).Name = "GOITEM-LGOBE" Then
                cur_row(ii + 0).Text = arrFrom(i)
            ElseIf cur_row(ii + 0).Name = "GOITEM-NAME1" Then
                cur_row(ii + 0).Text = arrPlant(i)
            ElseIf cur_row(ii + 0).Name = "GOITEM-SOBKZ" And special_stock_assigned = False Then
                special_stock_assigned = True
            ElseIf cur_row(ii + 0).Name = "GOITEM-SGTXT" Then
                cur_row(ii + 0).Text = arrTxt(i)
            ElseIf cur_row(ii + 0).Name = "GOITEM-UMLGOBE" Then
                cur_row(ii + 0).Text = arrTo(i)
            Else
                col_count = col_count - 1
            End If
            
            If col_count > 7 Then Exit For
        Next ii
        
        Set cur_row = Nothing
        CurrentRow = CurrentRow + 1
    Next i
    
    ' =========================================================================
    ' PASSO 4: REABRIR DETALHE E COLAR OS SERIAIS UII DE CADA GRUPO (SAPLMIGO:0360)
    ' =========================================================================
    session.SendCommand ("MIGO_OK_DETAIL_OPEN")
    
    For item_index = 1 To total_items
        On Error Resume Next
        session.findById("wnd[0]/usr/ssubSUB_MAIN_CARRIER:SAPLMIGO:0009/subSUB_ITEMDETAIL:SAPLMIGO:0303/subSUB_DETAIL:SAPLMIGO:0305/tabsTS_GOITEM/tabpOK_GOITEM_SERIAL").Select
        If Err.Number <> 0 Then
            If isVisualPanel Then
                sht.Cells(9 + item_index, "P").Value = "Erro Aba Serial: " & Err.Description
            Else
                sht.Cells(last_row + 2, 1).Value = "Erro ao selecionar aba Serial - Item " & item_index & ": " & Err.Description
            End If
            GoTo CleanupSection
        End If
        On Error GoTo 0
        
        session.findById("wnd[0]/usr/ssubSUB_MAIN_CARRIER:SAPLMIGO:0009/subSUB_ITEMDETAIL:SAPLMIGO:0303/subSUB_DETAIL:SAPLMIGO:0305/tabsTS_GOITEM/tabpOK_GOITEM_SERIAL/ssubSUB_TS_GOITEM_SERIAL:SAPLMIGO:0360/btnOK_SER_SEARCH").press
        session.findById("wnd[0]/usr/btn%_SO_UII_%_APP_%-VALU_PUSH").press
        
        ' Copia exatamente o intervalo contiguo de seriais deste grupo (ja ordenado!)
        sht.Range(serialColLetter & arrStart(item_index) & ":" & serialColLetter & arrEnd(item_index)).Copy
        
        On Error Resume Next
        session.findById("wnd[1]/tbar[0]/btn[24]").press ' Colar do Clipboard
        On Error GoTo 0
        
        session.findById("wnd[1]/tbar[0]/btn[8]").press  ' Confirmar popup
        
        If session.findById("wnd[0]/sbar").MessageType = "E" Then
            If isVisualPanel Then
                sht.Cells(9 + item_index, "P").Value = "Erro UII: " & session.findById("wnd[0]/sbar").Text
                sht.Cells(9 + item_index, "P").Interior.Color = RGB(254, 226, 226)
            Else
                sht.Cells(last_row + 2, 1).Value = "Erro na busca serial - Item " & item_index & ": " & session.findById("wnd[0]/sbar").Text
            End If
            GoTo CleanupSection
        End If
        
        Dim current_quantity As Long
        current_quantity = CLng(arrQty(item_index))
        
        session.findById("wnd[0]/tbar[1]/btn[8]").press ' Executar pesquisa UII
        
        If current_quantity > 1 Then
            session.findById("wnd[0]").sendVKey 5
            session.findById("wnd[0]/tbar[1]/btn[47]").press
        End If
        
        If isVisualPanel Then
            sht.Cells(9 + item_index, "P").Value = "OK no SAP (" & current_quantity & " UIIs)"
            sht.Cells(9 + item_index, "P").Interior.Color = RGB(209, 250, 229)
        End If
        
        If item_index < total_items Then
            session.findById("wnd[0]/usr/ssubSUB_MAIN_CARRIER:SAPLMIGO:0009/subSUB_ITEMDETAIL:SAPLMIGO:0303/subSUB_DETAIL:SAPLMIGO:0305/btnOK_NEXT_ITEM").press
        End If
    Next item_index
    
    ' Se no Painel Visual o usuario escolheu "SALVAR DOC AUTOMATICAMENTE", grava via btn[11]
    If isVisualPanel And InStr(1, UCase(Trim(sht.Range("C6").Text)), "SALVAR", vbTextCompare) > 0 Then
        session.findById("wnd[0]/tbar[0]/btn[11]").press
        If session.findById("wnd[0]/sbar").MessageType = "W" Then session.findById("wnd[0]").sendVKey 0
        sht.Range("L6").Value = session.findById("wnd[0]/sbar").Text
    ElseIf isVisualPanel Then
        sht.Range("L6").Value = "Preenchido no SAP (" & total_items & " grupos)"
    End If

CleanupSection:
    On Error Resume Next
    Application.ScreenUpdating = True
    Application.Calculation = -4105 ' xlCalculationAutomatic
    Application.CutCopyMode = False
    
    If Not SAPApp Is Nothing Then SAPApp.HistoryEnabled = True
    If Not session Is Nothing Then dummy = session.UnlockSessionUI()
    Set session = Nothing
    Set SAPCon = Nothing
    Set SAPApp = Nothing
    Set SapGuiAuto = Nothing
    On Error GoTo 0
    
    MsgBox "Processo de Preenchimento MIGO 311 Concluido (" & total_items & " grupo(s) processado(s))!", vbInformation, "MIGOU SAP 311"
End Sub

Public Sub Limpar_Painel_MIGOU()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    ws.Range("B10:G5000").ClearContents
    ws.Range("B10:G5000").Interior.ColorIndex = -4142
    ws.Range("I10:P5000").ClearContents
    ws.Range("I10:P5000").Interior.ColorIndex = -4142
    ws.Range("I6").Value = 0
    ws.Range("J6").Value = 0
    ws.Range("L6").Value = "Painel Limpo"
End Sub`;
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
  lines.push(`' CONSTRUTOR AUTOMATICO DO PAINEL EXCEL MIGO 311 V4 - MIGOU (MIDEA CARRIER)`);
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
  lines.push(`ws.Range("B2").Value = "MIGOU SAP - CENTRAL MESTRE MIGO 311 V4 (MOTOR OFICIAL MIDEA UII)"`);
  lines.push(`ws.Range("B2").Font.Color = RGB(255, 255, 255)`);
  lines.push(`ws.Range("B2").Font.Bold = True`);
  lines.push(`ws.Range("B2").Font.Size = 14`);
  lines.push(`ws.Range("B3").Value = "Ordena e Agrupa automaticamente por Centro + Material + Origem + Destino - Injeta Seriais via SO_UII (SAPLMIGO:0360)"`);
  lines.push(`ws.Range("B3").Font.Color = RGB(186, 230, 253)`);
  lines.push(`ws.Range("B3").Font.Size = 9`);
  lines.push(``);
  lines.push(`' 2. Painel de Parametros e KPIs`);
  lines.push(`ws.Range("B5").Value = "COLUNA TEXTO NA MIGO:"`);
  lines.push(`ws.Range("C5").Value = "MODO DE FINALIZACAO:"`);
  lines.push(`ws.Range("D5").Value = "ORDENACAO AUTOMATICA:"`);
  lines.push(`ws.Range("B5:D5").Font.Bold = True`);
  lines.push(`ws.Range("B5:D5").Font.Size = 8`);
  lines.push(`ws.Range("B6").Value = "${defaultTexto}"`);
  lines.push(`ws.Range("C6").Value = "${options.postMode === 'registrar' ? 'SALVAR DOC AUTOMATICAMENTE' : 'PREENCHER P/ REVISAO (PADRAO MIDEA)'}"`);
  lines.push(`ws.Range("D6").Value = "ATIVA (CENTRO+MAT+ROTA)"`);
  lines.push(`ws.Range("B6:D6").Interior.Color = RGB(240, 249, 255)`);
  lines.push(`ws.Range("B6:D6").Borders.LineStyle = 1`);
  lines.push(`ws.Range("B6:D6").Font.Bold = True`);
  lines.push(``);
  lines.push(`ws.Range("I5").Value = "TOTAL SERIAIS:"`);
  lines.push(`ws.Range("J5").Value = "GRUPOS MIGO:"`);
  lines.push(`ws.Range("K5").Value = "USUARIO SAP:"`);
  lines.push(`ws.Range("L5").Value = "STATUS:"`);
  lines.push(`ws.Range("I5:L5").Font.Bold = True`);
  lines.push(`ws.Range("I5:L5").Font.Size = 8`);
  lines.push(`ws.Range("I6").Value = ${rawItems.length}`);
  lines.push(`ws.Range("J6").Value = ${groupedLines.length}`);
  lines.push(`ws.Range("K6").Value = "-"`);
  lines.push(`ws.Range("L6").Value = "Lote Carregado (${groupedLines.length} grupos)"`);
  lines.push(`ws.Range("I6:L6").Font.Bold = True`);
  lines.push(`ws.Range("I6:L6").Interior.Color = RGB(248, 250, 252)`);
  lines.push(`ws.Range("I6:L6").Borders.LineStyle = 1`);
  lines.push(``);
  lines.push(`' 3. Cabecalhos Tabela 1 (Entrada) e Tabela 2 (Espelho MIGO Agrupado)`);
  lines.push(`ws.Range("B8:G8").Merge`);
  lines.push(`ws.Range("B8").Value = "1. DADOS DE ENTRADA (ITENS DA FILA MIGOU JÁ ORDENADOS)"`);
  lines.push(`ws.Range("B8").Interior.Color = RGB(0, 72, 142)`);
  lines.push(`ws.Range("B8").Font.Color = RGB(255, 255, 255)`);
  lines.push(`ws.Range("B8").Font.Bold = True`);
  lines.push(`ws.Range("B9").Value = "Material (SKU)"`);
  lines.push(`ws.Range("C9").Value = "Serial (UII)"`);
  lines.push(`ws.Range("D9").Value = "Centro"`);
  lines.push(`ws.Range("E9").Value = "Dep. Origem"`);
  lines.push(`ws.Range("F9").Value = "Dep. Destino"`);
  lines.push(`ws.Range("G9").Value = "Texto / Status"`);
  lines.push(`ws.Range("B9:G9").Interior.Color = RGB(224, 242, 254)`);
  lines.push(`ws.Range("B9:G9").Font.Bold = True`);
  lines.push(`ws.Range("B9:G9").Borders.LineStyle = 1`);
  lines.push(``);
  lines.push(`ws.Range("I8:P8").Merge`);
  lines.push(`ws.Range("I8").Value = "2. ESPELHO AGRUPADO DA MIGO 311 (INTERVALOS CONTIGUOS DE UII)"`);
  lines.push(`ws.Range("I8").Interior.Color = RGB(6, 25, 62)`);
  lines.push(`ws.Range("I8").Font.Color = RGB(255, 255, 255)`);
  lines.push(`ws.Range("I8").Font.Bold = True`);
  lines.push(`ws.Range("I9").Value = "Item"`);
  lines.push(`ws.Range("J9").Value = "Txt.brv.material"`);
  lines.push(`ws.Range("K9").Value = "Cen."`);
  lines.push(`ws.Range("L9").Value = "Depósito"`);
  lines.push(`ws.Range("M9").Value = "Depósito RegTran."`);
  lines.push(`ws.Range("N9").Value = "Qtd.em UMR"`);
  lines.push(`ws.Range("O9").Value = "Linhas UII (De:Ate)"`);
  lines.push(`ws.Range("P9").Value = "Status SAP MIGO"`);
  lines.push(`ws.Range("I9:P9").Interior.Color = RGB(224, 242, 254)`);
  lines.push(`ws.Range("I9:P9").Font.Bold = True`);
  lines.push(`ws.Range("I9:P9").Borders.LineStyle = 1`);
  lines.push(``);

  // Preenche os itens individuais na Tabela 1 (B10:F...) já na ordem exata dos grupos
  let currentExcelRow = 10;
  groupedLines.forEach((gLine, gIdx) => {
    const startRowForGroup = currentExcelRow;
    gLine.serials.forEach((serial) => {
      lines.push(`ws.Cells(${currentExcelRow}, "B").Value = "${escapeVbsString(gLine.material)}"`);
      lines.push(`ws.Cells(${currentExcelRow}, "C").Value = "${escapeVbsString(serial)}"`);
      lines.push(`ws.Cells(${currentExcelRow}, "D").Value = "${escapeVbsString(gLine.centro)}"`);
      lines.push(`ws.Cells(${currentExcelRow}, "E").Value = "${escapeVbsString(gLine.depositoOrigem)}"`);
      lines.push(`ws.Cells(${currentExcelRow}, "F").Value = "${escapeVbsString(gLine.depositoDestino)}"`);
      lines.push(`ws.Cells(${currentExcelRow}, "G").Value = "${defaultTexto}"`);
      lines.push(`ws.Range("B${currentExcelRow}:G${currentExcelRow}").Borders.LineStyle = 1`);
      currentExcelRow++;
    });
    const endRowForGroup = currentExcelRow - 1;

    // Preenche a linha agrupada na Tabela 2 (I10:P...)
    const r = 10 + gIdx;
    lines.push(`ws.Cells(${r}, "I").Value = ${gIdx + 1}`);
    lines.push(`ws.Cells(${r}, "J").Value = "${escapeVbsString(gLine.material)}"`);
    lines.push(`ws.Cells(${r}, "K").Value = "${escapeVbsString(gLine.centro)}"`);
    lines.push(`ws.Cells(${r}, "L").Value = "${escapeVbsString(gLine.depositoOrigem)}"`);
    lines.push(`ws.Cells(${r}, "M").Value = "${escapeVbsString(gLine.depositoDestino)}"`);
    lines.push(`ws.Cells(${r}, "N").Value = ${gLine.quantidade}`);
    lines.push(`ws.Cells(${r}, "N").Font.Bold = True`);
    lines.push(`ws.Cells(${r}, "O").Value = "C${startRowForGroup}:C${endRowForGroup}"`);
    lines.push(`ws.Cells(${r}, "P").Value = "Pronto p/ MIGO (${gLine.quantidade} UIIs)"`);
    lines.push(`ws.Range("I${r}:P${r}").Borders.LineStyle = 1`);
  });

  lines.push(`ws.Columns("B:P").AutoFit`);
  lines.push(`xlApp.ScreenUpdating = True`);
  lines.push(
    `MsgBox "Painel Visual Excel MIGOU V4 criado e preenchido com " & ${rawItems.length} & " seriais agrupados em " & ${groupedLines.length} & " linhas!" & vbCrLf & vbCrLf & "Dica: Aperte ALT+F11, cole o Script Mestre VBA V4 e salve como .XLSM para compartilhar com seus colegas!", vbInformation, "MIGOU Excel Builder"`
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
