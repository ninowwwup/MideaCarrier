import React from 'react';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Wrench,
  Users,
  Database,
  FilterX,
} from 'lucide-react';
import { WMSBreakerVerdict } from '../types/wmsBatimento';

export interface BlockedTransferAttempt {
  material: string;
  serial: string;
  centro: string;
  depositoOrigem: string;
  depositoDestino: string;
  verdict: WMSBreakerVerdict;
}

interface WMSBreakerWarningModalProps {
  isOpen: boolean;
  blockedItems?: BlockedTransferAttempt[];
  blockedAttempts?: BlockedTransferAttempt[];
  validItemsCount?: number;
  validSerialsCount?: number;
  totalSerialsCount?: number;
  isAdminRole?: boolean;
  onCloseAndFix: () => void;
  /** Permite ao operador remover automaticamente os seriais recusados e prosseguir apenas com os seriais 100% validados no Sênior WMS */
  onProceedOnlyWithValid?: () => void;
  /** Permite aplicar uma correção de rota sugerida pelo próprio Sênior WMS (quando aplicável em solicitação individual) */
  onApplySuggestedRoute?: (fix: {
    material?: string;
    centro?: string;
    depositoOrigem?: string;
    depositoDestino?: string;
  }) => void;
  /** Exclusivo para gestores/admin Midea caso precisem forçar uma exceção documentada */
  onAdminForceOverride?: () => void;
}

