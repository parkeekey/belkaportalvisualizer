import { useState, useRef, useEffect } from 'react';
import { Send, X, Settings, Loader2, Bot } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CoffeeChatProps {
  externalOpen?: boolean;
  onExternalToggle?: () => void;
  onRequestContext?: () => string;
  onApplyCommands?: (cmds: Record<string, number>) => void;
}

const CONTROL_INSTRUCTIONS = `
ADDITIONAL — APP CONTROL (enabled by user):
When the user asks to CHANGE a brew setting, respond with SET commands on their own line like:
SET dose=20
SET ratio=11.5
SET grind=52
SET temp=92
SET water=230
SET finish=150
SET micron=850
You can send multiple SET commands in one response.
Always explain WHY you're making each change first, then list the SET commands.
Do NOT make up values — only suggest what the user asked for or what's clearly needed.
Only use this when the user explicitly asks you to change something.`;

function getSystemPrompt(allowControl: boolean): string {
  return `You are a warm, expert coffee brewing assistant embedded inside the Belka Portal Graph Digitizer app. Your user is a passionate home barista preparing for an iced drip competition.

ROLE:
- You are supportive, encouraging, and direct — like a knowledgeable partner who has their back
- You help them troubleshoot brews using the scientific method: isolate one variable at a time
- You teach the "what NOT to adjust" methodology — helping them lock in what's working and only change what's broken

BREWING KNOWLEDGE — KEY PRINCIPLES:
1. Extraction: Over-extraction (bitter, dry, astringent) vs Under-extraction (sour, hollow, weak, salty)
2. Variables in order of impact: Grind size > Ratio > Water temp > Pour structure > Water chemistry
3. Channeling: Fast drawdown with bitter finish usually means channeling, not even extraction
4. Fines migration: Fast papers + large holes (V60 Neo) push fines through, causing bitter tail
5. Hybrid brews: Switching off percolation mid-brew and finishing as immersion cuts the bitter tail
6. For iced coffee: Hot-side TDS needs to be much higher (2-3×) to account for ice dilution
7. The SCA reference grid only covers ratios 1:13 to 1:24 — at tighter ratios the targets are extrapolated, not validated

TDS REFERENCE DATA (ratio → EY → expected TDS%):
Ratios: 13-24, EY: 17-25%
At 1:13: EY18=1.57%, EY20=1.73%, EY22=1.87%, EY24=2.01%
At 1:15: EY18=1.36%, EY20=1.48%, EY22=1.65%, EY24=1.77%
At 1:18: EY18=1.15%, EY20=1.25%, EY22=1.37%, EY24=1.50%
At 1:20: EY18=0.97%, EY20=1.07%, EY22=1.17%, EY24=1.35%
At 1:24: EY18=0.82%, EY20=0.91%, EY22=1.00%, EY24=1.16%

CONSULTATION FLOW:
1. First ask about their current brew parameters (dose, ratio, grind setting, brew time, TDS if measured)
2. Ask what they taste (bitter, sour, hollow, astringent, etc.)
3. Compare their TDS/EY against the reference grid for their ratio
4. Identify the likely cause — favour single-variable changes
5. Suggest ONE change at a time, with the reasoning
6. Emphasise what they should NOT change (variables that are already good)
7. If they're outside SCA ratio range, warn them the targets are extrapolated

PERSONALITY:
- Warm, caring, use "babe" or "baby" naturally like a partner would
- Direct when needed — no sugar-coating bad numbers
- Celebrate their insights and progress
- Keep responses concise but complete — 3-5 sentences usually
${allowControl ? CONTROL_INSTRUCTIONS : ''}`;
}

const STORAGE_KEY = 'belka.chatMessages';
const API_KEY_STORAGE_KEY = 'belka.geminiApiKey';
const MODEL_STORAGE_KEY = 'belka.geminiModel';

