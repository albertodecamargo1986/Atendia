// AtendIA — Chat Widget Embedável
// Adicione ao seu site:
// <script>
//   window.AtendIA = { apiKey: 'sua-api-key', companySlug: 'sua-empresa' };
// </script>
// <script src="https://app.atend-ia.com/widget.js" async></script>

(function () {
  if (window._atendiaLoaded) return;
  window._atendiaLoaded = true;

  const config = window.AtendIA || {};
  const API_BASE = config.apiUrl || 'https://api.atend-ia.com';
  const WS_BASE = config.wsUrl || 'wss://api.atend-ia.com';

  // ── Styles ──
  const styles = document.createElement('style');
  styles.textContent = `
    @keyframes atendiaFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes atendiaSlideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
    @keyframes atendiaPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }

    #atendia-widget-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483645;
      width: 60px; height: 60px; border-radius: 50%;
      background: ${config.primaryColor || '#6366f1'};
      color: white; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #atendia-widget-btn:hover { transform: scale(1.05); box-shadow: 0 6px 28px rgba(0,0,0,0.25); }
    #atendia-widget-btn svg { width: 28px; height: 28px; }

    #atendia-widget-popup {
      position: fixed; bottom: 96px; right: 24px; z-index: 2147483646;
      width: 380px; max-width: calc(100vw - 48px); height: 600px; max-height: calc(100vh - 120px);
      background: white; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      display: none; flex-direction: column; overflow: hidden;
      animation: atendiaSlideUp 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #18181b;
    }
    #atendia-widget-popup.open { display: flex; }

    #atendia-widget-header {
      background: ${config.primaryColor || '#6366f1'};
      color: white; padding: 16px 20px; display: flex;
      align-items: center; justify-content: space-between;
    }
    #atendia-widget-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    #atendia-widget-close {
      background: none; border: none; color: white; cursor: pointer;
      padding: 4px; border-radius: 4px; opacity: 0.8;
    }
    #atendia-widget-close:hover { opacity: 1; background: rgba(255,255,255,0.1); }

    #atendia-widget-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 8px; background: #f8f8fa;
    }

    .atendia-msg { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.4; word-wrap: break-word; animation: atendiaFadeIn 0.3s ease; }
    .atendia-msg.bot { align-self: flex-start; background: white; color: #18181b; border: 1px solid #e4e4e7; border-bottom-left-radius: 4px; }
    .atendia-msg.user { align-self: flex-end; background: ${config.primaryColor || '#6366f1'}; color: white; border-bottom-right-radius: 4px; }
    .atendia-msg.time { align-self: center; font-size: 11px; color: #a1a1aa; background: none; border: none; }

    .atendia-typing { display: flex; gap: 4px; padding: 12px 16px; align-self: flex-start; }
    .atendia-typing span { width: 8px; height: 8px; border-radius: 50%; background: #d4d4d8; animation: atendiaPulse 1.4s infinite; }
    .atendia-typing span:nth-child(2) { animation-delay: 0.2s; }
    .atendia-typing span:nth-child(3) { animation-delay: 0.4s; }

    #atendia-widget-input-area {
      display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e4e4e7;
      background: white;
    }
    #atendia-widget-input {
      flex: 1; border: 1px solid #e4e4e7; border-radius: 24px; padding: 10px 16px;
      font-size: 14px; outline: none; font-family: inherit;
    }
    #atendia-widget-input:focus { border-color: ${config.primaryColor || '#6366f1'}; }
    #atendia-widget-send {
      width: 40px; height: 40px; border-radius: 50%;
      background: ${config.primaryColor || '#6366f1'};
      color: white; border: none; cursor: pointer; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
    }
    #atendia-widget-send:disabled { opacity: 0.5; cursor: default; }
    #atendia-widget-send svg { width: 18px; height: 18px; }

    @media (max-width: 480px) {
      #atendia-widget-popup { right: 0; bottom: 0; width: 100%; max-width: 100%; height: 100%; max-height: 100%; border-radius: 0; }
    }
  `;
  document.head.appendChild(styles);

  // ── HTML ──
  const btn = document.createElement('button');
  btn.id = 'atendia-widget-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  document.body.appendChild(btn);

  const popup = document.createElement('div');
  popup.id = 'atendia-widget-popup';
  popup.innerHTML = `
    <div id="atendia-widget-header">
      <h3>${config.title || 'AtendIA'}</h3>
      <button id="atendia-widget-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div id="atendia-widget-messages">
      <div class="atendia-msg bot">${config.greeting || 'Olá! Como posso ajudar?'}</div>
    </div>
    <div id="atendia-widget-input-area">
      <input id="atendia-widget-input" type="text" placeholder="Digite sua mensagem..." />
      <button id="atendia-widget-send" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div>
  `;
  document.body.appendChild(popup);

  // ── Logic ──
  const messagesEl = popup.querySelector('#atendia-widget-messages')!;
  const inputEl = popup.querySelector('#atendia-widget-input') as HTMLInputElement;
  const sendBtn = popup.querySelector('#atendia-widget-send') as HTMLButtonElement;

  let ws: WebSocket | null = null;
  let sessionId = localStorage.getItem('atendia_widget_session') || crypto.randomUUID();
  localStorage.setItem('atendia_widget_session', sessionId);

  function addMessage(text: string, type: 'user' | 'bot') {
    const msg = document.createElement('div');
    msg.className = `atendia-msg ${type}`;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'atendia-typing';
    el.id = 'atendia-typing-indicator';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    const el = messagesEl.querySelector('#atendia-typing-indicator');
    if (el) el.remove();
  }

  function connectWS() {
    if (ws?.readyState === WebSocket.OPEN) return;
    ws = new WebSocket(`${WS_BASE}/widget?apiKey=${config.apiKey}&sessionId=${sessionId}`);

    ws.onmessage = (event) => {
      hideTyping();
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && data.content) {
          addMessage(data.content, 'bot');
        }
      } catch {}
    };

    ws.onclose = () => setTimeout(connectWS, 3000);
    ws.onerror = () => ws?.close();
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    sendBtn.disabled = true;
    addMessage(text, 'user');
    showTyping();

    try {
      const res = await fetch(`${API_BASE}/widget/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: config.apiKey,
          sessionId,
          message: text,
          companySlug: config.companySlug,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        hideTyping();
        if (data.content) addMessage(data.content, 'bot');
      } else {
        hideTyping();
        addMessage('Desculpe, não consegui processar sua mensagem. Tente novamente.', 'bot');
      }
    } catch {
      hideTyping();
      addMessage('Erro de conexão. Verifique sua internet.', 'bot');
    }
  }

  // ── Events ──
  btn.onclick = () => {
    const isOpen = popup.classList.contains('open');
    popup.classList.toggle('open');
    if (!isOpen) {
      connectWS();
      inputEl.focus();
    }
  };

  (popup.querySelector('#atendia-widget-close') as HTMLElement).onclick = () => {
    popup.classList.remove('open');
  };

  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.onclick = sendMessage;

  // ── Config check ──
  if (!config.apiKey) {
    console.warn('[AtendIA Widget] apiKey não configurada. Configure: window.AtendIA = { apiKey: "sua-chave" }');
  }
})();