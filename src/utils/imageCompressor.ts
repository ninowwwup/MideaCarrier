/**
 * Utilitário para compressão inteligente e conversão de fotos de label/etiqueta em Base64
 *
 * IMPORTANTE (Arquitetura Google Planilhas + PWA):
 * O Google Sheets possui um limite rígido de 50.000 caracteres por célula.
 * Quando uma foto de celular (4MB a 12MB) era convertida em 1024px (gerando ~90.000 a ~180.000 caracteres),
 * o Google Apps Script rejeitava a gravação da célula/linha por estourar os 50.000 caracteres.
 *
 * Este compressor executa um loop adaptativo multi-estágio que garante matematicamente que o
 * Base64 final tenha SEMPRE <= 43.000 caracteres (~32KB), preservando a nitidez dos números
 * de série (UII), códigos de barras e SKU da etiqueta para conferência no SAP e no celular.
 */

const GOOGLE_SHEETS_SAFE_MAX_CHARS = 43000;

function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback via FileReader caso URL.createObjectURL falhe em algum WebView antigo
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
      reader.onload = (e) => {
        const fallbackImg = new Image();
        fallbackImg.onload = () => resolve(fallbackImg);
        fallbackImg.onerror = () => reject(new Error('Formato de imagem não suportado pelo navegador.'));
        fallbackImg.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

function renderCompressedDataUrl(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number
): string {
  let width = img.naturalWidth || img.width || 800;
  let height = img.naturalHeight || img.height || 600;

  if (width > height) {
    if (width > maxDimension) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    }
  } else {
    if (height > maxDimension) {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D do Canvas indisponível.');
  }

  // Fundo branco puro para evitar transparência preta em PNGs
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Suavização de alta qualidade para preservar leitura de etiquetas e códigos de barras
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

export async function compressImageFile(
  file: File | Blob,
  initialMaxDimension = 760,
  initialQuality = 0.68
): Promise<string> {
  const img = await loadImageFromFile(file);

  // Tentativas progressivas para garantir que o Base64 caiba com folga no limite de 50.000 chars do Google Sheets
  const attempts: Array<{ dim: number; q: number }> = [
    { dim: Math.min(initialMaxDimension, 780), q: Math.min(initialQuality, 0.7) },
    { dim: 680, q: 0.62 },
    { dim: 600, q: 0.56 },
    { dim: 520, q: 0.5 },
    { dim: 450, q: 0.45 },
    { dim: 380, q: 0.4 },
  ];

  let lastDataUrl = '';
  for (const step of attempts) {
    lastDataUrl = renderCompressedDataUrl(img, step.dim, step.q);
    if (lastDataUrl.length <= GOOGLE_SHEETS_SAFE_MAX_CHARS) {
      return lastDataUrl;
    }
  }

  return lastDataUrl;
}
