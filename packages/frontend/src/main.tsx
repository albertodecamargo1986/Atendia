import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Apply theme before first render to avoid flash
const storedTheme = localStorage.getItem('atendia_theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = storedTheme || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', theme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);