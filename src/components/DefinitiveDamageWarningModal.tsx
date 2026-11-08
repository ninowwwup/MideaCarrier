import React from 'react';
import {
  DEFINITIVE_DAMAGE_DEPOSITS,
  DEFINITIVE_DAMAGE_CENTROS,
  DefinitiveDamageDepositInfo,
} from '../utils/sapFormatter';

interface InvalidRouteSummary {
  material?: string;
  centro?: string;
  depositoOrigem: string;
  depositoDestino: string;
  originInfo: DefinitiveDamageDepositInfo;
}

interface DefinitiveDamageWarningModalProps {
  isOpen: boolean;
  invalidRoutes: InvalidRouteSummary[];
  onCancelAndFix: () => void;
  onConfirmAnyway: () => void;
}

export const DefinitiveDamageWarningModal: React.FC<DefinitiveDamageWarningModalProps> = ({
  isOpen,
  invalidRoutes,
  onCancelAndFix,
  onConfirmAnyway,
}) => {
  if (!isOpen || invalidRoutes.length === 0) return null;

  const firstRoute = invalidRoutes[0];
  const uniqueOrigins = Array.from(new Set(invalidRoutes.map((r) => r.depositoOrigem)));

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border-2 border-red-500 animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-600 to-rose-600 px-5 sm:px-6 py-4 text-white flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 border border-white/25 text-xl">
            🚨
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest bg-black/25 px-2 py-0.5 rounded-md">
              Atenção • Regra de Estoque Midea Carrier
            </span>
            <h2 className="text-sm sm:text-base font-extrabold mt-0.5 leading-snug">
              Solicitação Incorreta: Saída de Depósito de Avaria Definitiva
            </h2>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs sm:text-sm text-red-900 leading-relaxed">
            {invalidRoutes.length === 1 ? (
              <>
                Você está solicitando uma transferência saindo do depósito de origem{' '}
                <strong className="font-mono bg-red-600 text-white px-1.5 py-0.5 rounded">
                  {firstRoute.depositoOrigem}
                </strong>{' '}
                para o depósito{' '}
                <strong className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                  {firstRoute.depositoDestino}
                </strong>
                {firstRoute.centro ? (
                  <>
                    {' '}
                    no centro <strong className="font-mono">{firstRoute.centro}</strong>
                  </>
                ) : null}
                .
              </>
            ) : (
              <>
                Foram identificadas <strong>{invalidRoutes.length} solicitações</strong> saindo de depósito(s) de Avaria Definitiva (
                {uniqueOrigins.map((o, idx) => (
                  <React.Fragment key={o}>
                    {idx > 0 && ', '}
                    <strong className="font-mono bg-red-600 text-white px-1.5 py-0.5 rounded">{o}</strong>
                  </React.Fragment>
                ))}
                ) para o estoque livre.
              </>
            )}
            <br />
            <br />
            <strong>Por que essa solicitação está errada?</strong>
            <br />
            Os depósitos <strong>B136, B149 e B137</strong> são de{' '}
            <strong>Avaria de Produto — Definitivo</strong>. Materiais alocados neles já sofreram avaria e recebem tratativa comercial/sucata específica para clientes específicos —{' '}
            <u>não devendo ser disponibilizados para o estoque livre como produto bom em perfeito estado</u>.
          </div>

          {/* Deposit Reference Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100 px-3 py-2 font-bold text-slate-700 border-b border-slate-200 flex flex-wrap justify-between items-center gap-1">
              <span>📋 Tabela Oficial de Depósitos de Avaria Definitiva</span>
              <span className="text-[10px] font-mono text-slate-500">
                Centros: {DEFINITIVE_DAMAGE_CENTROS.join(', ')}
              </span>
            </div>
            <div className="divide-y divide-slate-200 bg-white">
              {Object.values(DEFINITIVE_DAMAGE_DEPOSITS).map((dep) => {
                const isTriggered = uniqueOrigins.includes(dep.code);
                return (
                  <div
                    key={dep.code}
                    className={`p-2.5 flex items-start gap-3 ${
                      isTriggered ? 'bg-red-50/80' : ''
                    }`}
                  >
                    <span
                      className={`font-mono font-extrabold text-white px-2 py-0.5 rounded text-xs shrink-0 ${
                        isTriggered ? 'bg-red-600 ring-2 ring-red-300' : 'bg-slate-600'
                      }`}
                    >
                      {dep.code}
                    </span>
                    <div>
                      <div className="font-bold text-slate-800">
                        {dep.definition} — <span className="text-red-600">Definitivo</span>
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Aplicação: <strong>{dep.application}</strong> • Proibido retornar ao estoque livre como produto bom.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comparison Rule Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                <span>✅ QUANDO É PERMITIDO (OK)</span>
              </div>
              <p className="text-emerald-700 mt-1 text-[11px] leading-relaxed">
                Quando <strong>B136 / B149 / B137</strong> é o <strong>Depósito de DESTINO</strong> (ex:{' '}
                <span className="font-mono font-bold">B110 ➔ B136</span>). Significa que o produto sofreu avaria e está sendo segregado.
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <div className="font-bold text-red-800 flex items-center gap-1.5">
                <span>🚫 QUANDO É INCORRETO (FLAG)</span>
              </div>
              <p className="text-red-700 mt-1 text-[11px] leading-relaxed">
                Quando <strong>B136 / B149 / B137</strong> é o <strong>Depósito de ORIGEM</strong> (ex:{' '}
                <span className="font-mono font-bold">{firstRoute.depositoOrigem} ➔ {firstRoute.depositoDestino}</span>). A linha ficará <strong>vermelha e flegada</strong> na tabela.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-5 sm:px-6 py-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onCancelAndFix}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            ✏️ Voltar e Corrigir Depósito
          </button>
          <button
            type="button"
            onClick={onConfirmAnyway}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition cursor-pointer"
          >
            ⚠️ Cadastrar Mesmo Assim (Linha Ficará Vermelha)
          </button>
        </div>
      </div>
    </div>
  );
};
