import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import { installModalAlert } from '@/ui/alertModal';
import '@/styles/globals.css';

installModalAlert();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
