import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Registro automático do Service Worker para suporte a PWA e atualização instantânea
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        reg.update();
      })
      .catch((err) => {
        console.warn('Falha ao registrar Service Worker do MIGOU:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
