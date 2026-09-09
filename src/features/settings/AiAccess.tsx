import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, RefreshCw, Save } from 'lucide-react';
import { call, desktop } from '../../lib/api';

interface AiConfig {
  provider: string;
  baseUrl: string;
  model: string;
}
const defaults: AiConfig = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: '' };

export function AiAccess() {
  const [config, setConfig] = useState<AiConfig>(defaults);
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);
  const [token, setToken] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void call<AiConfig>('get_ai_config')
      .then((value) => {
        if (mounted.current) {
          setConfig(value);
          setReady(true);
        }
      })
      .catch((e) => {
        if (mounted.current) setError(String(e));
      });
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setHasToken(false);
    setTokenReady(false);
    void call<boolean>('ai_has_token', { config })
      .then((value) => {
        if (!cancelled) {
          setHasToken(value);
          setTokenReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
    // Credential identity only depends on the provider and address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, config.provider, config.baseUrl]);
  const patch = (value: Partial<AiConfig>, endpoint = false) => {
    generation.current++;
    setConfig((prev) => ({ ...prev, ...value }));
    setMessage('');
    setError('');
    if (endpoint) {
      setModels([]);
      setToken('');
      setHasToken(false);
      setTokenReady(false);
    }
  };
  const perform = async (action: string, fn: () => Promise<void>) => {
    setBusy(action);
    setError('');
    setMessage('');
    const current = generation.current;
    try {
      await fn();
    } catch (e) {
      if (mounted.current && current === generation.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy('');
    }
  };
  return (
    <section className="ai-access">
      <h2>
        <Bot size={18} />
        AI 接入
      </h2>
      <p className="field-help">为后续翻译选择 AI 服务。当前仅配置接入，尚未启用翻译。</p>
      <fieldset disabled={!ready || !!busy}>
        <div className="settings-two">
          <label className="field">
            服务提供方
            <select
              value={config.provider}
              onChange={(e) =>
                patch(
                  {
                    provider: e.target.value,
                    baseUrl: e.target.value === 'deepseek' ? defaults.baseUrl : '',
                    model: '',
                  },
                  true,
                )
              }
            >
              <option value="deepseek">DeepSeek（默认）</option>
              <option value="custom">第三方服务（兼容 OpenAI 接口）</option>
            </select>
          </label>
          <label className="field">
            API 地址
            <input
              value={config.baseUrl}
              disabled={config.provider === 'deepseek'}
              onChange={(e) => patch({ baseUrl: e.target.value, model: '' }, true)}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
            />
          </label>
        </div>
        <p className="field-help">
          填写服务商提供的基础地址，可包含 /v1；无需填写 /models 或
          /chat/completions。模型查询使用已保存的代理设置。
        </p>
        <label className="field">
          API 密钥 · {hasToken ? '已保存' : '未设置'}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            disabled={!desktop}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? '输入新密钥以替换' : '输入服务商的 API Key'}
          />
        </label>
        <div className="api-access-actions">
          <button
            disabled={!desktop || !token.trim() || !config.baseUrl.trim()}
            onClick={() =>
              void perform('token', async () => {
                await call('save_ai_token', { config, token });
                if (!mounted.current) return;
                setToken('');
                setHasToken(true);
                setTokenReady(true);
                setMessage('AI 密钥已安全保存');
              })
            }
          >
            {busy === 'token' ? <Loader2 size={16} className="spin" /> : <Save size={16} />}保存 AI 密钥
          </button>
          <button
            disabled={!desktop || !hasToken}
            onClick={() =>
              void perform('clear', async () => {
                await call('save_ai_token', { config, token: '' });
                if (!mounted.current) return;
                setToken('');
                setHasToken(false);
                setMessage('当前地址的 AI 密钥已清除');
              })
            }
          >
            清除密钥
          </button>
        </div>
        <p className="field-help">
          {desktop
            ? '密钥按 API 地址保存在 Windows 凭据管理器中，保存后立即生效。'
            : '浏览器预览不保存密钥或请求真实 AI 服务，请在桌面应用中接入。'}
        </p>
        <label className="field">
          翻译模型
          <div className="input-action">
            <input
              list="ai-model-list"
              value={config.model}
              onChange={(e) => patch({ model: e.target.value })}
              placeholder="获取列表后选择，也可手动输入模型 ID"
              spellCheck={false}
            />
            <datalist id="ai-model-list">
              {models.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            <button
              disabled={!desktop || !tokenReady || !!token.trim()}
              onClick={() =>
                void perform('models', async () => {
                  const ids = await call<string[]>('list_ai_models', { config });
                  if (!mounted.current) return;
                  setModels(ids);
                  setConfig((prev) => ({ ...prev, model: prev.model || ids[0] || '' }));
                  setMessage(`已获取 ${ids.length} 个模型，请选择后保存 AI 配置`);
                })
              }
            >
              {busy === 'models' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              获取模型列表
            </button>
          </div>
        </label>
        {!!models.length && (
          <label className="field">
            可用模型
            <select
              value={models.includes(config.model) ? config.model : ''}
              onChange={(e) => patch({ model: e.target.value })}
            >
              <option value="" disabled>
                选择模型
              </option>
              {models.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
        {!!token.trim() && <p className="field-help">请先保存新密钥，再获取模型列表。</p>}
        <div className="api-access-actions">
          <button
            className="primary"
            disabled={!config.baseUrl.trim() || !!token.trim()}
            onClick={() =>
              void perform('config', async () => {
                const saved = await call<AiConfig>('save_ai_config', { config });
                if (!mounted.current) return;
                setConfig(saved);
                setMessage('AI 配置已保存');
              })
            }
          >
            {busy === 'config' ? <Loader2 size={16} className="spin" /> : <Save size={16} />}保存 AI 配置
          </button>
        </div>
      </fieldset>
      {message && (
        <p className="ai-result" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="api-access-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
