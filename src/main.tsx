import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Registro automático do Service Worker para suporte a PWA e Push Manager
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      // Força verificação imediata de atualizações no Service Worker
      reg.update();
    }).catch((err) => {
      console.warn('Falha ao registrar Service Worker do MIGOU:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
