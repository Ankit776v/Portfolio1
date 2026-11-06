import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';
import './index.css';

export function mountProject(container) {
  const root = createRoot(container);
  root.render(<AuthProvider><App /></AuthProvider>);
  return { destroy() { root.unmount(); } };
}
