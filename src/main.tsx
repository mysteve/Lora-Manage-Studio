import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { MotionConfig } from 'motion/react';
import './styles/global.css';

// 在整个应用（包括 portal 弹窗）中屏蔽 WebView 的默认右键菜单。
const preventBrowserContextMenu = (event: MouseEvent) => event.preventDefault();
document.addEventListener('contextmenu', preventBrowserContextMenu, true);

import.meta.hot?.dispose(() => {
  document.removeEventListener('contextmenu', preventBrowserContextMenu, true);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
