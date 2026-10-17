import React, { useState } from 'react';
import { 
  Lightbulb, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Workflow, 
  CheckCircle, 
  Clock, 
  FileSpreadsheet, 
  ShieldCheck,
  Zap,
  ArrowRight
} from 'lucide-react';

export const ArchitectureInsights: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-gradient-to-br from-blue-50/60 to-indigo-50/60 rounded-2xl border border-blue-200/80 p-4 mb-6 shadow-2xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#0083CA] text-white shadow-xs">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#00609C] flex items-center gap-1.5">
              <span>Diagnóstico Operacional & Melhorias para a Operação Midea Carrier / Buiatte</span>
              <span className="text-[10px] bg-blue-100 text-[#00609C] px-2 py-0.5 rounded-full font-bold">
                Visão Especialista
              </span>
            </h4>
            <p className="text-xs text-slate-600">
              Análise de gargalos do fluxo WhatsApp ➔ SAP e soluções desenhadas para proteger SLA, FIFO e LIFO
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#00609C] hover:bg-blue-100/60 rounded-lg transition-colors"
        >
          <span>{isOpen ? 'Ocultar Detalhes' : 'Ver Diagnóstico & Melhorias'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-blue-200/60 space-y-4 text-xs text-slate-700 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. O Problema Identificado */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs">
              <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5 text-rose-700">
                <Clock className="w-4 h-4" />
                <span>O Gargalo do WhatsApp</span>
              </div>
              <ul className="space-y-1 text-slate-600 list-disc pl-4">
                <li>Mensagens perdem a ordem cronológica, violando o <strong>FIFO</strong>.</li>
                <li>Falta de rastreabilidade de quem está atendendo qual solicitação no SAP.</li>
                <li>Digitação manual de seriais um por um, gerando atrasos no SLA.</li>
              </ul>
            </div>

            {/* 2. Solução Implementada no App */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs">
              <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5 text-emerald-700">
                <CheckCircle className="w-4 h-4" />
                <span>Solução Aplicada neste App</span>
              </div>
              <ul className="space-y-1 text-slate-600 list-disc pl-4">
                <li>
                  <strong>Múltiplos Seriais num só clique:</strong> O Time Buiatte cola dezenas de seriais no mesmo campo e o sistema expande com integridade.
                </li>
                <li>
                  <strong>Assistente SAP:</strong> 1 clique para copiar na formatação exata da MIGO 311.
                </li>
                <li>
                  <strong>Espelho Operacional:</strong> Notificação clara de divergências sem ruído de chat.
                </li>
              </ul>
            </div>

            {/* 3. Recomendações para Próxima Etapa */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs">
              <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5 text-[#00609C]">
                <Zap className="w-4 h-4" />
                <span>Próximas Sugestões Futuras</span>
              </div>
              <ul className="space-y-1 text-slate-600 list-disc pl-4">
                <li>
                  <strong>Leitura por Coletor:</strong> Leitor de código de barras ou bip via câmera no WMS.
                </li>
                <li>
                  <strong>Integração SAP BAPI:</strong> Execução automática no SAP via BAPI_GOODSMVT_CREATE.
                </li>
                <li>
                  <strong>Alerta de Saldo Negativo:</strong> Pré-checagem de saldo antes do envio.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
