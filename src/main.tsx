import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './motion.css';
import './calendar-readability.css';
import './insights-habit-focus.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);