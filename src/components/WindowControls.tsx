import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { desktop } from '../lib/api';

export function WindowControls({ onError }: { onError: (message: string, error: boolean) => void }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    const window = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const update = async () => {
      try {
        const value = await window.isMaximized();
        if (!disposed) setMaximized(value);
      } catch (error) {
        if (!disposed) onError(String(error), true);
      }
    };
    void update();
    void window
      .onResized(() => void update())
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error) => {
        if (!disposed) onError(String(error), true);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onError]);

  const run = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
    if (!desktop) return;
    try {
      // close() emits the same close request as Alt+F4, preserving the unsaved recipe guard.
      await getCurrentWindow()[action]();
    } catch (error) {
      onError(String(error), true);
    }
  };
  return (
    <div className="window-controls" role="group" aria-label="窗口控制">
      <button aria-label="最小化" title="最小化" disabled={!desktop} onClick={() => void run('minimize')}>
        <Minus size={15} />
      </button>
      <button
        aria-label={maximized ? '还原窗口' : '最大化'}
        title={maximized ? '还原窗口' : '最大化'}
        disabled={!desktop}
        onClick={() => void run('toggleMaximize')}
      >
        {maximized ? <Copy size={13} /> : <Square size={13} />}
      </button>
      <button
        className="window-close"
        aria-label="关闭窗口"
        title="关闭窗口"
        disabled={!desktop}
        onClick={() => void run('close')}
      >
        <X size={17} />
      </button>
    </div>
  );
}
