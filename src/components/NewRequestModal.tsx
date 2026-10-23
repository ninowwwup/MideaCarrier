import React, { useState, useMemo } from 'react';
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
  Image as ImageIcon
} from 'lucide-react';
import { NewTransferInput } from '../types/transfer';
import { extractSerialsFromInput } from '../utils/sapFormatter';
import { compressImageFile } from '../utils/imageCompressor';

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NewTransferInput) => void;
  defaultSolicitante?: string;
}

const FREQUENT_CENTROS = ['B124', 'B123', 'B179', 'B158'];
const FREQUENT_DEPOSITOS = ['B148', 'B110', 'B111', 'B114', 'B413'];

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  defaultSolicitante = 'Time Buiatte (Prod)',
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
    if (depositoOrigem.trim().toUpperCase() === depositoDestino.trim().toUpperCase()) {
      alert('O Depósito de Origem e o Depósito de Destino não podem ser iguais.');
      return;
    }

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
    onClose();
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

          {/* Centros e Depósitos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
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
                {FREQUENT_CENTROS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCentro(c)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-colors ${
                      centro === c
                        ? 'bg-blue-100 text-[#00609C] border-blue-300 font-bold'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Depósito Origem */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dep. Origem *
              </label>
              <input
                type="text"
                required
                value={depositoOrigem}
                onChange={(e) => setDepositoOrigem(e.target.value.toUpperCase())}
                className="w-full px-2.5 py-1.5 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA]"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {FREQUENT_DEPOSITOS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepositoOrigem(d)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-colors ${
                      depositoOrigem === d
                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Depósito Destino */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dep. Destino *
              </label>
              <input
                type="text"
                required
                value={depositoDestino}
                onChange={(e) => setDepositoDestino(e.target.value.toUpperCase())}
                className="w-full px-2.5 py-1.5 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083CA]"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {FREQUENT_DEPOSITOS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepositoDestino(d)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-colors ${
                      depositoDestino === d
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
    </div>
  );
};