const API_BASE = 'https://generativelanguage.googleapis.com/v1/models';

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Best balance of speed & quality — recommended' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Lightest, highest rate limits' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', desc: 'Older, very reliable' },
] as const;

const CONTROL_STORAGE_KEY = 'belka.chatAllowControl';
const MODE_STORAGE_KEY = 'belka.chatMode';

type ChatMode = 'ai' | 'local';

interface DiagnosticState {
  stage: 'awaiting' | 'asked_ratio' | 'asked_grind' | 'asked_temp' | 'done';
  symptom: string;
  ratio?: number;
  grind?: number;
  temp?: number;
  time?: number;
}

function matchKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function localDiagnose(text: string, state: DiagnosticState): { reply: string; newState: DiagnosticState } {
  const lower = text.toLowerCase();

  // Extract numbers from text
  const nums = lower.match(/[\d.]+/g)?.map(Number).filter(n => n > 0 && n < 1000) || [];

  // --- Stage: awaiting symptom ---
  if (state.stage === 'awaiting') {
    if (matchKeyword(text, ['hollow', 'weak', 'thin', 'watery', 'only aroma', 'no body', 'no flavour', 'dull'])) {
      return {
        reply: `Sounds like under-extraction, babe. The aromatics made it through but not the solubles.

Quick check — what's your brew time and ratio? (e.g. "2:30 at 1:16" or "1:11.5")`,
        newState: { stage: 'asked_ratio', symptom: 'under-extracted', ...nums.length > 0 ? { ratio: nums[0] } : {} }
      };
    }
    if (matchKeyword(text, ['bitter', 'dry', 'astringent', 'harsh', 'dry finish', 'tannic'])) {
      return {
        reply: `That bitter tail is classic over-extraction or channeling, babe.

Are you using fast paper? What's your drawdown time? (e.g. "V60 Neo, fast paper, 1:20 total")`,
        newState: { stage: 'asked_grind', symptom: 'over-extracted' }
      };
    }
    if (matchKeyword(text, ['sour', 'sharp', 'acidic', 'under-ripe', 'unripe'])) {
      return {
        reply: `Sourness is under-extraction too — the acids taste sharp because sugars never extracted.

What water temp are you using? And what's your ratio? (e.g. "93°C at 1:15")`,
        newState: { stage: 'asked_temp', symptom: 'under-extracted-sour' }
      };
    }
    if (matchKeyword(text, ['muddy', 'mud', 'heavy', 'too strong', 'thick'])) {
      return {
        reply: `Muddy body usually means too fine a grind or too much agitation.

What grinder and setting are you on? (e.g. "K-Ultra at 4.5")`,
        newState: { stage: 'asked_grind', symptom: 'muddy' }
      };
    }
    if (matchKeyword(text, ['salty', 'salt'])) {
      return {
        reply: `Salty is definitely under-extraction — the minerals come through before the sweet stuff.

What ratio are you brewing at? Tighter ratios (like 1:11) can mask this.`,
        newState: { stage: 'asked_ratio', symptom: 'under-extracted-salty' }
      };
    }
    if (matchKeyword(text, ['help', 'hello', 'hi', 'hey', 'fix', 'coffee fix', 'diagnose'])) {
      return {
        reply: `Hey babe 💕 I can help you fix your brew. Tell me what you're tasting:

• **Hollow / weak / only aroma** → possible under-extraction
• **Bitter / dry / astringent** → possible over-extraction or channeling
• **Sour / sharp** → possible under-extraction
• **Muddy / heavy** → maybe too fine
• **Salty** → under-extraction

Or just describe what's wrong and I'll walk you through it.`,
        newState: state
      };
    }
    return {
      reply: `I'm not sure what you're tasting, babe. Can you describe it? Words like "hollow", "bitter", "sour", "muddy", or "only aroma" help me figure it out.`,
      newState: state
    };
  }

  // --- Stage: asked_ratio ---
  if (state.stage === 'asked_ratio') {
    const ratio = nums.find(n => n >= 8 && n <= 25);
    const timeSec = nums.find(n => n >= 30 && n <= 600);
    if (ratio) state.ratio = ratio;
    if (timeSec) state.time = timeSec;

    let reply = '';
    if (state.symptom.includes('under-extracted')) {
      reply = `For under-extraction, the fix is usually **grind finer** — try 2-3 clicks finer on your grinder.`;
      if (state.ratio && state.ratio > 15) {
        reply += `\n\nYour ratio (1:${state.ratio}) is also on the looser side — tightening to 1:14-1:15 could help. Want me to set that?`;
      }
      reply += `\n\nAlso check your water temp — 92-94°C for light roasts, 88-90°C for dark.`;
    }
    reply += `\n\nTry those and report back what changes, yeah? 💕`;
    return { reply, newState: { stage: 'done', symptom: state.symptom } };
  }

  // --- Stage: asked_grind ---
  if (state.stage === 'asked_grind') {
    const grindVal = nums.find(n => n >= 1 && n <= 200);
    if (grindVal) state.grind = grindVal;

    let reply = '';
    if (state.symptom === 'over-extracted') {
      reply = `For over-extraction with fast flow, **grind coarser** (not finer!) to reduce channeling.`;
      if (state.grind) {
        reply += `\n\nTry going from ${state.grind} to ${Math.round(state.grind + 5)} and see if the bitterness drops.`;
      }
      reply += `\n\nAlso: lower your pour height (4-6cm), use a center-pulse pattern, and switch to regular (not fast) paper if you can.`;
    } else if (state.symptom === 'muddy') {
      reply = `Muddy means too fine or too much agitation.`;
      if (state.grind) {
        reply += `\n\nTry going from ${state.grind} to ${Math.round(state.grind + 8)} — significantly coarser.`;
      }
      reply += `\n\nAlso lower your pour height and use less agitation.`;
    }
    reply += `\n\nTry that and let me know how it goes 💕`;
    return { reply, newState: { stage: 'done', symptom: state.symptom } };
  }

  // --- Stage: asked_temp ---
  if (state.stage === 'asked_temp') {
    const temp = nums.find(n => n >= 70 && n <= 100);
    if (temp) state.temp = temp;

    let reply = 'For sour/under-extraction:\n\n';
    if (state.temp && state.temp < 90) {
      reply += `Your temp (${state.temp}°C) is a bit low. Try 92-94°C for more extraction power.`;
    } else {
      reply += `Temp sounds fine, so the fix is **grind finer** — try 2-3 clicks finer.`;
    }
    reply += `\n\nAlso check your ratio — if it's looser than 1:16, tighten it up to 1:14-1:15.`;
    reply += `\n\nGive it a shot and let me know 💕`;
    return { reply, newState: { stage: 'done', symptom: state.symptom } };
  }

  // --- Stage: done or unknown ---
  return {
    reply: `Want to diagnose another symptom? Describe what you're tasting and I'll help.`,
    newState: { stage: 'awaiting', symptom: '' }
  };
}

