import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Layers, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Trash2,
  Camera,
  UploadCloud,
  Image as ImageIcon,
  Compass,
  ArrowRight
} from 'lucide-react';
import { NewTransferInput } from '../types/transfer';
import { 
  extractSerialsFromInput, 
  checkDefinitiveDamageOrigin,
  SAP_CENTROS_CATALOG,
  SAP_DEPOSITOS_CATALOG,
  analyzeTransferRoute
} from '../utils/sapFormatter';
import { compressImageFile } from '../utils/imageCompressor';
import { DefinitiveDamageWarningModal } from './DefinitiveDamageWarningModal';
import { lookupSerialInIQ09, getMemoryIQ09Snapshot } from '../services/iq09Service';

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NewTransferInput) => void;
  defaultSolicitante?: string;
  initialPreset?: {
    material?: string;
    seriais?: string[];
    centro: string;
    depositoOrigem: string;
    depositoDestino: string;
  } | null;
  onOpenDepositsGuide?: () => void;
}

const ALL_CENTROS = ['B124', 'B123', 'B158', 'B159', 'B179', 'B180'];

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  defaultSolicitante = 'Time Buiatte (Prod)',
  initialPreset = null,
  onOpenDepositsGuide,
}) => {
  const [material, setMaterial] = useState('');
  const [rawSerials, setRawSerials] = useState('');
  const [centro, setCentro] = useState('B124');
  const [depositoOrigem, setDepositoOrigem] = useState('B148');
  const [depositoDestino, setDepositoDestino] = useState('B110');
  const [observacoes, setObservacoes] = useState('');
  const [solicitante, setSolicitante] = useState(defaultSolicitante);
  const [labelPhotoUrl, setLabelPhotoUrl] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isDamageWarningOpen, setIsDamageWarningOpen] = useState(false);

  // Aplica preset vindo do Simulador Interativo de Depósitos ou da Consulta IQ09
  useEffect(() => {
    if (initialPreset && isOpen) {
      setCentro(initialPreset.centro);
      setDepositoOrigem(initialPreset.depositoOrigem);
      setDepositoDestino(initialPreset.depositoDestino);
      if (initialPreset.material) {
        setMaterial(initialPreset.material);
      }
      if (initialPreset.seriais && initialPreset.seriais.length > 0) {
        setRawSerials(initialPreset.seriais.join('\n'));
      }
    }
  }, [initialPreset, isOpen]);

  // Verificação em tempo real dos Depósitos de Avaria Definitiva (B136, B149, B137)
  const damageCheck = useMemo(() => {
    return checkDefinitiveDamageOrigin(depositoOrigem, depositoDestino);
  }, [depositoOrigem, depositoDestino]);

  // Análise inteligente completa da rota (Centro + Origem + Destino + Produto vs Peças)
  const routeAnalysis = useMemo(() => {
    return analyzeTransferRoute(centro, depositoOrigem, depositoDestino);
  }, [centro, depositoOrigem, depositoDestino]);

  // Depósitos recomendados para o Centro selecionado
  const validDepositsForCentro = useMemo(() => {
    const cleanCentro = centro.trim().toUpperCase();
    const list = Object.values(SAP_DEPOSITOS_CATALOG).filter((d) =>
      d.allowedCentros.includes(cleanCentro)
    );
    return list.length > 0
      ? list.map((d) => d.code)
      : ['B148', 'B110', 'B114', 'B130', 'B413', 'B412', 'B111', 'B152'];
  }, [centro]);

  // Parsing em tempo real de múltiplos seriais
  const parsedSerials = useMemo(() => {
    return extractSerialsFromInput(rawSerials);
  }, [rawSerials]);

  // Checagem de seriais duplicados no mesmo lote
  const duplicateSerials = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    parsedSerials.forEach((s) => {
      const upper = s.toUpperCase();
      if (seen.has(upper)) dupes.add(upper);
      seen.add(upper);
    });
    return Array.from(dupes);
  }, [parsedSerials]);

  // Cruzamento em tempo real dos seriais colados com a Base IQ09 ativa
  const iq09Check = useMemo(() => {
    const hasIQ09 = Boolean(getMemoryIQ09Snapshot());
    if (!hasIQ09 || parsedSerials.length === 0) return null;

    const matchedItems = parsedSerials
      .map((sn) => ({ sn, info: lookupSerialInIQ09(sn) }))
      .filter((x): x is { sn: string; info: NonNullable<ReturnType<typeof lookupSerialInIQ09>> } =>
        Boolean(x.info)
      );

    if (matchedItems.length === 0) {
      return {
        hasIQ09: true,
        matchedCount: 0,
        alreadyInDestination: [] as string[],
        dominantMaterial: '',
        dominantCentro: '',
        dominantOrigem: '',
        hasFieldMismatch: false,
      };
    }

    const destUpper = depositoDestino.trim().toUpperCase();
    const alreadyInDestination = matchedItems
      .filter((m) => m.info.deposito === destUpper)
      .map((m) => m.sn);

    const first = matchedItems[0].info;
    const matUpper = material.trim().toUpperCase();
    const cenUpper = centro.trim().toUpperCase();
    const origUpper = depositoOrigem.trim().toUpperCase();

    const hasFieldMismatch =
      (matUpper !== '' && matUpper !== first.material) ||
      cenUpper !== first.centro ||
      (origUpper !== first.deposito && first.deposito !== destUpper);

    return {
      hasIQ09: true,
      matchedCount: matchedItems.length,
      alreadyInDestination,
      dominantMaterial: first.material,
      dominantCentro: first.centro,
      dominantOrigem: first.deposito,
      hasFieldMismatch,
    };
  }, [parsedSerials, material, centro, depositoOrigem, depositoDestino]);

  // Auto-preenche Material, Centro e Dep. Origem quando o usuário cola um UII e o Material ainda está em branco
  useEffect(() => {
    if (
      iq09Check &&
      iq09Check.matchedCount > 0 &&
      !material.trim() &&
      iq09Check.dominantMaterial
    ) {
      setMaterial(iq09Check.dominantMaterial);
      if (iq09Check.dominantCentro) {
        setCentro(iq09Check.dominantCentro);
        const cInfo = SAP_CENTROS_CATALOG[iq09Check.dominantCentro];
        if (cInfo && iq09Check.dominantOrigem !== cInfo.freeStockProductDeposit) {
          setDepositoDestino(cInfo.freeStockProductDeposit);
        }
      }
      if (iq09Check.dominantOrigem && iq09Check.dominantOrigem !== depositoDestino) {
        setDepositoOrigem(iq09Check.dominantOrigem);
      }
    }
  }, [iq09Check, material]);

  if (!isOpen) return null;

  const handleRemoveSingleSerial = (indexToRemove: number) => {
    const updated = parsedSerials.filter((_, idx) => idx !== indexToRemove);
    setRawSerials(updated.join('\n'));
  };

  const handlePhotoUpload = async (file: File) => {
    if (!file) return;
    try {
      setIsProcessingPhoto(true);
      const compressed = await compressImageFile(file, 1024, 0.78);
      setLabelPhotoUrl(compressed);
    } catch (err) {
      console.error('Erro ao processar imagem:', err);
      alert('Não foi possível processar a imagem da label. Tente outra foto.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const executeSubmit = () => {
    const finalSerials = parsedSerials.length > 0 ? parsedSerials : ['S/N'];

    onSubmit({
      material: material.trim().toUpperCase(),
      seriais: finalSerials,
      centro: centro.trim().toUpperCase(),
      depositoOrigem: depositoOrigem.trim().toUpperCase(),
      depositoDestino: depositoDestino.trim().toUpperCase(),
      observacoes: observacoes.trim(),
      solicitante: solicitante.trim(),
      labelPhotoUrl: labelPhotoUrl || undefined,
    });

    // Reset form
    setMaterial('');
    setRawSerials('');
    setObservacoes('');
    setLabelPhotoUrl(null);
    setIsDamageWarningOpen(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material.trim()) {
      alert('Por favor informe o código do Material.');
      return;
    }
    if (!centro.trim() || !depositoOrigem.trim() || !depositoDestino.trim()) {
      alert('Preencha Centro, Depósito de Origem e Depósito de Destino.');
      return;
    }
    const origUpper = depositoOrigem.trim().toUpperCase();
    const destUpper = depositoDestino.trim().toUpperCase();
    if (origUpper === destUpper) {
      alert('O Depósito de Origem e o Depósito de Destino não podem ser iguais.');
      return;
    }
    if (origUpper === 'B112' || destUpper === 'B112' || origUpper === 'B153' || destUpper === 'B153') {
      alert('Os depósitos B112 e B153 não devem ser utilizados para solicitações. Utilize B111 (Produto) ou B152 (Peças).');
      return;
    }

    // Se o depósito de ORIGEM for de Avaria Definitiva (B136, B149 ou B137), abre a tela de aviso educativo
    if (damageCheck.isInvalidOrigin && damageCheck.originInfo) {
      setIsDamageWarningOpen(true);
      return;
    }

    executeSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-[#002363] via-[#002664] to-[#249ED5] text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-white/10 text-[#C2DEEB]">
                <Layers className="w-5 h-5" />
              </span>
              <h3 className="text-sm sm:text-base font-bold">Nova Solicitação de Transferência SAP</h3>
            </div>
            <p className="text-[11px] sm:text-xs text-[#C2DEEB] mt-0.5">
              Suporta múltiplos seriais de um mesmo material em lote (WMS Sênior ➔ SAP Midea)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body & Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 sm:space-y-4 overscroll-contain">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Material */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Material / Código SAP *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: MDWTF08B1, TSM62, QCL108BB"
                value={material}
                onChange={(e) => setMaterial(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA] focus:border-transparent uppercase placeholder:normal-case"
              />
            </div>

            {/* Solicitante */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Time / Solicitante
              </label>
              <input
                type="text"
                value={solicitante}
                onChange={(e) => setSolicitante(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA] focus:border-transparent"
              />
            </div>
          </div>

          {/* Centros e Depósitos com Inteligência de Canal e Tipo (Produto vs Peças) */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#002664]">
                <span>🧭 Inteligência de Centros & Depósitos SAP</span>
                {routeAnalysis.centroInfo && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#00609C] text-[10px] font-mono">
                    {routeAnalysis.centroInfo.code}: {routeAnalysis.centroInfo.channelName}
                  </span>
                )}
              </div>
              {onOpenDepositsGuide && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDepositsGuide();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00609C] hover:text-[#002664] bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-[#249ED5]" />
                  <span>Consultar Guia de Depósitos</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Centro */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Centro SAP *
                </label>
                <input
                  type="text"
                  required
                  value={centro}
                  onChange={(e) => setCentro(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA]"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ALL_CENTROS.map((c) => {
                    const cInfo = SAP_CENTROS_CATALOG[c];
                    const validFree = cInfo
                      ? [cInfo.freeStockProductDeposit, cInfo.freeStockPartsDeposit, cInfo.blueServicePartsDeposit].filter(Boolean)
                      : [];
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCentro(c);
                          if (cInfo && !validFree.includes(depositoDestino) && ['B110', 'B114', 'B130', 'B412', 'B413'].includes(depositoDestino)) {
                            setDepositoDestino(cInfo.freeStockProductDeposit);
                          }
                        }}
                        title={cInfo?.channelName || c}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-colors cursor-pointer ${
                          centro === c
                            ? 'bg-[#002664] text-white border-[#002664] font-bold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Depósito Origem */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Dep. Origem *
                  </label>
                  {routeAnalysis.originDeposit && (
                    <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[130px]" title={routeAnalysis.originDeposit.classification}>
                      {routeAnalysis.originDeposit.shortTitle} ({routeAnalysis.originDeposit.application})
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={depositoOrigem}
                  onChange={(e) => setDepositoOrigem(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA]"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {validDepositsForCentro.map((d) => {
                    const dInfo = SAP_DEPOSITOS_CATALOG[d];
                    const isAvaria = dInfo?.category === 'avaria_definitivo';
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDepositoOrigem(d)}
                        title={dInfo ? `${d}: ${dInfo.classification} (${dInfo.application})` : d}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-colors cursor-pointer ${
                          depositoOrigem === d
                            ? isAvaria
                              ? 'bg-red-600 text-white border-red-700 font-bold'
                              : 'bg-amber-100 text-amber-900 border-amber-400 font-bold'
                            : isAvaria
                            ? 'bg-red-50/70 text-red-700 border-red-200 hover:bg-red-100'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Depósito Destino */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Dep. Destino *
                  </label>
                  {routeAnalysis.destinationDeposit && (
                    <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[130px]" title={routeAnalysis.destinationDeposit.classification}>
                      {routeAnalysis.destinationDeposit.shortTitle} ({routeAnalysis.destinationDeposit.application})
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={depositoDestino}
                  onChange={(e) => setDepositoDestino(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA]"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {validDepositsForCentro.map((d) => {
                    const dInfo = SAP_DEPOSITOS_CATALOG[d];
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDepositoDestino(d)}
                        title={dInfo ? `${d}: ${dInfo.classification} (${dInfo.application})` : d}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-colors cursor-pointer ${
                          depositoDestino === d
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Resumo Inteligente da Rota Selecionada */}
            {(routeAnalysis.originDeposit || routeAnalysis.destinationDeposit) && !damageCheck.isInvalidOrigin && (
              <div className="p-2.5 rounded-lg bg-white border border-slate-200/90 text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-slate-800">Rota Configurada:</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 font-mono font-bold border border-amber-200">
                    {depositoOrigem} {routeAnalysis.originDeposit ? `(${routeAnalysis.originDeposit.shortTitle})` : ''}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-900 font-mono font-bold border border-emerald-200">
                    {depositoDestino} {routeAnalysis.destinationDeposit ? `(${routeAnalysis.destinationDeposit.shortTitle})` : ''}
                  </span>
                </div>
                {routeAnalysis.centroInfo && (
                  <span className="text-[10px] text-slate-500">
                    Livre Produto: <strong className="font-mono text-emerald-700">{routeAnalysis.centroInfo.freeStockProductDeposit}</strong>
                    {routeAnalysis.centroInfo.freeStockPartsDeposit && (
                      <> • Livre Peças: <strong className="font-mono text-emerald-700">{routeAnalysis.centroInfo.freeStockPartsDeposit}</strong></>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Alerta se houver incompatibilidade de Centro x Depósito ou Produto x Peças */}
          {(routeAnalysis.hasCenterMismatch || routeAnalysis.hasApplicationMismatch) && !damageCheck.isInvalidOrigin && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="font-bold text-amber-900">
                  Atenção à Regra de Centro / Depósito SAP:
                </div>
                <p className="text-amber-800 leading-relaxed">{routeAnalysis.warnings.join(' ')}</p>
                {routeAnalysis.centroInfo && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDepositoDestino(routeAnalysis.centroInfo!.freeStockProductDeposit)}
                      className="px-2.5 py-1 rounded-md bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      Corrigir Destino para {routeAnalysis.centroInfo.freeStockProductDeposit} (Livre Produto do Centro {centro})
                    </button>
                    {routeAnalysis.centroInfo.freeStockPartsDeposit && (
                      <button
                        type="button"
                        onClick={() => setDepositoDestino(routeAnalysis.centroInfo!.freeStockPartsDeposit!)}
                        className="px-2.5 py-1 rounded-md bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        Usar {routeAnalysis.centroInfo.freeStockPartsDeposit} (Livre Peças do Centro {centro})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Alerta em Tempo Real caso o Depósito de Origem seja B136, B149 ou B137 */}
          {damageCheck.isInvalidOrigin && damageCheck.originInfo && (
            <div className="p-3.5 bg-red-50 border-2 border-red-400 rounded-xl text-xs text-red-900 flex items-start gap-3 animate-in fade-in">
              <span className="text-xl leading-none">🚨</span>
              <div className="space-y-1">
                <div className="font-extrabold text-red-800">
                  Atenção: Solicitação Incorreta — Origem {damageCheck.originInfo.code} ({damageCheck.originInfo.shortTitle})
                </div>
                <p className="text-red-800 leading-relaxed">
                  <strong>{damageCheck.originInfo.definition}</strong> Produtos alocados neste depósito já tiveram avaria definitiva e recebem tratativa específica — <u>não devendo retornar ao estoque livre como produto bom</u>. Se enviada, a linha ficará <strong>vermelha</strong> na tabela principal.
                </p>
              </div>
            </div>
          )}

          {damageCheck.isValidDestination && damageCheck.destinationInfo && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Destino {damageCheck.destinationInfo.code} ({damageCheck.destinationInfo.shortTitle}):</strong> Solicitação válida para segregar material com avaria ({damageCheck.destinationInfo.definition}).
              </span>
            </div>
          )}

          {/* Campo de Múltiplos Seriais */}
          <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/30">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Seriais (Cole múltiplos de uma vez)</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#0083CA] text-white">
                  {parsedSerials.length} {parsedSerials.length === 1 ? 'serial' : 'seriais'}
                </span>
              </label>
              <span className="text-[11px] text-slate-500">
                Separe por quebra de linha, vírgula ou espaço
              </span>
            </div>

            <textarea
              rows={4}
              placeholder="Cole aqui a coluna de seriais do Excel ou leitor de código de barras:&#10;541760002ZGB4133400502&#10;541760002ZGB4133400533&#10;S1326B21294802"
              value={rawSerials}
              onChange={(e) => setRawSerials(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA] focus:border-transparent bg-white leading-relaxed"
            />

            {/* Aviso de duplicados */}
            {duplicateSerials.length > 0 && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Atenção: Há {duplicateSerials.length} serial(is) repetido(s) no campo: {duplicateSerials.join(', ')}.
                </span>
              </div>
            )}

            {/* Cruzamento em Tempo Real com a Base IQ09 */}
            {iq09Check && iq09Check.matchedCount > 0 && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-white border border-blue-200 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-[#002664]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Base IQ09: {iq09Check.matchedCount} de {parsedSerials.length} UII(s) localizados no SAP
                    </span>
                  </div>
                  {iq09Check.hasFieldMismatch && iq09Check.dominantMaterial && (
                    <button
                      type="button"
                      onClick={() => {
                        setMaterial(iq09Check.dominantMaterial);
                        if (iq09Check.dominantCentro) setCentro(iq09Check.dominantCentro);
                        if (
                          iq09Check.dominantOrigem &&
                          iq09Check.dominantOrigem !== depositoDestino
                        ) {
                          setDepositoOrigem(iq09Check.dominantOrigem);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#002664] hover:bg-[#003380] text-white font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      Preencher da IQ09 ({iq09Check.dominantMaterial} • {iq09Check.dominantCentro} • Origem {iq09Check.dominantOrigem})
                    </button>
                  )}
                </div>

                {iq09Check.alreadyInDestination.length > 0 && (
                  <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-950 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold">
                      🔵 Atenção: <strong>{iq09Check.alreadyInDestination.length}</strong> UII(s) colado(s){' '}
                      <strong>já estão alocados no depósito de destino {depositoDestino}</strong> na IQ09!
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const alreadySet = new Set(
                          iq09Check.alreadyInDestination.map((s) => s.toUpperCase())
                        );
                        const remaining = parsedSerials.filter(
                          (s) => !alreadySet.has(s.toUpperCase())
                        );
                        setRawSerials(remaining.join('\n'));
                      }}
                      className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition-colors cursor-pointer shrink-0"
                    >
                      Remover {iq09Check.alreadyInDestination.length} UII(s) que já estão em {depositoDestino}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tags de Seriais Detectados */}
            {parsedSerials.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                  <span>Pré-visualização dos Seriais ({parsedSerials.length}):</span>
                  <button
                    type="button"
                    onClick={() => setRawSerials('')}
                    className="text-[10px] text-rose-600 hover:underline flex items-center gap-0.5"
                  >
                    <Trash2 className="w-3 h-3" /> Limpar seriais
                  </button>
                </div>
                <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5 p-2 bg-white rounded-lg border border-slate-200">
                  {parsedSerials.map((s, idx) => (
                    <span
                      key={`${s}-${idx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-700"
                    >
                      <span>{s}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSingleSerial(idx)}
                        className="text-slate-400 hover:text-rose-600"
                        title="Remover este serial"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observações / Justificativa (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Troca para atendimento do pedido de expedição SLA ou avaria"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA] focus:border-transparent"
            />
          </div>

          {/* Anexo de Foto da Etiqueta / Label (Comprovação contra divergências) */}
          <div className="p-3.5 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 border border-blue-200/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#002664] flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#249ED5]" />
                <span>Foto da Etiqueta / Label do Produto (Comprovação)</span>
              </label>
              <span className="text-[10px] text-slate-500 font-medium">
                Útil para validação física caso haja divergência
              </span>
            </div>

            {labelPhotoUrl ? (
              <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-emerald-300 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <img
                    src={labelPhotoUrl}
                    alt="Preview da label"
                    className="w-12 h-12 object-cover rounded-md border border-slate-200 shadow-xs"
                  />
                  <div>
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Foto da label anexada com sucesso</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Disponível para conferência visual do Time Midea no SAP
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="cursor-pointer text-xs font-semibold text-[#002664] hover:underline px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">
                    Trocar
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload(file);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLabelPhotoUrl(null)}
                    className="text-xs text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50"
                    title="Remover foto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handlePhotoUpload(file);
                }}
                className="border-2 border-dashed border-blue-300 hover:border-[#249ED5] bg-white/80 p-3 rounded-lg text-center transition-colors"
              >
                {isProcessingPhoto ? (
                  <div className="py-2 text-xs font-semibold text-[#002664] flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#002664] border-t-transparent rounded-full animate-spin" />
                    <span>Otimizando foto da etiqueta...</span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">Arraste a foto da etiqueta</span> ou use as opções:
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#002664] hover:bg-[#002363] text-white shadow-2xs transition-colors">
                        <Camera className="w-3.5 h-3.5 text-[#C2DEEB]" />
                        <span>Tirar Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file);
                          }}
                        />
                      </label>
                      <label className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors">
                        <UploadCloud className="w-3.5 h-3.5 text-[#249ED5]" />
                        <span>Galeria / Arquivo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          </div>

          {/* Modal Footer - Sempre visível e fixo no rodapé */}
          <div className="shrink-0 px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="text-xs text-slate-500 w-full sm:w-auto text-center sm:text-left">
              {parsedSerials.length > 1 ? (
                <span className="font-semibold text-[#00609C]">
                  Serão geradas {parsedSerials.length} linhas agrupadas no mesmo lote.
                </span>
              ) : (
                <span>Será gerada 1 linha na fila FIFO.</span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-5 py-2 text-xs font-bold text-white bg-[#002664] hover:bg-[#002363] rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Plus className="w-4 h-4 text-[#C2DEEB]" />
                <span>
                  {parsedSerials.length > 1
                    ? `Criar ${parsedSerials.length} Solicitações`
                    : 'Enviar Solicitação'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Modal Educativo de Solicitação Incorreta (Depósitos B136, B149, B137 como Origem) */}
      {damageCheck.isInvalidOrigin && damageCheck.originInfo && (
        <DefinitiveDamageWarningModal
          isOpen={isDamageWarningOpen}
          invalidRoutes={[
            {
              material: material.trim().toUpperCase(),
              centro: centro.trim().toUpperCase(),
              depositoOrigem: depositoOrigem.trim().toUpperCase(),
              depositoDestino: depositoDestino.trim().toUpperCase(),
              originInfo: damageCheck.originInfo,
            },
          ]}
          onCancelAndFix={() => setIsDamageWarningOpen(false)}
          onConfirmAnyway={executeSubmit}
        />
      )}
    </div>
  );
};
