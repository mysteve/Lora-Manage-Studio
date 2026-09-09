import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { MotionConfig } from 'motion/react';
import './styles/global.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