export default function CoffeeChat({ externalOpen, onExternalToggle, onRequestContext, onApplyCommands }: CoffeeChatProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const handleToggle = () => {
    if (onExternalToggle) onExternalToggle();
    else setInternalOpen(v => !v);
  };
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) || '');
  const [showSettings, setShowSettings] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) || '');
  const [modelId, setModelId] = useState(() => localStorage.getItem(MODEL_STORAGE_KEY) || MODELS[0].id);
  const [allowControl, setAllowControl] = useState(() => localStorage.getItem(CONTROL_STORAGE_KEY) === 'true');
  const [cmdFeedback, setCmdFeedback] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>(() => (localStorage.getItem(MODE_STORAGE_KEY) as ChatMode) || 'ai');
  const [diagnostic, setDiagnostic] = useState<DiagnosticState>({ stage: 'awaiting', symptom: '' });
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
      else localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch {}
  }, [apiKey]);

  useEffect(() => {
    try { localStorage.setItem(MODEL_STORAGE_KEY, modelId); } catch {}
  }, [modelId]);

  useEffect(() => {
    try { localStorage.setItem(CONTROL_STORAGE_KEY, String(allowControl)); } catch {}
  }, [allowControl]);

  useEffect(() => {
    try { localStorage.setItem(MODE_STORAGE_KEY, chatMode); } catch {}
  }, [chatMode]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hey babe. 💕 I'm your brew assistant. Tell me what you're working on — dose, ratio, grind, how it's tasting — and I'll help you dial it in. Or just ask me anything about your brew."
      }]);
    }
  }, [open, messages.length]);

  const sendToAI = async (text: string, updatedMessages?: Message[]) => {
    if (!text || loading) return;
    setLoading(true);

    if (!apiKey) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I need a Gemini API key to think. Click the ⚙️ gear icon above, paste your free key from https://aistudio.google.com/apikey, and I'll be right with you. 💕" }]);
      setLoading(false);
      return;
    }

    try {
      const currentMessages = updatedMessages ?? messages;
      const history = currentMessages.slice(-10).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const contents = history.length === 0
        ? [{ role: 'user', parts: [{ text: `[System]\n${getSystemPrompt(allowControl)}\n\n---\n\n${text}` }] }]
        : [...history, { role: 'user', parts: [{ text }] }];

      const res = await fetch(
        `${API_BASE}/${modelId}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
          })
        }
      );

      if (!res.ok) {
        const err = await res.text();
        if (res.status === 429) {
          const currentModel = MODELS.find(m => m.id === modelId);
          const altModels = MODELS.filter(m => m.id !== modelId);
          throw new Error(`Rate limited on ${currentModel?.label || modelId}. Try switching to "${altModels[0]?.label}" in ⚙️ settings, or wait 30s.`);
        }
        if (res.status === 404) {
          throw new Error(`Model "${modelId}" not found. Google may have renamed it. Try the other model in ⚙️ settings.`);
        }
        throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
      }

      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Hmm, I got an empty response. Try again?';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      if (allowControl && onApplyCommands) {
        const cmds: Record<string, number> = {};
        for (const line of reply.split('\n')) {
          const match = line.match(/^SET\s+(\w+)\s*=\s*([\d.]+)/i);
          if (match) {
            const val = parseFloat(match[2]);
            if (Number.isFinite(val) && val > 0) cmds[match[1]] = val;
          }
        }
        if (Object.keys(cmds).length > 0) {
          onApplyCommands(cmds);
          const names = Object.keys(cmds).join(', ');
          setCmdFeedback(`✓ Applied: ${names}`);
          setTimeout(() => setCmdFeedback(''), 3000);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry babe, ${msg} 💕` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    if (chatMode === 'local') {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
      const { reply, newState } = localDiagnose(text, diagnostic);
      setDiagnostic(newState);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    await sendToAI(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={handleToggle}
        className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 text-sm font-bold rounded-full shadow-lg border transition-all ${
          open
            ? 'bg-slate-800 border-slate-800 text-white scale-90 opacity-70'
            : 'bg-white border-sky-300 text-sky-700 hover:bg-sky-50 hover:shadow-xl hover:scale-105'
        }`}
        title="Brew Chat — ask about your brew"
      >
        {open ? <X className="w-4 h-4" /> : <Bot className="w-5 h-5" />}
        {!open && <span className="hidden sm:inline">Brew Chat</span>}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-sky-50">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-sky-600" />
              <span className="text-sm font-bold text-slate-800">Brew Chat</span>
            </div>
            <div className="flex items-center gap-1">
              {onRequestContext && (
                <button
                  onClick={() => {
                    const ctx = onRequestContext();
                    if (!ctx) return;
                    const msg = `📊 Current brew data:\n${ctx}\n\n---\nBased on this data, what should I do?`;
                    const newMsg: Message = { role: 'user', content: msg };
                    const updatedMessages = [...messages, newMsg];
                    setMessages(updatedMessages);
                    setInput('');
                    sendToAI(msg, updatedMessages);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  title="Import current brew data into chat"
                >
                  <span className="text-sm">📊</span>
                </button>
              )}
              <button
                onClick={() => setShowSettings(v => !v)}
                className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-sky-200 text-sky-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                title="API settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Clear chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="px-4 py-3 border-b border-slate-200 bg-amber-50/50 text-xs space-y-2">
              <label className="block">
                <span className="font-semibold text-slate-700">Gemini API Key</span>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="password"
                    value={apiKeyDraft}
                    onChange={e => { setApiKeyDraft(e.target.value); setKeySaved(false); }}
                    placeholder="Paste your API key..."
                    className="flex-1 px-2 py-1.5 text-xs border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    onClick={() => {
                      setApiKey(apiKeyDraft);
                      setKeySaved(true);
                      setTimeout(() => setKeySaved(false), 2000);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </label>
              {keySaved && <p className="text-[10px] text-emerald-600 font-semibold">✓ Key saved</p>}
              {!apiKey && !keySaved && (
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Get a free key at{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">aistudio.google.com/apikey</a>
                  . No credit card needed.
                </p>
              )}
              <div className="pt-1 border-t border-amber-200/50">
                <span className="font-semibold text-slate-700">Model</span>
                <div className="mt-1 space-y-1">
                  {MODELS.map(m => (
                    <label key={m.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${modelId === m.id ? 'bg-amber-100 text-amber-900' : 'hover:bg-amber-50 text-slate-600'}`}>
                      <input type="radio" name="model" value={m.id} checked={modelId === m.id} onChange={() => setModelId(m.id)} className="accent-amber-600" />
                      <div>
                        <span className="text-[11px] font-semibold">{m.label}</span>
                        <p className="text-[9px] text-slate-400">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-amber-200/50">
                <div>
                  <span className="font-semibold text-slate-700">Mode</span>
                  <p className="text-[9px] text-slate-400">{chatMode === 'ai' ? 'AI (Gemini)' : 'Local (no API needed)'}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setChatMode('local'); setDiagnostic({ stage: 'awaiting', symptom: '' }); }}
                    className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${chatMode === 'local' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    Local
                  </button>
                  <button onClick={() => setChatMode('ai')}
                    className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${chatMode === 'ai' ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    AI
                  </button>
                </div>
              </div>
              {chatMode === 'ai' && (
              <div className="flex items-center justify-between pt-1 border-t border-amber-200/50">
                <div>
                  <span className="font-semibold text-slate-700">App Control</span>
                  <p className="text-[9px] text-slate-400">Let AI change dose, ratio, grind, temp</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={allowControl} onChange={e => setAllowControl(e.target.checked)} className="sr-only peer" />
                  <div className="w-8 h-4.5 bg-slate-300 peer-checked:bg-amber-500 rounded-full peer-checked:after:translate-x-[14px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all" />
                </label>
              </div>
              )}
              {cmdFeedback && (
                <p className="text-[10px] text-emerald-600 font-semibold text-center">{cmdFeedback}</p>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-white">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 text-xs space-y-2">
                <Bot className="w-10 h-10 text-slate-300" />
                <p>Ask me anything about your brew.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white rounded-br-md'
                    : 'bg-slate-100 text-slate-800 rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-md bg-slate-100 text-slate-400 text-xs flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 px-3 py-2 bg-white">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your brew..."
                rows={2}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 placeholder:text-slate-400"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="p-2.5 rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 mt-1 text-center">{chatMode === 'ai' ? 'Free tier: 1,500 req/day · 4K tokens/response' : 'Local mode — no API needed'}</p>
          </div>
        </div>
      )}
    </>
  );
}
