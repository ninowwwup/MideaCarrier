import React, { useState, useMemo } from 'react';
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Layers,
  Package,
  Wrench,
  Search,
  Sparkles,
  BookOpen,
  HelpCircle,
  PlusCircle,
} from 'lucide-react';
import {
  SAP_CENTROS_CATALOG,
  SAP_DEPOSITOS_CATALOG,
  SAPDepositInfo,
} from '../utils/sapFormatter';

interface DepositsGuideTabProps {
  onStartRequestWithRoute?: (preset: {
    centro: string;
    depositoOrigem: string;
    depositoDestino: string;
  }) => void;
}

type ScenarioKey =
  | 'liberar_livre'
  | 'blue_service'
  | 'nao_localizado_imediato'
  | 'falta_confirmada'
  | 'item_encontrado'
  | 'avaria_sucata'
  | 'avaria_outlet'
  | 'avaria_slow_movers';

export const DepositsGuideTab: React.FC<DepositsGuideTabProps> = ({
  onStartRequestWithRoute,
}) => {
  // Estados do Simulador Interativo ("Qual Depósito Devo Usar?")
  const [simCentro, setSimCentro] = useState<string>('B158');
  const [simMaterialType, setSimMaterialType] = useState<'PRODUTO' | 'PEÇAS'>('PRODUTO');
  const [simScenario, setSimScenario] = useState<ScenarioKey>('nao_localizado_imediato');

  // Estados de Filtro da Tabela Oficial Unificada
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'livre' | 'inventario' | 'avaria'>('todos');
  const [centroFilter, setCentroFilter] = useState<string>('todos');
  const [appFilter, setAppFilter] = useState<'todos' | 'PRODUTO' | 'PEÇAS'>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentCentroInfo = SAP_CENTROS_CATALOG[simCentro] || SAP_CENTROS_CATALOG.B158;
  const centerSupportsParts = Boolean(currentCentroInfo.freeStockPartsDeposit);

  // Cálculo inteligente da rota recomendada no Simulador
  const simulatedRecommendation = useMemo(() => {
    const c = currentCentroInfo;
    const isParts = simMaterialType === 'PEÇAS';

    // Se escolheu PEÇAS em B123 ou B124, orienta que nos prints oficiais PEÇAS está mapeado em B158/B159 e B179/B180
    if (isParts && !centerSupportsParts) {
      return {
        isSupported: false,
        warningTitle: `Atenção: O centro ${c.code} possui mapeamento padrão apenas para PRODUTO Acabado (B110 / B111 / B112).`,
        warningMessage:
          'Pela tabela oficial, os depósitos específicos de PEÇAS (Estoque Livre B130/B412, Blue Service B416 e Inventário de Peças B152/B153) operam nos centros B158, B159 (Lojas Midea Carrier) e B179, B180 (Pós-Venda). Se for Sucata (B136), ele aceita Peças/Produtos em todos os centros.',
        origem: 'B148',
        destino: 'B136',
        explanation: 'Altere para PRODUTO ou selecione um centro com operação de Peças (B158, B159, B179 ou B180).',
      };
    }

    const freeDeposit = isParts
      ? c.freeStockPartsDeposit || c.freeStockProductDeposit
      : c.freeStockProductDeposit;
    const countDeposit = isParts
      ? c.inventoryCountPartsDeposit || 'B153'
      : c.inventoryCountProductDeposit;
    const shortageDeposit = isParts
      ? c.inventoryShortagePartsDeposit || 'B152'
      : c.inventoryShortageProductDeposit;

    switch (simScenario) {
      case 'liberar_livre':
        return {
          isSupported: true,
          origem: 'B148',
          destino: freeDeposit,
          badgeColor: 'emerald',
          title: `Disponibilizar ${simMaterialType} no Estoque Livre (${freeDeposit})`,
          explanation: `No centro ${c.code} (${c.channelName}), o depósito definitivo de Estoque Livre para ${simMaterialType} é o ${freeDeposit}.`,
          ruleNote: 'Mercadoria em perfeito estado liberada para faturamento/atendimento de pedidos.',
        };

      case 'blue_service':
        if (c.code !== 'B158' && c.code !== 'B159') {
          return {
            isSupported: false,
            warningTitle: `O depósito B416 (Estoque Blue Service) é exclusivo dos centros B158 e B159 (Lojas Midea Carrier).`,
            warningMessage: `No centro ${c.code}, o estoque livre de peças é ${c.freeStockPartsDeposit || 'não aplicável'}. Selecione B158 ou B159 para operações Blue Service.`,
            origem: c.freeStockPartsDeposit || 'B130',
            destino: 'B416',
            explanation: 'Venda de Garantia pelo Centro de Lojas Midea Carrier.',
          };
        }
        return {
          isSupported: true,
          origem: 'B130',
          destino: 'B416',
          badgeColor: 'emerald',
          title: 'Disponibilizar Peça para Estoque Blue Service (B416)',
          explanation: `Nos centros ${c.code} (Lojas Midea Carrier), o depósito B416 é o Estoque Definitivo para venda Blue Service (atendimento de Garantia pelo Centro de Lojas), exclusivo para PEÇAS.`,
          ruleNote: 'Exclusivo para PEÇAS nos centros B158 e B159.',
        };

      case 'nao_localizado_imediato':
        return {
          isSupported: true,
          origem: freeDeposit,
          destino: countDeposit,
          badgeColor: 'amber',
          title: `Item Não Localizado de Imediato ➔ Contagem Transitória (${countDeposit})`,
          explanation: `Quando um(a) ${simMaterialType} não é localizado(a) de forma imediata na separação/endereço no centro ${c.code}, transfira do Estoque Livre (${freeDeposit}) para o depósito transitório de Contagem de Inventário (${countDeposit}).`,
          ruleNote: `${countDeposit} é TRANSITÓRIO: retira o saldo do livre imediatamente para não travar novos pedidos enquanto o time realiza a busca/contagem física.`,
        };

      case 'falta_confirmada':
        return {
          isSupported: true,
          origem: countDeposit,
          destino: shortageDeposit,
          badgeColor: 'rose',
          title: `Falta Confirmada em Inventário ➔ Falta Definitiva (${shortageDeposit})`,
          explanation: `Após a conferência no depósito transitório (${countDeposit}), se o(a) ${simMaterialType} realmente não foi encontrado(a), transfira para ${shortageDeposit} (Falta de Inventário Definitivo de ${simMaterialType}).`,
          ruleNote: `Também pode ser solicitado diretamente (${freeDeposit} ➔ ${shortageDeposit}) quando a falta de inventário já está validada.`,
        };

      case 'item_encontrado':
        return {
          isSupported: true,
          origem: countDeposit,
          destino: freeDeposit,
          badgeColor: 'emerald',
          title: `Item Localizado no Físico ➔ Retornar ao Estoque Livre (${freeDeposit})`,
          explanation: `O material que estava em Contagem (${countDeposit}) ou Falta (${shortageDeposit}) foi localizado fisicamente em perfeito estado! Solicite o retorno para o Estoque Livre (${freeDeposit}) do centro ${c.code}.`,
          ruleNote: `Diferente dos depósitos de Avaria (B136/B149/B137), os depósitos de inventário (${countDeposit}/${shortageDeposit}) PODEM retornar ao estoque livre se o item for encontrado íntegro!`,
        };

      case 'avaria_sucata':
        return {
          isSupported: true,
          origem: freeDeposit,
          destino: 'B136',
          badgeColor: 'red',
          title: `Segregar ${simMaterialType} com Avaria para Sucata (B136 — Definitivo)`,
          explanation: `O material sofreu avaria física grave (sucata). Transfira de ${freeDeposit} para B136 (Depósito definido para avarias de produto/sucata — aplica-se a PEÇAS e PRODUTOS).`,
          ruleNote: '🚫 ATENÇÃO: B136 é Avaria Definitiva! É permitido entrar (Destino B136), mas NUNCA solicitar saída de B136 de volta para o estoque livre.',
        };

      case 'avaria_outlet':
        if (isParts) {
          return {
            isSupported: false,
            warningTitle: 'O depósito B149 (Outlet — Embalagem Retrabalhada) é exclusivo para PRODUTO acabado!',
            warningMessage: 'Para avaria de PEÇAS, utilize o depósito B136 (Sucata — Peças/Produtos).',
            origem: freeDeposit,
            destino: 'B136',
            explanation: 'B149 aplica-se apenas a PRODUTO.',
          };
        }
        return {
          isSupported: true,
          origem: freeDeposit,
          destino: 'B149',
          badgeColor: 'red',
          title: 'Segregar Produto para Outlet / Embalagem Retrabalhada (B149 — Definitivo)',
          explanation: `O produto teve avaria de embalagem e foi retrabalhado para venda Outlet. Transfira de ${freeDeposit} para B149.`,
          ruleNote: '🚫 ATENÇÃO: Produtos em B149 têm venda direcionada para clientes específicos. Proibido solicitar retorno de B149 para o estoque livre!',
        };

      case 'avaria_slow_movers':
        if (isParts) {
          return {
            isSupported: false,
            warningTitle: 'O depósito B137 (Slow Movers — Venda Especial) é exclusivo para PRODUTO acabado!',
            warningMessage: 'Para avaria de PEÇAS, utilize o depósito B136 (Sucata — Peças/Produtos).',
            origem: freeDeposit,
            destino: 'B136',
            explanation: 'B137 aplica-se apenas a PRODUTO.',
          };
        }
        return {
          isSupported: true,
          origem: freeDeposit,
          destino: 'B137',
          badgeColor: 'red',
          title: 'Segregar Produto para Venda Especial / Slow Movers (B137 — Definitivo)',
          explanation: `Produto avariado destinado à venda especial (Slow Movers). Transfira de ${freeDeposit} para B137.`,
          ruleNote: '🚫 ATENÇÃO: Produtos em B137 recebem tratativa comercial específica. Proibido solicitar saída de B137 para o estoque livre!',
        };
    }
  }, [currentCentroInfo, simMaterialType, simScenario, centerSupportsParts]);

  // Lista oficial de depósitos para exibição nos cards/tabela
  const officialDepositsList: SAPDepositInfo[] = useMemo(() => {
    const order = [
      'B130',
      'B114',
      'B416',
      'B412',
      'B413',
      'B110',
      'B111',
      'B112',
      'B152',
      'B153',
      'B136',
      'B149',
      'B137',
    ];
    return order
      .map((code) => SAP_DEPOSITOS_CATALOG[code])
      .filter((dep): dep is SAPDepositInfo => Boolean(dep))
      .filter((dep) => {
        if (categoryFilter === 'livre' && dep.category !== 'estoque_livre' && dep.category !== 'blue_service') {
          return false;
        }
        if (
          categoryFilter === 'inventario' &&
          dep.category !== 'inventario_transitorio' &&
          dep.category !== 'inventario_falta_definitivo'
        ) {
          return false;
        }
        if (categoryFilter === 'avaria' && dep.category !== 'avaria_definitivo') {
          return false;
        }
        if (centroFilter !== 'todos' && !dep.allowedCentros.includes(centroFilter)) {
          return false;
        }
        if (appFilter !== 'todos' && dep.application !== appFilter && dep.application !== 'PEÇAS/PRODUTOS') {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            dep.code.toLowerCase().includes(q) ||
            dep.classification.toLowerCase().includes(q) ||
            dep.definition.toLowerCase().includes(q) ||
            dep.shortTitle.toLowerCase().includes(q) ||
            dep.allowedCentros.some((c) => c.toLowerCase().includes(q)) ||
            dep.channels.some((ch) => ch.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      });
  }, [categoryFilter, centroFilter, appFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. BANNER TOPO EDUCATIVO */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-white/60 shadow-lg p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#002664] text-xs font-extrabold">
              <BookOpen className="w-3.5 h-3.5 text-[#0083CA]" />
              <span>CENTRAL DE INTELIGÊNCIA DE DEPÓSITOS SAP • TIME BUIATTE & TIME MIDEA</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
              Mapa Oficial de Depósitos: Estoque Livre, Faltas/Inventário e Avarias
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Consulte rapidamente qual depósito utilizar em cada Centro (<strong>B123, B124, B158, B159, B179 e B180</strong>) para <strong>Produtos</strong> e <strong>Peças</strong>. Use o simulador interativo abaixo caso tenha dúvida antes de abrir uma solicitação.
            </p>
          </div>

          {/* Legenda Rápida das Cores Oficiais */}
          <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0">
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
              <div className="font-extrabold text-emerald-800 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>Verde • Estoque Livre</span>
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">B110, B114, B130, B416, B412, B413</div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs">
              <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Amarelo • Transitório</span>
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">Contagem: B112 (Prod) / B153 (Peças)</div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs">
              <div className="font-extrabold text-red-800 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                <span>Vermelho • Definitivo</span>
              </div>
              <div className="text-[11px] text-red-700 mt-0.5">Falta (B111/B152) e Avaria (B136/B149/B137)</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SIMULADOR INTERATIVO: "QUAL DEPÓSITO DEVO USAR?" */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border-2 border-[#249ED5]/40 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#002363] via-[#002664] to-[#00609C] px-5 sm:px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15 text-cyan-200">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold">
                Simulador Interativo: Qual Depósito Devo Solicitar?
              </h3>
              <p className="text-xs text-[#C2DEEB]">
                Selecione o Centro, se é Produto ou Peça e o que aconteceu no físico para descobrir a rota exata
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold bg-white/15 px-3 py-1 rounded-full border border-white/20 w-fit">
            ✨ Anti-Erro para o Time Buiatte
          </span>
        </div>

        <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Perguntas Passo a Passo */}
          <div className="lg:col-span-7 space-y-4">
            {/* Passo 1: Centro */}
            <div>
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">
                1º Passo — Escolha o Centro SAP da Mercadoria:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.values(SAP_CENTROS_CATALOG).map((c) => {
                  const active = simCentro === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setSimCentro(c.code);
                        if ((c.code === 'B123' || c.code === 'B124') && simMaterialType === 'PEÇAS') {
                          setSimMaterialType('PRODUTO');
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-[#002664] text-white border-[#002664] shadow-md'
                          : 'bg-slate-50 hover:bg-blue-50/50 text-slate-800 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-sm">{c.code}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            active
                              ? 'bg-white/20 text-cyan-200'
                              : c.originType === 'NACIONAL'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {c.originType}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-1 leading-tight font-medium ${
                          active ? 'text-white/85' : 'text-slate-500'
                        }`}
                      >
                        {c.segment}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Passo 2: Tipo de Material (Produto vs Peças) */}
            <div>
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">
                2º Passo — O material é Produto Acabado ou Peça?
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSimMaterialType('PRODUTO')}
                  className={`p-3 rounded-xl border flex items-center gap-3 text-left transition-all cursor-pointer ${
                    simMaterialType === 'PRODUTO'
                      ? 'bg-blue-50 border-[#0083CA] ring-2 ring-[#0083CA]/30 text-[#002664]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Package className="w-5 h-5 text-[#0083CA] shrink-0" />
                  <div>
                    <div className="font-extrabold text-xs sm:text-sm">PRODUTO ACABADO</div>
                    <div className="text-[11px] text-slate-500">
                      Livre: <strong className="font-mono">{currentCentroInfo.freeStockProductDeposit}</strong> • Falta/Contagem: <strong className="font-mono">B111 / B112</strong>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSimMaterialType('PEÇAS')}
                  className={`p-3 rounded-xl border flex items-center gap-3 text-left transition-all cursor-pointer ${
                    simMaterialType === 'PEÇAS'
                      ? 'bg-blue-50 border-[#0083CA] ring-2 ring-[#0083CA]/30 text-[#002664]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Wrench className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <div className="font-extrabold text-xs sm:text-sm">PEÇAS</div>
                    <div className="text-[11px] text-slate-500">
                      {currentCentroInfo.freeStockPartsDeposit ? (
                        <>
                          Livre: <strong className="font-mono">{currentCentroInfo.freeStockPartsDeposit}</strong> • Falta/Contagem: <strong className="font-mono">B152 / B153</strong>
                        </>
                      ) : (
                        <span>Operação padrão nos centros B158/B159 e B179/B180</span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Passo 3: O que você precisa fazer? */}
            <div>
              <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">
                3º Passo — Qual é a necessidade física na operação?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    id: 'nao_localizado_imediato' as ScenarioKey,
                    icon: '🟡',
                    title: 'Não localizado de imediato',
                    sub: 'Bloquear p/ Contagem Transitória (B112 / B153)',
                  },
                  {
                    id: 'falta_confirmada' as ScenarioKey,
                    icon: '🔴',
                    title: 'Falta de inventário confirmada',
                    sub: 'Transferir p/ Falta Definitiva (B111 / B152)',
                  },
                  {
                    id: 'item_encontrado' as ScenarioKey,
                    icon: '🟢',
                    title: 'Item de falta/contagem foi achado',
                    sub: 'Devolver item localizado ao Estoque Livre',
                  },
                  {
                    id: 'liberar_livre' as ScenarioKey,
                    icon: '🟢',
                    title: 'Liberar Triagem p/ Estoque Livre',
                    sub: 'Disponibilizar item bom p/ venda normal',
                  },
                  {
                    id: 'blue_service' as ScenarioKey,
                    icon: '🔵',
                    title: 'Venda Garantia Blue Service (B416)',
                    sub: 'Peças de garantia nas Lojas (B158 / B159)',
                  },
                  {
                    id: 'avaria_sucata' as ScenarioKey,
                    icon: '🛑',
                    title: 'Material com Avaria (Sucata B136)',
                    sub: 'Segregar peça/produto avariado p/ B136',
                  },
                  {
                    id: 'avaria_outlet' as ScenarioKey,
                    icon: '🛑',
                    title: 'Embalagem Retrabalhada (Outlet B149)',
                    sub: 'Segregar produto p/ venda Outlet B149',
                  },
                  {
                    id: 'avaria_slow_movers' as ScenarioKey,
                    icon: '🛑',
                    title: 'Venda Especial (Slow Movers B137)',
                    sub: 'Segregar produto avariado p/ B137',
                  },
                ].map((sc) => {
                  const active = simScenario === sc.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setSimScenario(sc.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      <span className="text-base leading-none mt-0.5">{sc.icon}</span>
                      <div>
                        <div className="font-bold text-xs">{sc.title}</div>
                        <div className={`text-[10px] mt-0.5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                          {sc.sub}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Coluna Direita: Resultado da Recomendação Inteligente */}
          <div className="lg:col-span-5 bg-slate-50 rounded-2xl border-2 border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#00609C]">
                  Resultado da Inteligência SAP
                </span>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Rota Recomendada para o Time Buiatte
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-900 font-mono font-extrabold text-xs">
                Centro {simCentro}
              </span>
            </div>

            {simulatedRecommendation.isSupported ? (
              <>
                {/* Visual Route Display */}
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex items-center justify-around text-center">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Dep. Origem</div>
                    <div className="mt-1 px-3.5 py-1.5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-mono font-black text-base">
                      {simulatedRecommendation.origem}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 font-medium">
                      {SAP_DEPOSITOS_CATALOG[simulatedRecommendation.origem]?.shortTitle || 'Origem'}
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">{simMaterialType}</span>
                    <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-[#00609C]">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Dep. Destino</div>
                    <div
                      className={`mt-1 px-3.5 py-1.5 rounded-xl font-mono font-black text-base border ${
                        simulatedRecommendation.badgeColor === 'emerald'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : simulatedRecommendation.badgeColor === 'amber'
                          ? 'bg-amber-100 text-amber-900 border-amber-400'
                          : 'bg-red-100 text-red-900 border-red-300'
                      }`}
                    >
                      {simulatedRecommendation.destino}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 font-medium">
                      {SAP_DEPOSITOS_CATALOG[simulatedRecommendation.destino]?.shortTitle || 'Destino'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="font-extrabold text-slate-900 text-sm">
                    {simulatedRecommendation.title}
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    {simulatedRecommendation.explanation}
                  </p>
                  <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-[#002664] text-[11px] leading-relaxed font-medium">
                    💡 <strong>Regra Operacional:</strong> {simulatedRecommendation.ruleNote}
                  </div>
                </div>

                {onStartRequestWithRoute && (
                  <button
                    type="button"
                    onClick={() =>
                      onStartRequestWithRoute({
                        centro: simCentro,
                        depositoOrigem: simulatedRecommendation.origem,
                        depositoDestino: simulatedRecommendation.destino,
                      })
                    }
                    className="w-full py-2.5 px-4 rounded-xl bg-[#002664] hover:bg-[#003380] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-cyan-300" />
                    <span>
                      Usar Rota ({simCentro}: {simulatedRecommendation.origem} ➔ {simulatedRecommendation.destino}) em Nova Solicitação
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2 text-xs">
                <div className="font-extrabold text-sm flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{simulatedRecommendation.warningTitle}</span>
                </div>
                <p className="leading-relaxed text-amber-800">
                  {simulatedRecommendation.warningMessage}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. REGRAS DE OURO (RESUMO DIRETO PARA EVITAR ERROS E RETRABALHO) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Estoque Livre por Centro */}
        <div className="bg-white/95 rounded-2xl border-l-4 border-l-emerald-600 border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold">
              🟢 1. ESTOQUE LIVRE (DEFINITIVO)
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <h4 className="font-extrabold text-slate-900 text-sm">
            Cada Centro tem seu próprio Depósito Livre!
          </h4>
          <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
            <li>
              • <strong>B123 / B124 (E-Commerce & Pós-Venda):</strong> Usa <strong className="font-mono text-emerald-800 bg-emerald-50 px-1 rounded">B110</strong> (Produto).
            </li>
            <li>
              • <strong>B158 / B159 (Lojas Midea Carrier):</strong> Usa <strong className="font-mono text-emerald-800 bg-emerald-50 px-1 rounded">B114</strong> (Produto), <strong className="font-mono text-emerald-800 bg-emerald-50 px-1 rounded">B130</strong> (Peças) e <strong className="font-mono text-emerald-800 bg-emerald-50 px-1 rounded">B416</strong> (Peças Garantia Blue Service).
            </li>
            <li>
              • <strong>B179 / B180 (Pós-Venda):</strong> Usa <strong className="font-mono text-emerald-800 bg-emerald-50 px-1 rounded">B413</strong> (Produto) e <strong className="font-mono text-emerald-800 bg-emerald-50 px-1 rounded">B412</strong> (Peças).
            </li>
          </ul>
        </div>

        {/* Card 2: Não Localizados Imediatos (Transitório vs Definitivo) */}
        <div className="bg-white/95 rounded-2xl border-l-4 border-l-amber-500 border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-extrabold">
              🟡/🔴 2. NÃO LOCALIZADOS & FALTAS
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <h4 className="font-extrabold text-slate-900 text-sm">
            Diferença entre Contagem (Transitório) e Falta (Definitivo)
          </h4>
          <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
            <li>
              • <strong>Não achou de imediato? Use Transitório:</strong> <strong className="font-mono bg-amber-100 text-amber-900 px-1 rounded">B112</strong> (Produto) ou <strong className="font-mono bg-amber-100 text-amber-900 px-1 rounded">B153</strong> (Peças). Bloqueia o saldo para contagem.
            </li>
            <li>
              • <strong>Falta confirmada no inventário? Use Definitivo:</strong> <strong className="font-mono bg-red-100 text-red-800 px-1 rounded">B111</strong> (Produto) ou <strong className="font-mono bg-red-100 text-red-800 px-1 rounded">B152</strong> (Peças).
            </li>
            <li>
              • <strong>Achou o item depois?</strong> Pode voltar de B112/B111/B153/B152 para o Estoque Livre!
            </li>
          </ul>
        </div>

        {/* Card 3: Avarias Definitivas (B136, B149, B137) */}
        <div className="bg-white/95 rounded-2xl border-l-4 border-l-red-600 border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-extrabold">
              🛑 3. AVARIA DE PRODUTO (DEFINITIVO)
            </span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <h4 className="font-extrabold text-slate-900 text-sm">
            Entrada Permitida • Saída p/ Livre Proibida!
          </h4>
          <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
            <li>
              • <strong className="font-mono bg-red-600 text-white px-1 rounded">B136</strong>: Sucata (Peças/Produtos)
            </li>
            <li>
              • <strong className="font-mono bg-red-600 text-white px-1 rounded">B149</strong>: Outlet — Embalagem Retrabalhada (Produto)
            </li>
            <li>
              • <strong className="font-mono bg-red-600 text-white px-1 rounded">B137</strong>: Slow Movers — Venda Especial (Produto)
            </li>
            <li className="text-red-700 font-bold">
              🚫 Nunca solicite transferência saindo de B136, B149 ou B137 para o estoque livre (a linha ficará vermelha).
            </li>
          </ul>
        </div>
      </div>

      {/* 4. TABELA OFICIAL COMPLETA E INTERATIVA (ESPELHO DOS 3 PRINTS) */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                Catálogo Oficial de Depósitos Midea Carrier (Consulta Rápida)
              </h3>
              <p className="text-xs text-slate-500">
                Filtre por grupo, centro ou tipo de material para ver os canais e regras exatas de cada depósito
              </p>
            </div>

            {/* Busca */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar código (ex: B114, B152, Outlet)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0083CA]"
              />
            </div>
          </div>

          {/* Filtros de Categoria, Centro e Aplicação */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'todos', label: 'Todos os Depósitos (13)' },
                { id: 'livre', label: '🟢 Estoque Livre & Blue Service (6)' },
                { id: 'inventario', label: '🟡/🔴 Inventário: Faltas & Contagem (4)' },
                { id: 'avaria', label: '🛑 Avarias Definitivas (3)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    categoryFilter === tab.id
                      ? 'bg-[#002664] text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={centroFilter}
                onChange={(e) => setCentroFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-700"
              >
                <option value="todos">Centro: Todos</option>
                {Object.keys(SAP_CENTROS_CATALOG).map((c) => (
                  <option key={c} value={c}>
                    Centro {c} ({SAP_CENTROS_CATALOG[c].segment})
                  </option>
                ))}
              </select>

              <select
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-700"
              >
                <option value="todos">Para: Produto & Peças</option>
                <option value="PRODUTO">Apenas PRODUTO</option>
                <option value="PEÇAS">Apenas PEÇAS</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabela Visual Idêntica às Planilhas Oficiais + Coluna de Instrução Prática */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white uppercase text-[10px] tracking-wider font-bold">
                <th className="py-3 px-3.5 w-[13%]">Centros</th>
                <th className="py-3 px-3.5 w-[9%] text-center">Depósito</th>
                <th className="py-3 px-3.5 w-[18%] text-center">Classificação & Tipo</th>
                <th className="py-3 px-3.5 w-[20%]">Canais Atendidos</th>
                <th className="py-3 px-3.5 w-[18%]">Definição Oficial</th>
                <th className="py-3 px-3.5 w-[8%] text-center">Para</th>
                <th className="py-3 px-3.5 w-[14%]">Instrução Time Buiatte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {officialDepositsList.map((dep) => {
                const isGreen = dep.colorScheme === 'green';
                const isYellow = dep.colorScheme === 'yellow';
                return (
                  <tr key={dep.code} className="hover:bg-slate-50/90 transition-colors">
                    {/* Centros */}
                    <td className="py-3 px-3.5 align-middle">
                      <div className="flex flex-wrap gap-1">
                        {dep.allowedCentros.map((c) => (
                          <span
                            key={c}
                            className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Código do Depósito */}
                    <td className="py-3 px-3.5 text-center align-middle">
                      <span className="font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-slate-900 text-white shadow-2xs inline-block">
                        {dep.code}
                      </span>
                    </td>

                    {/* Bloco Colorido Fiel à Planilha (Verde / Amarelo / Vermelho) */}
                    <td className="py-3 px-3.5 text-center align-middle">
                      <div
                        className={`p-2 rounded-xl font-bold text-xs shadow-2xs border ${
                          isGreen
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : isYellow
                            ? 'bg-yellow-300 text-slate-950 border-yellow-400'
                            : 'bg-red-600 text-white border-red-700'
                        }`}
                      >
                        <div>{dep.classification.split('—')[0].trim()}</div>
                        <div className="text-[11px] font-black uppercase tracking-wider mt-0.5 underline">
                          {dep.nature}
                        </div>
                      </div>
                    </td>

                    {/* Canais */}
                    <td className="py-3 px-3.5 align-middle">
                      <div className="space-y-0.5">
                        {dep.channels.map((ch, idx) => (
                          <div key={idx} className="text-[10px] font-mono text-slate-600 leading-tight">
                            • {ch}
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Definição Oficial */}
                    <td className="py-3 px-3.5 align-middle font-medium text-slate-800 leading-relaxed">
                      {dep.definition}
                    </td>

                    {/* Para (PRODUTO / PEÇAS) */}
                    <td className="py-3 px-3.5 text-center align-middle">
                      <span
                        className={`inline-block px-2 py-1 rounded-lg text-[10px] font-extrabold border ${
                          dep.application === 'PRODUTO'
                            ? 'bg-blue-50 text-[#002664] border-blue-200'
                            : dep.application === 'PEÇAS'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-purple-50 text-purple-900 border-purple-200'
                        }`}
                      >
                        {dep.application}
                      </span>
                    </td>

                    {/* Instrução Prática */}
                    <td className="py-3 px-3.5 align-middle text-[11px] leading-snug">
                      {dep.category === 'avaria_definitivo' ? (
                        <div className="text-red-800 font-semibold">
                          ✅ <strong>Destino:</strong> OK (Avaria)
                          <br />
                          🚫 <strong>Origem:</strong> Proibido voltar p/ Livre!
                        </div>
                      ) : dep.category === 'inventario_transitorio' ? (
                        <div className="text-amber-900 font-medium">
                          🟡 Usar quando o item <strong>não for localizado de imediato</strong> para contagem.
                        </div>
                      ) : dep.category === 'inventario_falta_definitivo' ? (
                        <div className="text-slate-700 font-medium">
                          🔴 Usar para <strong>baixa de falta de inventário</strong> (ou retorno se achado).
                        </div>
                      ) : (
                        <div className="text-emerald-800 font-medium">
                          🟢 Estoque disponível para comercialização nos centros <strong>{dep.allowedCentros.join('/')}</strong>.
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
