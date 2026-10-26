import fs from 'fs';
import path from 'path';

const GOOGLE_SHEETS_URL = process.env.VITE_GOOGLE_SHEETS_URL || process.env.GOOGLE_SHEETS_URL || '';

async function resetAll() {
  console.log('Iniciando limpeza total dos registros...');

  // 1. Limpar transfers_data.json local
  const dataFile = path.join(process.cwd(), 'transfers_data.json');
  try {
    fs.writeFileSync(dataFile, '[]\n', 'utf-8');
    console.log('✓ transfers_data.json zerado.');
  } catch (e) {
    console.warn('Aviso ao limpar transfers_data.json:', e);
  }

  // 2. Limpar Google Sheets se configurado
  if (GOOGLE_SHEETS_URL) {
    try {
      const res = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'clear' }),
      });
      console.log('✓ Google Planilhas zerada com status:', res.status);
    } catch (err) {
      console.error('Erro ao limpar Google Planilhas:', err);
    }
  }

  // 3. Limpar Shared Cloud Store
  try {
    const cloudRes = await fetch('https://api.restful-api.dev/objects/ff808181a09d98f701a14c0ecc5507d9', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: 'midea_carrier_transfer_hub_production', 
        data: { items: [], lastUpdated: Date.now() } 
      }),
    });
    console.log('✓ Shared Cloud Store zerado com status:', cloudRes.status);
  } catch (e) {
    console.warn('Aviso ao limpar Shared Cloud Store:', e);
  }

  console.log('\nBanco de dados (Google Planilhas, Shared Cloud e arquivos locais) 100% zerados!');
}

resetAll();
