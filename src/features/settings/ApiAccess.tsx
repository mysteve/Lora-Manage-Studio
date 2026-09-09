import { StateIcon } from '../../components/Motion';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, LogIn, Save, ShieldCheck } from 'lucide-react';
import { call, desktop, external } from '../../lib/api';
import { Modal } from '../../components/ui';

const SHOW_WEBSITE_LOGIN = false;

interface AuthStatus {
  hasToken: boolean;
  oauthConfigured: boolean;
}
interface Login {
  sessionId: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export function ApiAccess({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const closeGuide = useCallback(() => setShowGuide(false), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [login, setLogin] = useState<Login | null>(null);
  const mounted = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    mounted.current = true;
    void call<AuthStatus>('auth_status')
      .then((value) => {
        if (mounted.current) setStatus(value);
      })
      .catch(() => {
        if (mounted.current) setError('无法读取凭据状态，请关闭设置后重试。');
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!SHOW_WEBSITE_LOGIN || !login) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await call<{ complete: boolean; interval: number }>('poll_login', {
          sessionId: login.sessionId,
        });
        if (stopped) return;
        if (result.complete) {
          setStatus({ hasToken: true, oauthConfigured: true });
          setToken('');
          setVisible(false);
          setLogin(null);
          notifyRef.current('登录成功，授权凭据已安全保存');
        } else {
          timer = setTimeout(poll, Math.max(result.interval, 5) * 1000);
        }
      } catch (e) {
        if (!stopped) {
          setError(String(e));
          setLogin(null);
        }
      }
    };
    timer = setTimeout(poll, login.interval * 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      void call('cancel_login', { sessionId: login.sessionId }).catch(() => {});
    };
  }, [login]);

  const save = async (clear = false) => {
    setBusy(true);
    setError('');
    try {
      await call('save_token', { token: clear ? '' : token.trim() });
      setStatus((previous) => ({ hasToken: !clear, oauthConfigured: previous?.oauthConfigured ?? false }));
      setToken('');
      setVisible(false);
      notify(clear ? '本机凭据已清除' : 'API 密钥已安全保存');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const open = async (url: string) => {
    try {
      await external(url);
    } catch {
      setError('无法打开浏览器，请重试。');
    }
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const value = await call<Login>('start_login');
      if (!mounted.current) {
        await call('cancel_login', { sessionId: value.sessionId });
        return;
      }
      setLogin(value);
      await open(value.verificationUrl);
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="api-access">
      <div className="api-access-heading">
        <strong>API 密钥</strong>
        <span className={`api-access-status ${status?.hasToken ? 'saved' : ''}`}>
          {!desktop ? '预览模式' : !status ? '状态未就绪' : status.hasToken ? '已保存' : '未设置 · 可选'}
        </span>
      </div>
      <label className="field" htmlFor="api-token">
        手动输入或粘贴密钥
      </label>
      <div className="input-action">
        <input
          id="api-token"
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={token}
          disabled={busy || !!login || !desktop}
          onChange={(event) => setToken(event.target.value)}
          placeholder={status?.hasToken ? '输入新密钥可替换已保存的密钥' : '输入 API Key / Token'}
        />
        <button
          type="button"
          aria-label={visible ? '隐藏密钥' : '显示密钥'}
          aria-pressed={visible}
          disabled={!token || busy || !!login}
          onClick={() => setVisible(!visible)}
        >
          <StateIcon name={visible ? 'eyeOff' : 'eye'} size={17} />
        </button>
      </div>
      <div className="api-access-actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !!login || !token.trim() || !desktop}
          onClick={() => void save()}
        >
          {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}保存密钥
        </button>
        {status?.hasToken && (
          <button type="button" disabled={busy || !!login} onClick={() => void save(true)}>
            清除本机凭据
          </button>
        )}
        {SHOW_WEBSITE_LOGIN && (
          <button
            type="button"
            disabled={busy || !!login}
            onClick={() => void open('https://civitai.red/user/account')}
          >
            <ExternalLink size={16} />
            登录网站获取密钥
          </button>
        )}
      </div>
      <button type="button" className="link-button api-key-help" onClick={() => setShowGuide(true)}>
        如何获取 API 密钥
      </button>
      <AnimatePresence>
        {showGuide && (
          <Modal title="如何获取 API 密钥" onClose={closeGuide} portal>
            <div className="api-key-guide">
              <ol>
                <li>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void open('https://civitai.red/user/account')}
                  >
                    打开 Civitai 账户设置 <ExternalLink size={13} />
                  </button>
                  ，登录你的账号。
                </li>
                <li>找到 API Keys（API 密钥），创建新密钥，名称可填 LoRA Studio。</li>
                <li>复制生成的完整密钥。</li>
                <li>回到设置页面，粘贴到输入框并点击保存密钥。</li>
              </ol>
              <p>使用个人 API Key 即可，无需注册 OAuth 应用。</p>
              <p className="field-help">
                <ShieldCheck size={13} />
                {desktop
                  ? '密钥保存在 Windows 凭据管理器中，保存后立即生效。'
                  : '浏览器预览不会保存密钥，请在桌面应用中设置。'}
              </p>
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={closeGuide}>
                知道了
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
      {SHOW_WEBSITE_LOGIN && (
        <div className="api-login">
          <div>
            <strong>浏览器自动授权</strong>
            <p className="field-help">
              {status?.oauthConfigured
                ? '在浏览器登录并同意授权后，应用会自动保存凭据，无需复制密钥。'
                : '当前版本尚未配置登录授权，暂时请使用上方的手动输入。'}
            </p>
          </div>
          {!login && (
            <button
              type="button"
              disabled={!desktop || !status?.oauthConfigured || busy}
              onClick={() => void start()}
            >
              <LogIn size={16} />
              登录并自动获取
            </button>
          )}
        </div>
      )}
      {SHOW_WEBSITE_LOGIN && login && (
        <div className="api-login-pending" role="status">
          <p>
            <Loader2 size={16} className="spin" />
            等待浏览器授权，核对验证码 <strong>{login.userCode}</strong>
          </p>
          <p className="field-help">
            请在 {Math.ceil(login.expiresIn / 60)} 分钟内完成登录。关闭设置会停止等待。
          </p>
          <div className="api-access-actions">
            <button type="button" onClick={() => void open(login.verificationUrl)}>
              <ExternalLink size={16} />
              重新打开登录页
            </button>
            <button type="button" onClick={() => setLogin(null)}>
              取消登录
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="api-access-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
