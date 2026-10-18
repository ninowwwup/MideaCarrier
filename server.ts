import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import handler, { registerSSEClient } from './api/transfers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rota SSE em tempo real (/api/events)
app.get('/api/events', (req, res) => {
  try {
    registerSSEClient(req as any, res as any);
  } catch (err) {
    console.error('Erro na rota /api/events:', err);
  }
});

// Rota de API /api/transfers compatível com Vercel
app.all('/api/transfers', async (req, res) => {
  try {
    await handler(req as any, res as any);
  } catch (err) {
    console.error('Erro na rota /api/transfers:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

// Arquivos estáticos em produção
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Servidor Midea Transfer Hub rodando na porta ${PORT}`);
  });
}

export default app;
