import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Sin StrictMode: la sesión de juego programa su propio bucle de animación y se descarta al desmontar.
createRoot(document.getElementById('root')!).render(<App />);
