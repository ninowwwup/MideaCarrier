import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://oxowlylcgunqkvuvtqyv.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94b3dseWxjZ3VucWt2dXZ0cXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODI3NjgsImV4cCI6MjEwNzc1ODc2OH0.08UtAFS9JkSoqmo7qUKZWXE73kbdbWol8ce_JiDL_P4';

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

  // 2. Limpar Supabase
  try {
    const deleteUrl = `${SUPABASE_URL}/rest/v1/transfer_requests?id=neq.placeholder_none`;
    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=representation',
      },
    });
    console.log('✓ Supabase limpo com status:', res.status);
  } catch (err) {
    console.error('Erro ao limpar Supabase:', err);
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

  console.log('\nBanco de dados Supabase, Shared Cloud e arquivos locais 100% zerados!');
}

resetAll();
