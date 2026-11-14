import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Database,
  MapPin,
  Wrench,
  Download,
  ArrowRight,
  Layers,
  Filter,
  Search,
  Sparkles,
  PackageSearch,
  Building2,
  Lock,
  PlusCircle,
} from 'lucide-react';
import { IQ09Snapshot } from '../types/iq09';
import { WMSBatimentoItem, WMSBatimentoSnapshot } from '../types/wmsBatimento';
import { SAP_CENTROS_CATALOG } from '../utils/sapFormatter';

interface WMSStockExecutiveDashboardProps {
  iq09Snapshot: IQ09Snapshot | null;
  wmsSnapshot: WMSBatimentoSnapshot | null;
  onOpenWmsImporter: () => void;
  onOpenIq09Importer: () => void;
  onOpenNewRequestWithPreset: (preset: {
    material?: string;
    seriais?: string[];
    centro: string;
    depositoOrigem: string;
    depositoDestino: string;
  }) => void;
}

type ActionOwnerFilter = 'TODOS' | 'WMS' | 'Físico' | 'SAP' | 'A definir' | 'Alinhado';

export const WMSStockExecutiveDashboard: React.FC<WMSStockExecutiveDashboardProps> = ({
  iq09Snapshot,
  wmsSnapshot,
  onOpenWmsImporter,
  onOpenIq09Importer,
  onOpenNewRequestWithPreset,
}) => {
  const [ownerFilter, setOwnerFilter] = useState<ActionOwnerFilter>('TODOS');
  const [selectedAnalise, setSelectedAnalise] = useState<string>('TODAS');
  const [selectedCrossPair, setSelectedCrossPair] = useState<string>('TODOS');
  const [priorityFilter, setPriorityFilter] = useState<'TODAS' | 'Crítico' | 'Normal' | 'Baixa'>('TODAS');
  const [drillSearch, setDrillSearch] = useState<string>('');

  // Consolida os itens do Batimento WMS (ou cruza em tempo real caso só haja IQ09 + WMS)
  const items = useMemo<WMSBatimentoItem[]>(() => {
    if (wmsSnapshot && wmsSnapshot.items.length > 0) {
      return wmsSnapshot.items;
    }
    return [];
  }, [wmsSnapshot]);

  // Processamento estatístico completo O(N) em memória para os indicadores executivos
  const analytics = useMemo(() => {
    const total = items.length;
    if (total === 0) {
      return null;
    }

    let alignedCount = 0;
    let faltaReconhecidaCount = 0; // SAP B111 e WMS FALTA ("Falta - desconsiderar")
    let criticalDivergenceCount = 0;
    let normalDivergenceCount = 0;

    // Contadores por Responsável ("Onde Agir")
    let actionWmsCount = 0;
    let actionFisicoCount = 0;
    let actionSapCount = 0;
    let actionDefinirCount = 0;

    // Casos críticos específicos de gestão de estoque
    const furoEstoqueRiscoItems: WMSBatimentoItem[] = []; // No SAP está livre (B110/B114), mas no WMS está em SOBRA/FALTA ("Mover no SAP para B111")
    const b111RetornoIndevidoRiscoItems: WMSBatimentoItem[] = []; // No SAP está em B111, mas no WMS continua em FALTA ou Sem Saldo
    const b111RecuperaveisItems: WMSBatimentoItem[] = []; // No SAP está em B111, mas no WMS já está em B110/B114/B413 livre
    const apenasWmsSemSapItems: WMSBatimentoItem[] = []; // Existe fisicamente no WMS, mas sem saldo na IQ09 SAP
    const apenasSapSemWmsItems: WMSBatimentoItem[] = []; // Existe contabilmente no SAP, mas sem saldo físico no WMS
    const palletRuaErradaItems: WMSBatimentoItem[] = []; // Mover pallet para a rua do centro correto
    const desmembrarFisicoMultiDataItems: WMSBatimentoItem[] = []; // Desmembrar multi data + Desmembrar físico

    const byAnaliseMap = new Map<
      string,
      {
        analise: string;
        count: number;
        criticoCount: number;
        ondeAgir: string;
        sampleLocal: string;
        distinctLocals: Set<string>;
      }
    >();

    const byCrossDepositMap = new Map<
      string,
      {
        key: string;
        depSap: string;
        depWms: string;
        count: number;
        aligned: boolean;
        mainAnalise: string;
        ondeAgir: string;
      }
    >();

    const bySkuDivergenceMap = new Map<
      string,
      {
        sku: string;
        totalDivergent: number;
        criticoCount: number;
        topIssue: string;
        centro: string;
      }
    >();

    const byCentroMap = new Map<
      string,
      {
        centro: string;
        total: number;
        aligned: number;
        divergent: number;
      }
    >();

    let loteBloqueadoCount = 0;
    let materialDivergenteCount = 0;

    for (let i = 0; i < total; i++) {
      const it = items[i];
      const analise = (it.analise || 'OK').trim();
      const analiseUpper = analise.toUpperCase();
      const ondeAgir = (it.ondeAgir || 'Nenhum').trim();
      const ondeUpper = ondeAgir.toUpperCase();
      const prio = (it.prioridade || 'Normal').trim();
      const prioUpper = prio.toUpperCase();
      const depSap = (it.depositoSap || 'S/ SALDO SAP').trim();
      const depWms = (it.depositoWms || 'S/ SALDO WMS').trim();
      const centro = (it.centroSap || it.centroWms || 'S/ CENTRO').trim();
      const sku = (it.materialSap || it.materialWms || 'S/ SKU').trim();

      const isAligned =
        analiseUpper === 'OK' ||
        analiseUpper === 'ALINHADO' ||
        analiseUpper.startsWith('OK -');
      const isFaltaReconhecida = analiseUpper.includes('FALTA - DESCONSIDERAR');

      if (isAligned) {
        alignedCount++;
      } else if (isFaltaReconhecida) {
        faltaReconhecidaCount++;
      } else {
        if (prioUpper.includes('CRÍTIC') || prioUpper.includes('CRITIC') || prioUpper === 'ALTA') {
          criticalDivergenceCount++;
        } else {
          normalDivergenceCount++;
        }
      }

      // Contagem por Onde Agir (apenas para itens não OK e não Falta reconhecida)
      if (!isAligned && !isFaltaReconhecida) {
        if (ondeUpper.includes('WMS')) actionWmsCount++;
        else if (ondeUpper.includes('FÍSIC') || ondeUpper.includes('FISIC')) actionFisicoCount++;
        else if (ondeUpper.includes('SAP')) actionSapCount++;
        else actionDefinirCount++;
      }

      // Lote bloqueado e divergência de SKU
      if (it.loteLiberado === 'N' || it.loteLiberado === 'Não') {
        loteBloqueadoCount++;
      }
      if (
        it.materialSap &&
        it.materialWms &&
        it.materialSap.toUpperCase() !== it.materialWms.toUpperCase()
      ) {
        materialDivergenteCount++;
      }

      // Grupos Estratégicos de Ação
      if (analiseUpper.includes('MOVER NO SAP PARA B111')) {
        furoEstoqueRiscoItems.push(it);
      }
      if (depSap === 'B111') {
        if (
          depWms === 'FALTA' ||
          depWms === 'SOBRA/FALTA' ||
          depWms.includes('INVENTARIO') ||
          !it.depositoWms ||
          analiseUpper.includes('APENAS NO SAP')
        ) {
          b111RetornoIndevidoRiscoItems.push(it);
        } else if (['B110', 'B114', 'B413'].includes(depWms)) {
          b111RecuperaveisItems.push(it);
        }
      }
      if (analiseUpper.includes('APENAS NO WMS')) {
        apenasWmsSemSapItems.push(it);
      }
      if (analiseUpper.includes('APENAS NO SAP')) {
        apenasSapSemWmsItems.push(it);
      }
      if (analiseUpper.includes('MOVER PALLET PARA A RUA DO CENTRO CORRETO')) {
        palletRuaErradaItems.push(it);
      }
      if (
        analiseUpper.includes('DESMEMBRAR MULTI DATA') ||
        analiseUpper.includes('DESMEMBRAR FÍSICO') ||
        analiseUpper.includes('DESMEMBRAR FISICO')
      ) {
        desmembrarFisicoMultiDataItems.push(it);
      }

      // Agrupamento por Análise
      let anEntry = byAnaliseMap.get(analise);
      if (!anEntry) {
        anEntry = {
          analise,
          count: 0,
          criticoCount: 0,
          ondeAgir: ondeAgir || 'Nenhum',
          sampleLocal: it.localWms || '-',
          distinctLocals: new Set<string>(),
        };
        byAnaliseMap.set(analise, anEntry);
      }
      anEntry.count++;
      if (prioUpper.includes('CRÍTIC') || prioUpper.includes('CRITIC')) {
        anEntry.criticoCount++;
      }
      if (it.localWms) {
        anEntry.distinctLocals.add(it.localWms);
      }

      // Agrupamento Matriz De-Para (Depósito SAP x Depósito WMS)
      const crossKey = `${depSap} ➔ ${depWms}`;
      let crossEntry = byCrossDepositMap.get(crossKey);
      if (!crossEntry) {
        crossEntry = {
          key: crossKey,
          depSap,
          depWms,
          count: 0,
          aligned: isAligned,
          mainAnalise: analise,
          ondeAgir: ondeAgir || 'Nenhum',
        };
        byCrossDepositMap.set(crossKey, crossEntry);
      }
      crossEntry.count++;

      // Agrupamento por Centro
      if (centro && centro !== 'S/ CENTRO' && centro.startsWith('B1')) {
        let cEntry = byCentroMap.get(centro);
        if (!cEntry) {
          cEntry = { centro, total: 0, aligned: 0, divergent: 0 };
          byCentroMap.set(centro, cEntry);
        }
        cEntry.total++;
        if (isAligned) cEntry.aligned++;
        else if (!isFaltaReconhecida) cEntry.divergent++;
      }

      // Top SKUs com divergência ativa
      if (!isAligned && !isFaltaReconhecida && sku !== 'S/ SKU') {
        let skuEntry = bySkuDivergenceMap.get(sku);
        if (!skuEntry) {
          skuEntry = {
            sku,
            totalDivergent: 0,
            criticoCount: 0,
            topIssue: analise,
            centro,
          };
          bySkuDivergenceMap.set(sku, skuEntry);
        }
        skuEntry.totalDivergent++;
        if (prioUpper.includes('CRÍTIC') || prioUpper.includes('CRITIC')) {
          skuEntry.criticoCount++;
        }
      }
    }

    const totalDivergentActive = criticalDivergenceCount + normalDivergenceCount;
    const accuracyPct = total > 0 ? ((alignedCount / total) * 100).toFixed(1) : '0.0';

    const analiseRanking = Array.from(byAnaliseMap.values())
      .filter((a) => {
        const up = a.analise.toUpperCase();
        return up !== 'OK' && up !== 'ALINHADO' && !up.startsWith('OK -');
      })
      .sort((a, b) => b.count - a.count);

    const crossDepositRanking = Array.from(byCrossDepositMap.values()).sort(
      (a, b) => b.count - a.count
    );

    const divergentCrossDepositRanking = crossDepositRanking.filter((c) => !c.aligned);

    const topSkusDivergent = Array.from(bySkuDivergenceMap.values())
      .sort((a, b) => b.totalDivergent - a.totalDivergent)
      .slice(0, 10);

    const centroStats = Array.from(byCentroMap.values()).sort((a, b) => b.total - a.total);

    return {
      total,
      alignedCount,
      faltaReconhecidaCount,
      criticalDivergenceCount,
      normalDivergenceCount,
      totalDivergentActive,
      accuracyPct,
      actionWmsCount,
      actionFisicoCount,
      actionSapCount,
      actionDefinirCount,
      furoEstoqueRiscoItems,
      b111RetornoIndevidoRiscoItems,
      b111RecuperaveisItems,
      apenasWmsSemSapItems,
      apenasSapSemWmsItems,
      palletRuaErradaItems,
      desmembrarFisicoMultiDataItems,
      loteBloqueadoCount,
      materialDivergenteCount,
      analiseRanking,
      crossDepositRanking,
      divergentCrossDepositRanking,
      topSkusDivergent,
      centroStats,
    };
  }, [items]);

  // Lista filtrada pelo Drill-Down interativo do Supervisor
  const drilldownItems = useMemo(() => {
    if (!items.length) return [];
    const q = drillSearch.trim().toUpperCase();

    return items.filter((it) => {
      const analise = (it.analise || 'OK').trim();
      const analiseUpper = analise.toUpperCase();
      const isAligned =
        analiseUpper === 'OK' ||
        analiseUpper === 'ALINHADO' ||
        analiseUpper.startsWith('OK -');
      const ondeAgir = (it.ondeAgir || 'Nenhum').trim();
      const ondeUpper = ondeAgir.toUpperCase();
      const prio = (it.prioridade || 'Normal').trim();
      const prioUpper = prio.toUpperCase();
      const depSap = (it.depositoSap || 'S/ SALDO SAP').trim();
      const depWms = (it.depositoWms || 'S/ SALDO WMS').trim();
      const crossKey = `${depSap} ➔ ${depWms}`;

      if (ownerFilter !== 'TODOS') {
        if (ownerFilter === 'Alinhado' && !isAligned) return false;
        if (ownerFilter === 'WMS' && (!ondeUpper.includes('WMS') || isAligned)) return false;
        if (
          ownerFilter === 'Físico' &&
          (!ondeUpper.includes('FÍSIC') && !ondeUpper.includes('FISIC'))
        )
          return false;
        if (ownerFilter === 'SAP' && !ondeUpper.includes('SAP')) return false;
        if (
          ownerFilter === 'A definir' &&
          (isAligned ||
            ondeUpper.includes('WMS') ||
            ondeUpper.includes('FÍSIC') ||
            ondeUpper.includes('FISIC') ||
            ondeUpper.includes('SAP'))
        )
          return false;
      }

      if (selectedAnalise !== 'TODAS' && analise !== selectedAnalise) {
        return false;
      }

      if (selectedCrossPair !== 'TODOS' && crossKey !== selectedCrossPair) {
        return false;
      }

      if (priorityFilter !== 'TODAS') {
        if (
          priorityFilter === 'Crítico' &&
          !prioUpper.includes('CRÍTIC') &&
          !prioUpper.includes('CRITIC')
        )
          return false;
        if (priorityFilter === 'Normal' && prioUpper !== 'NORMAL') return false;
        if (priorityFilter === 'Baixa' && prioUpper !== 'BAIXA') return false;
      }

      if (q) {
        const match =
          it.serial.toUpperCase().includes(q) ||
          (it.materialSap && it.materialSap.toUpperCase().includes(q)) ||
          (it.materialWms && it.materialWms.toUpperCase().includes(q)) ||
          (it.localWms && it.localWms.toUpperCase().includes(q)) ||
          (it.lote && it.lote.toUpperCase().includes(q)) ||
          analiseUpper.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [items, ownerFilter, selectedAnalise, selectedCrossPair, priorityFilter, drillSearch]);

  // Exportar CSV do Drill-Down atual para ação operacional (Time Buiatte / Time Midea)
  const handleExportDrilldownCSV = () => {
    if (drilldownItems.length === 0) return;
    const headers = [
      'Serial_UII',
      'Material_SAP',
      'Centro_SAP',
      'Deposito_SAP',
      'Material_WMS',
      'Deposito_WMS',
      'Endereco_Local_WMS',
      'Lote_WMS',
      'Lote_Liberado',
      'Diagnostico_Analise',
      'Onde_Agir',
      'Prioridade',
    ];
    const rows = drilldownItems.map((it) => [
      `"${it.serial || ''}"`,
      `"${it.materialSap || ''}"`,
      `"${it.centroSap || ''}"`,
      `"${it.depositoSap || ''}"`,
      `"${it.materialWms || ''}"`,
      `"${it.depositoWms || ''}"`,
      `"${it.localWms || ''}"`,
      `"${it.lote || it.loteWms || ''}"`,
      `"${it.loteLiberado || ''}"`,
      `"${(it.analise || '').replace(/"/g, '""')}"`,
      `"${it.ondeAgir || ''}"`,
      `"${it.prioridade || ''}"`,
    ]);

    const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix =
      selectedAnalise !== 'TODAS'
        ? selectedAnalise.replace(/\s+/g, '_')
        : ownerFilter !== 'TODOS'
        ? ownerFilter
        : 'Geral';
    link.download = `MIGOU_Plano_Acao_Estoque_${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!analytics) {
    return (
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mx-auto shadow-xs">
          <BarChart3 className="w-8 h-8" />
        </div>
        <div className="max-w-xl mx-auto space-y-1.5">
          <h3 className="text-lg font-extrabold text-slate-900">
            Dashboard Executivo de Batimento & Gargalos (SAP ⟷ Sênior WMS)
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Para visualizar todos os indicadores de acuracidade, matriz De-Para de depósitos, gargalos por rua/endereço e planos de ação para o Time Buiatte e Gestão SAP, importe a planilha de{' '}
            <strong>Batimento de Estoque (.xlsx)</strong> ou as duas bases brutas do{' '}
            <strong>Sênior WMS (Estoque Local por Lote + Gerenciador de Informações Específicas)</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenWmsImporter}
            className="px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-amber-300" />
            <span>Carregar Base Batimento / Sênior WMS Agora</span>
          </button>
          {!iq09Snapshot && (
            <button
              type="button"
              onClick={onOpenIq09Importer}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-flex items-center gap-2 border border-slate-300 cursor-pointer"
            >
              <Database className="w-4 h-4 text-[#00609C]" />
              <span>Carregar Base IQ09 SAP</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. FAIXA EXECUTIVA: SAÚDE DO ESTOQUE & DIVISÃO DE RESPONSABILIDADE (ONDE AGIR) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {/* Card 1: Acuracidade Geral SAP x WMS */}
        <button
          type="button"
          onClick={() => {
            setOwnerFilter(ownerFilter === 'Alinhado' ? 'TODOS' : 'Alinhado');
            setSelectedAnalise('TODAS');
            setSelectedCrossPair('TODOS');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            ownerFilter === 'Alinhado'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/50 shadow-md'
              : 'bg-white/95 border-slate-200 hover:border-emerald-300 shadow-xs'
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500" />
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
            <span>1. Estoque Alinhado (OK)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
            {analytics.alignedCount.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] font-bold text-emerald-700 mt-0.5">
            {analytics.accuracyPct}% de acuracidade ({analytics.total.toLocaleString('pt-BR')} UIIs)
          </div>
        </button>

        {/* Card 2: Ação Time Buiatte — Sênior WMS (Sistêmico/Endereçamento) */}
        <button
          type="button"
          onClick={() => {
            setOwnerFilter(ownerFilter === 'WMS' ? 'TODOS' : 'WMS');
            setSelectedAnalise('TODAS');
            setSelectedCrossPair('TODOS');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            ownerFilter === 'WMS'
              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/50 shadow-md'
              : 'bg-white/95 border-slate-200 hover:border-indigo-300 shadow-xs'
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-1 bg-indigo-600" />
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-indigo-900">
            <span>2. Agir no Sênior WMS</span>
            <Wrench className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-950 mt-1 tabular-nums">
            {analytics.actionWmsCount.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 leading-tight">
            Rua centro errado, IQC, local inativo, lote bloq.
          </div>
        </button>

        {/* Card 3: Ação Time Buiatte — Físico (Armazém/Pallets) */}
        <button
          type="button"
          onClick={() => {
            setOwnerFilter(ownerFilter === 'Físico' ? 'TODOS' : 'Físico');
            setSelectedAnalise('TODAS');
            setSelectedCrossPair('TODOS');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            ownerFilter === 'Físico'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/50 shadow-md'
              : 'bg-white/95 border-slate-200 hover:border-amber-300 shadow-xs'
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-1 bg-amber-500" />
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
            <span>3. Agir no Físico (CD)</span>
            <MapPin className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-950 mt-1 tabular-nums">
            {analytics.actionFisicoCount.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 leading-tight">
            Desmembrar multi-data ({analytics.desmembrarFisicoMultiDataItems.length.toLocaleString('pt-BR')}) e físico
          </div>
        </button>

        {/* Card 4: Ação Time Midea — SAP (MIGO 311 / Baixa B111) */}
        <button
          type="button"
          onClick={() => {
            setOwnerFilter(ownerFilter === 'SAP' ? 'TODOS' : 'SAP');
            setSelectedAnalise('TODAS');
            setSelectedCrossPair('TODOS');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            ownerFilter === 'SAP'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/50 shadow-md'
              : 'bg-white/95 border-slate-200 hover:border-rose-300 shadow-xs'
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-1 bg-rose-600" />
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-rose-900">
            <span>4. Agir no SAP (Midea)</span>
            <Database className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-950 mt-1 tabular-nums">
            {analytics.actionSapCount.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] text-rose-700 font-bold mt-0.5 leading-tight">
            {analytics.furoEstoqueRiscoItems.length.toLocaleString('pt-BR')} p/ baixar p/ B111 agora!
          </div>
        </button>

        {/* Card 5: Triagem Conjunta (Só no WMS / Só no SAP / Stage) */}
        <button
          type="button"
          onClick={() => {
            setOwnerFilter(ownerFilter === 'A definir' ? 'TODOS' : 'A definir');
            setSelectedAnalise('TODAS');
            setSelectedCrossPair('TODOS');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            ownerFilter === 'A definir'
              ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-400/50 shadow-md'
              : 'bg-white/95 border-slate-200 hover:border-purple-300 shadow-xs'
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-1 bg-purple-600" />
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-purple-900">
            <span>5. Triagem Gestão (Sobra/Stage)</span>
            <Layers className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-950 mt-1 tabular-nums">
            {analytics.actionDefinirCount.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 leading-tight">
            Só WMS ({analytics.apenasWmsSemSapItems.length.toLocaleString('pt-BR')}) • Só SAP ({analytics.apenasSapSemWmsItems.length.toLocaleString('pt-BR')})
          </div>
        </button>

        {/* Card 6: Trava Breaker B111 (Falta Reconhecida Bloqueada) */}
        <button
          type="button"
          onClick={() => {
            setOwnerFilter('TODOS');
            setSelectedAnalise('Falta - desconsiderar');
            setSelectedCrossPair('TODOS');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            selectedAnalise === 'Falta - desconsiderar'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md'
              : 'bg-white/95 border-slate-200 hover:border-slate-400 shadow-xs'
          }`}
        >
          <div className="absolute top-0 inset-x-0 h-1 bg-slate-800" />
          <div
            className={`flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider ${
              selectedAnalise === 'Falta - desconsiderar' ? 'text-amber-300' : 'text-slate-700'
            }`}
          >
            <span>6. Trava B111 (Em Falta)</span>
            <Lock className="w-4 h-4 text-rose-500" />
          </div>
          <div
            className={`text-2xl font-black mt-1 tabular-nums ${
              selectedAnalise === 'Falta - desconsiderar' ? 'text-white' : 'text-slate-900'
            }`}
          >
            {analytics.b111RetornoIndevidoRiscoItems.length.toLocaleString('pt-BR')}
          </div>
          <div
            className={`text-[11px] mt-0.5 leading-tight ${
              selectedAnalise === 'Falta - desconsiderar' ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            Protegidos pelo Breaker contra retorno indevido
          </div>
        </button>
      </div>

      {/* 2. PAINEL DE INSIGHTS CRÍTICOS & AÇÃO RÁPIDA DE GESTÃO DE ESTOQUE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Insight Crítico 1: Risco de Furo de Estoque / Corte de Pedido (Livre no SAP, mas em Falta no WMS) */}
        <div className="bg-white/95 rounded-2xl border-2 border-rose-200 p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-black text-[10px] uppercase tracking-wider">
                🚨 RISCO DE CORTE DE PEDIDO (FURO DE ESTOQUE)
              </span>
              <span className="text-xs font-mono font-extrabold text-rose-700">
                {analytics.furoEstoqueRiscoItems.length.toLocaleString('pt-BR')} UIIs
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-slate-900">
              Livres no SAP (`B110`/`B114`), mas em `SOBRA/FALTA` no Sênior WMS
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Estes seriais constam como <strong>Estoque Livre no SAP</strong> (podendo cair remessa/pedido de venda a qualquer minuto), porém no Sênior WMS estão alocados em endereço de falta (<code>F0002001011</code>). A recomendação da base é <strong>"Mover no SAP para B111"</strong> imediatamente.
            </p>
          </div>
          <div className="pt-2 border-t border-rose-100 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setOwnerFilter('TODOS');
                setSelectedAnalise('Mover no SAP para B111');
                setSelectedCrossPair('TODOS');
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtrar {analytics.furoEstoqueRiscoItems.length} Seriais p/ Baixar p/ B111</span>
            </button>

            {analytics.furoEstoqueRiscoItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const first = analytics.furoEstoqueRiscoItems[0];
                  const sameSkuBatch = analytics.furoEstoqueRiscoItems
                    .filter(
                      (i) =>
                        i.materialSap === first.materialSap &&
                        i.centroSap === first.centroSap &&
                        i.depositoSap === first.depositoSap
                    )
                    .slice(0, 50)
                    .map((i) => i.serial);
                  onOpenNewRequestWithPreset({
                    material: first.materialSap || first.materialWms,
                    seriais: sameSkuBatch,
                    centro: first.centroSap || 'B124',
                    depositoOrigem: first.depositoSap || 'B110',
                    depositoDestino: 'B111',
                  });
                }}
                className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                title="Abrir solicitação MIGO 311 de ajuste para B111 do primeiro lote de SKU"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Solicitar Ajuste B111</span>
              </button>
            )}
          </div>
        </div>

        {/* Insight Crítico 2: Desalinhamento de Rua/Centro & Pallets Misto no Sênior WMS */}
        <div className="bg-white/95 rounded-2xl border-2 border-indigo-200 p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-black text-[10px] uppercase tracking-wider">
                🏢 GARGALO #1 DO ARMÁZEM (SÊNIOR WMS)
              </span>
              <span className="text-xs font-mono font-extrabold text-indigo-700">
                {(
                  analytics.palletRuaErradaItems.length +
                  analytics.desmembrarFisicoMultiDataItems.length
                ).toLocaleString('pt-BR')}{' '}
                UIIs
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-slate-900">
              Pallets em Rua de Centro Errado + Desmembramento Físico/Multi-Data
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              O maior volume de divergências operacionais do CD concentra-se em{' '}
              <strong>{analytics.palletRuaErradaItems.length.toLocaleString('pt-BR')} seriais</strong> posicionados em ruas dedicadas a outro Centro SAP e{' '}
              <strong>{analytics.desmembrarFisicoMultiDataItems.length.toLocaleString('pt-BR')} seriais</strong> exigindo desmembramento físico/multi-data no pallet antes de movimentar.
            </p>
          </div>
          <div className="pt-2 border-t border-indigo-100 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOwnerFilter('TODOS');
                setSelectedAnalise('Mover pallet para a rua do centro correto');
                setSelectedCrossPair('TODOS');
              }}
              className="px-3 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>Ver Rua Errada ({analytics.palletRuaErradaItems.length.toLocaleString('pt-BR')})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOwnerFilter('Físico');
                setSelectedAnalise('TODAS');
                setSelectedCrossPair('TODOS');
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>Ver Desmembrar Físico ({analytics.actionFisicoCount.toLocaleString('pt-BR')})</span>
            </button>
          </div>
        </div>

        {/* Insight Crítico 3: Seriais Fantasmas (Apenas no WMS vs Apenas no SAP) + Recuperação B111 */}
        <div className="bg-white/95 rounded-2xl border-2 border-amber-200 p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-black text-[10px] uppercase tracking-wider">
                🔍 DESCASAMENTO DE BASES (SOBRA × FALTA)
              </span>
              <span className="text-xs font-mono font-extrabold text-amber-800">
                {(
                  analytics.apenasWmsSemSapItems.length + analytics.apenasSapSemWmsItems.length
                ).toLocaleString('pt-BR')}{' '}
                UIIs
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-slate-900">
              {analytics.apenasWmsSemSapItems.length.toLocaleString('pt-BR')} Só no Sênior WMS vs.{' '}
              {analytics.apenasSapSemWmsItems.length.toLocaleString('pt-BR')} Só no SAP
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Existem <strong>{analytics.apenasWmsSemSapItems.length.toLocaleString('pt-BR')} seriais</strong> ocupando endereço físico no WMS sem saldo ativo na <code>IQ09</code> (sobra física ou faturados não baixados no WMS) e{' '}
              <strong>{analytics.b111RecuperaveisItems.length} seriais</strong> em <code>B111</code> no SAP que já têm endereço livre no WMS para conferência física.
            </p>
          </div>
          <div className="pt-2 border-t border-amber-100 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOwnerFilter('TODOS');
                setSelectedAnalise('Serial existe apenas no WMS');
                setSelectedCrossPair('TODOS');
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs cursor-pointer transition-colors"
            >
              Só no WMS ({analytics.apenasWmsSemSapItems.length.toLocaleString('pt-BR')})
            </button>
            <button
              type="button"
              onClick={() => {
                setOwnerFilter('TODOS');
                setSelectedAnalise('Serial existe apenas no SAP');
                setSelectedCrossPair('TODOS');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs cursor-pointer transition-colors"
            >
              Só no SAP ({analytics.apenasSapSemWmsItems.length.toLocaleString('pt-BR')})
            </button>
          </div>
        </div>
      </div>

      {/* 3. VISÃO LADO A LADO: RANKING DE GARGALOS (PARETO) + MATRIZ DE-PARA (SAP x WMS) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Coluna Esquerda (7 cols): Pareto de Diagnósticos de Divergência ("O que precisa corrigir e Onde") */}
        <div className="xl:col-span-7 bg-white/95 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#00609C]" />
                <span>Pareto de Gargalos Operacionais (Diagnóstico do Batimento)</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Clique em qualquer linha para filtrar os seriais e exportar a lista de correção
              </p>
            </div>
            {selectedAnalise !== 'TODAS' && (
              <button
                type="button"
                onClick={() => setSelectedAnalise('TODAS')}
                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
              >
                ✕ Limpar Filtro
              </button>
            )}
          </div>

          <div className="p-3.5 space-y-2 max-h-[380px] overflow-y-auto">
            {analytics.analiseRanking.slice(0, 14).map((item) => {
              const pct = Math.max(
                2,
                Math.round((item.count / Math.max(1, analytics.analiseRanking[0].count)) * 100)
              );
              const isSelected = selectedAnalise === item.analise;
              const ondeUpper = item.ondeAgir.toUpperCase();

              return (
                <button
                  key={item.analise}
                  type="button"
                  onClick={() =>
                    setSelectedAnalise(isSelected ? 'TODAS' : item.analise)
                  }
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/90 border-[#00609C] ring-2 ring-[#0083CA]/30'
                      : 'bg-slate-50/60 hover:bg-slate-100/80 border-slate-200/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${
                          ondeUpper.includes('WMS')
                            ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                            : ondeUpper.includes('FÍSIC') || ondeUpper.includes('FISIC')
                            ? 'bg-amber-100 text-amber-950 border border-amber-300'
                            : ondeUpper.includes('SAP')
                            ? 'bg-rose-100 text-rose-900 border border-rose-300'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        Agir: {item.ondeAgir}
                      </span>
                      <span className="font-extrabold text-slate-900 truncate">
                        {item.analise}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.criticoCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px]">
                          {item.criticoCount.toLocaleString('pt-BR')} críticos
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">
                        {item.distinctLocals.size.toLocaleString('pt-BR')} locais
                      </span>
                      <span className="font-mono font-black text-slate-900 text-xs">
                        {item.count.toLocaleString('pt-BR')} UIIs
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        ondeUpper.includes('SAP')
                          ? 'bg-rose-600'
                          : ondeUpper.includes('WMS')
                          ? 'bg-indigo-600'
                          : ondeUpper.includes('FÍSIC') || ondeUpper.includes('FISIC')
                          ? 'bg-amber-500'
                          : 'bg-purple-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coluna Direita (5 cols): Matriz De-Para de Divergências (Depósito SAP vs Depósito Sênior WMS) */}
        <div className="xl:col-span-5 bg-white/95 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Matriz De-Para: Depósito SAP × Depósito WMS</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Principais cruzamentos onde a posição SAP difere da posição WMS
              </p>
            </div>
            {selectedCrossPair !== 'TODOS' && (
              <button
                type="button"
                onClick={() => setSelectedCrossPair('TODOS')}
                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
              >
                ✕ Limpar Par
              </button>
            )}
          </div>

          <div className="p-3.5 space-y-2 max-h-[380px] overflow-y-auto">
            {analytics.divergentCrossDepositRanking.slice(0, 12).map((pair) => {
              const isSelected = selectedCrossPair === pair.key;
              return (
                <button
                  key={pair.key}
                  type="button"
                  onClick={() =>
                    setSelectedCrossPair(isSelected ? 'TODOS' : pair.key)
                  }
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-400/30'
                      : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300">
                        SAP: {pair.depSap}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-950 border border-indigo-300">
                        WMS: {pair.depWms}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">
                      Diagnóstico principal: <strong>{pair.mainAnalise}</strong> ({pair.ondeAgir})
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-black text-sm text-slate-900">
                      {pair.count.toLocaleString('pt-BR')}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold">seriais</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. SAÚDE POR CENTRO SAP & TOP 10 SKUs COM MAIOR ÍNDICE DE DIVERGÊNCIA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Acuracidade por Centro SAP */}
        <div className="lg:col-span-5 bg-white/95 rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#00609C]" />
              <span>Acuracidade por Centro SAP (CD MG)</span>
            </h4>
            <span className="text-[11px] text-slate-500">Alinhados vs Divergentes</span>
          </div>

          <div className="space-y-2.5">
            {analytics.centroStats.map((c) => {
              const acc = c.total > 0 ? Math.round((c.aligned / c.total) * 100) : 0;
              const info = SAP_CENTROS_CATALOG[c.centro];
              return (
                <div
                  key={c.centro}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#002664] text-white font-mono font-extrabold text-[11px]">
                        {c.centro}
                      </span>
                      <span className="font-bold text-slate-700 text-[11px] truncate max-w-[180px]">
                        {info ? `${info.originType} • ${info.segment}` : 'Centro SAP'}
                      </span>
                    </div>
                    <div className="font-mono text-xs">
                      <strong className="text-emerald-700">{acc}% OK</strong> •{' '}
                      <span className="text-rose-700 font-bold">
                        {c.divergent.toLocaleString('pt-BR')} div.
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-rose-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${acc}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 10 SKUs (Materiais) Ofensores */}
        <div className="lg:col-span-7 bg-white/95 rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <PackageSearch className="w-4 h-4 text-rose-600" />
                <span>Top 10 SKUs (Materiais) com Maior Volume de Divergências</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Clique em um SKU para auditar todos os seriais divergentes daquele produto
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {analytics.topSkusDivergent.map((s, idx) => (
              <button
                key={s.sku}
                type="button"
                onClick={() => setDrillSearch(drillSearch === s.sku ? '' : s.sku)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  drillSearch === s.sku
                    ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-300'
                    : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 font-extrabold text-[10px] flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="font-mono font-extrabold text-xs text-[#002664] truncate">
                      {s.sku}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    Gargalo: <strong>{s.topIssue}</strong>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-black text-xs text-rose-700">
                    {s.totalDivergent.toLocaleString('pt-BR')} UIIs
                  </div>
                  {s.criticoCount > 0 && (
                    <div className="text-[9px] font-bold text-red-600">
                      {s.criticoCount} críticos
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 5. TABELA DE DRILL-DOWN E PLANO DE AÇÃO EXPORTÁVEL */}
      <div className="bg-white/95 rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-extrabold text-slate-900">
                Lista Operacional de Correção (Drill-Down do Cruzamento SAP ⟷ WMS)
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-[#002664] text-white font-mono font-extrabold text-xs">
                {drilldownItems.length.toLocaleString('pt-BR')} seriais filtrados
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtre por responsável (WMS, Físico, SAP), prioridade ou endereço e exporte a planilha pronta para execução da equipe.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={drillSearch}
                onChange={(e) => setDrillSearch(e.target.value)}
                placeholder="Buscar SKU, Serial, Rua/Local..."
                className="pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-xl w-56 focus:ring-2 focus:ring-[#0083CA]"
              />
              {drillSearch && (
                <button
                  type="button"
                  onClick={() => setDrillSearch('')}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-700"
            >
              <option value="TODAS">Prioridade: Todas</option>
              <option value="Crítico">🔥 Apenas Prioridade Crítica</option>
              <option value="Normal">⚡ Prioridade Normal</option>
              <option value="Baixa">🟢 Prioridade Baixa (OK)</option>
            </select>

            {(ownerFilter !== 'TODOS' ||
              selectedAnalise !== 'TODAS' ||
              selectedCrossPair !== 'TODOS' ||
              priorityFilter !== 'TODAS' ||
              drillSearch) && (
              <button
                type="button"
                onClick={() => {
                  setOwnerFilter('TODOS');
                  setSelectedAnalise('TODAS');
                  setSelectedCrossPair('TODOS');
                  setPriorityFilter('TODAS');
                  setDrillSearch('');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Resetar Filtros
              </button>
            )}

            <button
              type="button"
              onClick={handleExportDrilldownCSV}
              disabled={drilldownItems.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Plano de Ação ({drilldownItems.length.toLocaleString('pt-BR')})</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3">UII (Serial)</th>
                <th className="py-2.5 px-3">SKU (Material)</th>
                <th className="py-2.5 px-3">Posição SAP (IQ09)</th>
                <th className="py-2.5 px-3">Posição Sênior WMS</th>
                <th className="py-2.5 px-3">Endereço / Lote WMS</th>
                <th className="py-2.5 px-3">Diagnóstico do Batimento</th>
                <th className="py-2.5 px-3">Onde Agir & Prioridade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 font-mono text-[11px]">
              {drilldownItems.slice(0, 120).map((it, idx) => {
                const prioUpper = (it.prioridade || '').toUpperCase();
                const isCrit = prioUpper.includes('CRÍTIC') || prioUpper.includes('CRITIC');
                return (
                  <tr key={`${it.serial}-${idx}`} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-extrabold text-slate-900">{it.serial}</td>
                    <td className="py-2 px-3 font-bold text-[#002664]">
                      {it.materialSap || it.materialWms || '-'}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {it.depositoSap ? (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 font-mono font-bold text-[10px]">
                          {it.centroSap ? `${it.centroSap} • ` : ''}
                          {it.depositoSap}
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold text-[10px]">Sem Saldo SAP</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {it.depositoWms ? (
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-950 border border-indigo-300 font-mono font-bold text-[10px]">
                          {it.depositoWms}
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold text-[10px]">Sem Saldo WMS</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-700">
                      <span className="font-bold">{it.localWms || 'S/ Local'}</span>
                      {it.lote ? ` • Lote ${it.lote}` : ''}
                      {it.loteLiberado === 'N' ? (
                        <span className="ml-1 px-1 rounded bg-red-100 text-red-800 text-[9px] font-sans font-bold">
                          🔒 Bloq
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 px-3 font-sans font-bold text-slate-800">
                      {it.analise}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-bold text-[10px]">
                          {it.ondeAgir || 'Nenhum'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                            isCrit
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {it.prioridade || 'Normal'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {drilldownItems.length > 120 && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center">
            Exibindo os primeiros <strong>120</strong> de{' '}
            <strong>{drilldownItems.length.toLocaleString('pt-BR')}</strong> registros filtrados para manter velocidade máxima. Use o botão{' '}
            <strong>"Exportar Plano de Ação"</strong> para baixar todos os {drilldownItems.length.toLocaleString('pt-BR')} registros em Excel (CSV).
          </div>
        )}
      </div>
    </div>
  );
};
