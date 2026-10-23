import fs from 'fs';
import path from 'path';

const SAMPLE_RATE = 44100;

function createWavBuffer(samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(1, 22);  // Mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24); // Sample rate
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // Byte rate
  buffer.writeUInt16LE(2, 32);  // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    let val = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(Math.round(val), 44 + i * 2);
  }

  return buffer;
}

// 1. FROG (Sapo / Coaxar)
function generateFrogWav() {
  const duration = 0.55;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);

  const pulses = [
    { start: 0.02, dur: 0.16, baseF: 190, endF: 140, tremF: 40, vol: 0.8 },
    { start: 0.22, dur: 0.26, baseF: 230, endF: 160, tremF: 35, vol: 0.95 },
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;

    for (const p of pulses) {
      if (t >= p.start && t < p.start + p.dur) {
        const localT = t - p.start;
        const progress = localT / p.dur;
        const freq = p.baseF * (1 - progress) + p.endF * progress;
        
        // Tremolo / pulse train para textura áspera de anfíbio
        const tremolo = 0.5 + 0.5 * Math.sin(2 * Math.PI * p.tremF * localT);
        
        // Forma de onda rica em harmônicos (sawtooth aproximado suave)
        let wave = Math.sin(2 * Math.PI * freq * localT) * 0.6 +
                   Math.sin(2 * Math.PI * freq * 2 * localT) * 0.35 +
                   Math.sin(2 * Math.PI * freq * 3 * localT) * 0.25 +
                   Math.sin(2 * Math.PI * freq * 4 * localT) * 0.15;
        
        // Ressonância de garganta / formante nasal (~850Hz)
        const formant = Math.sin(2 * Math.PI * 850 * localT) * 0.2;
        wave = (wave + formant) * 0.8;

        // Envelope
        let env = 0;
        if (localT < 0.03) {
          env = localT / 0.03;
        } else {
          env = Math.exp(-(localT - 0.03) / (p.dur * 0.45));
        }

        s += wave * env * tremolo * p.vol;
      }
    }

    samples[i] = s;
  }

  return createWavBuffer(samples);
}

// 2. SOAP BUBBLES (Bolhas de Sabão)
function generateBubblesWav() {
  const duration = 0.45;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);

  const bubblePops = [
    { start: 0.00, dur: 0.065, startF: 480, endF: 1100, vol: 0.65 },
    { start: 0.065, dur: 0.060, startF: 700, endF: 1550, vol: 0.75 },
    { start: 0.130, dur: 0.055, startF: 980, endF: 2100, vol: 0.85 },
    { start: 0.190, dur: 0.075, startF: 1350, endF: 2800, vol: 0.70 },
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;

    for (const b of bubblePops) {
      if (t >= b.start && t < b.start + b.dur) {
        const localT = t - b.start;
        const progress = localT / b.dur;
        
        // Frequência sobe rapidamente imitando a tensão da bolha estourando
        const freq = b.startF * Math.pow(b.endF / b.startF, progress);
        
        // Onda sinusoidal pura com ligeiro brilho
        const wave = Math.sin(2 * Math.PI * freq * localT) + 
                     0.15 * Math.sin(2 * Math.PI * freq * 2 * localT);

        // Envelope de estalo instantâneo
        let env = 0;
        if (localT < 0.006) {
          env = localT / 0.006;
        } else {
          env = Math.exp(-(localT - 0.006) / 0.022);
        }

        s += wave * env * b.vol;
      }
    }

    samples[i] = s;
  }

  return createWavBuffer(samples);
}

// 3. CAT MEOW (Gato / Miau)
function generateCatWav() {
  const duration = 0.60;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    
    // Curva melódica: 400Hz -> 730Hz -> 370Hz
    let baseF;
    if (t < 0.22) {
      const p = t / 0.22;
      baseF = 400 + 330 * Math.sin(p * Math.PI / 2);
    } else {
      const p = (t - 0.22) / (duration - 0.22);
      baseF = 730 - 360 * Math.pow(p, 0.85);
    }

    // Vibrato felino natural (5.5Hz)
    const vibrato = Math.sin(2 * Math.PI * 5.5 * t) * 14;
    const freq = Math.max(200, baseF + vibrato);

    // Formante vocal
    let wave = Math.sin(2 * Math.PI * freq * t) * 0.65 +
               Math.sin(2 * Math.PI * freq * 2 * t) * 0.35 +
               Math.sin(2 * Math.PI * freq * 3 * t) * 0.18;

    // Filtro formântico tipo miado ("m-ya-oo-w")
    const formantF = 800 + 700 * Math.sin(Math.min(1, t / 0.3) * Math.PI);
    wave *= (0.7 + 0.3 * Math.sin(2 * Math.PI * formantF * t));

    // Envelope
    let env = 0;
    if (t < 0.08) {
      env = t / 0.08;
    } else if (t < 0.35) {
      env = 1.0;
    } else {
      env = Math.exp(-(t - 0.35) / 0.15);
    }

    samples[i] = wave * env * 0.85;
  }

  return createWavBuffer(samples);
}

// 4. REBOUND (Mola / Boing)
function generateReboundWav() {
  const duration = 0.52;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;

    // Rampa inicial rápida de frequência (salto de mola)
    let centerF;
    if (t < 0.08) {
      centerF = 180 + 320 * (t / 0.08);
    } else {
      centerF = 500 - 160 * ((t - 0.08) / (duration - 0.08));
    }

    // Vibração de mola elástica (wobble oscilante a 22Hz com decaimento exponencial)
    const springWobble = Math.sin(2 * Math.PI * 22 * t) * (80 * Math.exp(-t / 0.22));
    const freq = Math.max(80, centerF + springWobble);

    // Onda com leve riqueza metálica
    const wave = Math.sin(2 * Math.PI * freq * t) * 0.8 +
                 Math.sin(2 * Math.PI * freq * 2 * t) * 0.25;

    // Envelope punchy
    let env = 0;
    if (t < 0.012) {
      env = t / 0.012;
    } else {
      env = Math.exp(-(t - 0.012) / 0.24);
    }

    samples[i] = wave * env * 0.9;
  }

  return createWavBuffer(samples);
}

const outDir = path.join(process.cwd(), 'public', 'audio');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'frog.wav'), generateFrogWav());
console.log('✓ public/audio/frog.wav gerado com sucesso!');

fs.writeFileSync(path.join(outDir, 'bubbles.wav'), generateBubblesWav());
console.log('✓ public/audio/bubbles.wav gerado com sucesso!');

fs.writeFileSync(path.join(outDir, 'cat.wav'), generateCatWav());
console.log('✓ public/audio/cat.wav gerado com sucesso!');

fs.writeFileSync(path.join(outDir, 'rebound.wav'), generateReboundWav());
console.log('✓ public/audio/rebound.wav gerado com sucesso!');