export const WMSBreakerWarningModal: React.FC<WMSBreakerWarningModalProps> = ({
  isOpen,
  blockedItems: rawBlockedItems,
  blockedAttempts,
  validItemsCount: rawValidItemsCount,
  validSerialsCount,
  isAdminRole = false,
  onCloseAndFix,
  onProceedOnlyWithValid,
  onApplySuggestedRoute,
  onAdminForceOverride,
}) => {
  const blockedItems = rawBlockedItems || blockedAttempts || [];
  const validItemsCount = rawValidItemsCount ?? validSerialsCount ?? 0;

  if (!isOpen || blockedItems.length === 0) return null;

  const firstSuggestion =
    blockedItems.length === 1 ? blockedItems[0].verdict.suggestedFix : undefined;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border-2 border-rose-500 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header de Trava Breaker */}
        <div className="shrink-0 px-4 sm:px-6 py-4 bg-gradient-to-r from-rose-900 via-rose-700 to-red-600 text-white flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white/15 border border-white/25 text-rose-100 shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-300 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                  TRAVA BREAKER • SÊNIOR WMS ⟷ SAP
                </span>
                <span className="text-xs font-bold text-rose-100">
                  {blockedItems.length}{' '}
                  {blockedItems.length === 1
                    ? 'serial recusado pela validação'
                    : 'seriais recusados pela validação'}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold mt-1 leading-snug">
                Solicitação Indevida Bloqueada: Divergência com o Sênior WMS
              </h3>
              <p className="text-xs text-rose-100/90 mt-0.5">
                O MIGOU só permite solicitar movimentação no SAP quando o serial já está regularizado e posicionado no depósito correto dentro do Sênior WMS.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseAndFix}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar alerta"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Diagnóstico Detalhado e Plano de Ação para o Time Buiatte */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain bg-slate-50/70">
          {/* Resumo Educativo da Regra Operacional */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-extrabold text-amber-900 text-[13px]">
                Por que o MIGOU bloqueou esta solicitação?
              </div>
              <p className="leading-relaxed text-amber-900/90">
                Quando um serial sai de <strong>B111 (Falta)</strong> ou <strong>B148 (Triagem)</strong> para o{' '}
                <strong>Estoque Livre (B110 / B114 / B413)</strong> no SAP, o saldo fica imediatamente disponível para pedidos de venda. Se no{' '}
                <strong>Sênior WMS</strong> o serial ainda estiver em <strong>FALTA</strong>,{' '}
                <strong>SOBRA/FALTA</strong>, bloqueado ou sem saldo, a operação sofre{' '}
                <strong>furo de estoque, corte de pedido e perda de rastreabilidade</strong>.
              </p>
            </div>
          </div>

          {/* Lista de Seriais Bloqueados e Onde Agir */}
          <div className="space-y-3">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center justify-between">
              <span>Diagnóstico por Serial no Batimento de Estoque ({blockedItems.length}):</span>
              <span className="text-[11px] font-semibold text-rose-700">
                Ação necessária do Time Buiatte / Gestão
              </span>
            </div>

            {blockedItems.map((item, idx) => {
              const { verdict } = item;
              const wms = verdict.wmsItem;
              const iq = verdict.iq09Item;

              return (
                <div
                  key={`${item.serial}-${idx}`}
                  className="bg-white rounded-xl border-2 border-rose-200 shadow-xs overflow-hidden"
                >
                  {/* Faixa Superior do Card do Serial */}
                  <div className="px-3.5 py-2.5 bg-rose-50/90 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono font-extrabold text-xs">
                        {item.serial}
                      </span>
                      <span className="text-xs font-bold text-slate-800 font-mono">
                        SKU: {item.material || wms?.materialSap || wms?.materialWms || 'N/I'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[11px] font-mono font-bold text-slate-700">
                        <span>Tentativa SAP ({item.centro}):</span>
                        <span className="text-amber-700">{item.depositoOrigem}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-emerald-700">{item.depositoDestino}</span>
                      </span>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-[11px] font-extrabold">
                      {verdict.badgeLabel}
                    </span>
                  </div>

                  {/* Comparativo Lado a Lado: SAP (IQ09) vs Sênior WMS (Batimento) */}
                  <div className="p-3.5 space-y-3 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {/* Posição SAP */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <Database className="w-3 h-3 text-[#00609C]" />
                          <span>Posição Contábil no SAP (IQ09)</span>
                        </div>
                        <div className="mt-1 font-mono font-bold text-slate-800 text-xs">
                          Centro: <span className="text-[#002664]">{iq?.centro || wms?.centroSap || item.centro}</span> • Depósito Atual:{' '}
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            {iq?.deposito || wms?.depositoSap || item.depositoOrigem}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Material SAP: <strong>{iq?.material || wms?.materialSap || item.material}</strong>
                          {iq?.statusSistema ? ` • Status: ${iq.statusSistema}` : ''}
                        </div>
                      </div>

                      {/* Posição Sênior WMS */}
                      <div className="p-2.5 rounded-lg bg-rose-50/60 border border-rose-300">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800 flex items-center justify-between">
                          <span>Posição Física Real no Sênior WMS</span>
                          {wms?.prioridade && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-200 text-rose-950 text-[9px] font-black">
                              Prioridade: {wms.prioridade}
                            </span>
                          )}
                        </div>
                        {wms && wms.depositoWms ? (
                          <>
                            <div className="mt-1 font-mono font-bold text-rose-950 text-xs">
                              Depósito WMS:{' '}
                              <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white font-extrabold">
                                {wms.depositoWms}
                              </span>{' '}
                              • Local: <span className="underline">{wms.localWms || 'S/ Local'}</span>
                            </div>
                            <div className="text-[11px] text-rose-900 mt-0.5 font-medium">
                              Lote: <strong className="font-mono">{wms.lote || '-'}</strong> (Liberado:{' '}
                              <strong>{wms.loteLiberado || '-'}</strong>) • Diagnóstico:{' '}
                              <strong className="bg-amber-200/80 text-slate-950 px-1 rounded">
                                {wms.analise}
                              </strong>
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-rose-900 font-bold">
                            🚫 Serial NÃO EXISTE na base do Sênior WMS ({wms?.analise || 'Sem saldo físico no WMS'})
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Explicação do Porquê é Indevida */}
                    <div className="p-2.5 rounded-lg bg-slate-100/90 border border-slate-200/90 text-slate-800">
                      <div className="font-extrabold text-rose-900 mb-0.5">
                        📌 Por que esta solicitação é indevida:
                      </div>
                      <p className="leading-relaxed text-slate-700">{verdict.whyExplanation}</p>
                    </div>

                    {/* Plano de Ação Recomendado para o Time Buiatte */}
                    <div className="p-3 rounded-lg bg-blue-50/80 border border-blue-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="font-extrabold text-[#002664] flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-[#0083CA]" />
                          <span>O que o Time Buiatte deve fazer agora:</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-[#002664] text-white text-[10px] font-bold">
                          Onde Agir: {wms?.ondeAgir || verdict.actionOwner}
                        </span>
                      </div>
                      <ul className="space-y-1 pl-4 list-disc text-slate-700 leading-relaxed">
                        {verdict.buiatteActionPlan.map((step, sIdx) => (
                          <li key={sIdx} className="font-medium">
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé com Ações Claras */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Users className="w-4 h-4 text-[#00609C] shrink-0" />
            <span>
              Em caso de dúvida sobre o saldo físico, acione o <strong>Supervisor Sênior WMS / Midea</strong>.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            {firstSuggestion && onApplySuggestedRoute && (
              <button
                type="button"
                onClick={() => onApplySuggestedRoute(firstSuggestion)}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs transition-colors shadow-xs cursor-pointer"
              >
                {firstSuggestion.label}
              </button>
            )}

            {validItemsCount > 0 && onProceedOnlyWithValid && (
              <button
                type="button"
                onClick={onProceedOnlyWithValid}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <FilterX className="w-4 h-4" />
                <span>
                  Remover {blockedItems.length} Indevido(s) e Enviar {validItemsCount} Validado(s)
                </span>
              </button>
            )}

            {isAdminRole && onAdminForceOverride && (
              <button
                type="button"
                onClick={onAdminForceOverride}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors cursor-pointer"
                title="Exclusivo Administrador Midea: Ignorar trava do Batimento WMS sob responsabilidade da gestão"
              >
                Forçar Exceção (Gestor SAP)
              </button>
            )}

            <button
              type="button"
              onClick={onCloseAndFix}
              className="px-5 py-2 rounded-xl bg-[#002664] hover:bg-[#003380] text-white font-extrabold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-cyan-300" />
              <span>Entendi — Voltar e Corrigir no WMS</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
