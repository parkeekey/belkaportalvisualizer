import { useState, useRef, useEffect } from 'react';
import { Send, X, Settings, Loader2, Bot, Trash2 } from 'lucide-react';
import { getReferenceTDS, getReferenceEY } from '../utils/tdsReference';

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

type LocalMode = 'menu' | 'symptom' | 'grinder' | 'turbulence' | 'bean' | 'recipe' | 'tds' | 'dial' | 'ec' | 'cut';

interface DiagnosticState {
  mode: LocalMode;
  step: number;
  data: Record<string, any>;
}

function matchKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function extractNum(text: string, min: number, max: number): number | null {
  const n = text.match(/[\d.]+/g)?.map(Number).find(n => n >= min && n <= max);
  return n ?? null;
}

// Embedded process guide data (condensed from SetupProfile)
const PROCESS_GUIDE: Record<string, { temp: number; density: number; grindImpact: string; extraction: string; waterPpm: string }> = {
  washed: { temp: 93, density: 65, grindImpact: 'Finer grind to increase extraction', extraction: 'Standard — clarity-focused pour, moderate agitation', waterPpm: '50–80' },
  natural: { temp: 90, density: 45, grindImpact: 'Coarser grind to control extraction', extraction: 'Low agitation — gentle pours, minimal turbulence', waterPpm: '110–130' },
  honey: { temp: 91, density: 55, grindImpact: 'Standard grind with slight adjustments', extraction: 'Balanced — medium agitation, consistent pours', waterPpm: '80–110' },
  anaerobic: { temp: 88, density: 40, grindImpact: 'Coarser grind to avoid over-extraction', extraction: 'Low agitation — avoid channeling, gentle swirl only', waterPpm: '60–80' },
  lactic: { temp: 90, density: 50, grindImpact: 'Standard to slightly finer grind', extraction: 'Moderate agitation — maintain steady flow rate', waterPpm: '60–80' },
  'carbonic-maceration': { temp: 88, density: 38, grindImpact: 'Coarser grind — very dense, slow flow', extraction: 'Very low agitation — long pre-infusion, gentle pours', waterPpm: '60–80' },
  'co-fermented': { temp: 89, density: 42, grindImpact: 'Coarser grind — sugar content accelerates extraction', extraction: 'Low agitation — shorter ratio to control extraction', waterPpm: '70–90' },
  koji: { temp: 89, density: 48, grindImpact: 'Standard grind — enzymatic breakdown increases solubility', extraction: 'Moderate agitation — watch for rapid extraction', waterPpm: '70–90' },
  'thermal-shock': { temp: 87, density: 35, grindImpact: 'Finer grind — brittle beans fracture easily, watch fines', extraction: 'Low agitation — thermal stress makes beans fragile', waterPpm: '60–80' },
};

const BREWER_ADVICE: Record<string, string> = {
  'v60': 'V60: conical, fast flow. Use spiral pours, medium-fine grind, keep pour height low (4-8cm) to avoid channeling.',
  'v60 neo': 'V60 Neo: larger holes. Use regular paper not fast paper. Coarser grind helps slow flow. Center-pulse pattern recommended.',
  'kalita': 'Kalita Wave: flat bottom, slower flow. Finer grind works, pulse pours help even extraction.',
  'chemex': 'Chemex: thick filters, slowest flow. Coarser grind, long contact time. Single slow pour works best.',
  'switch': 'Switch: hybrid brewer. Try immersion bloom (switch closed) then percolation. Great for controlling extraction.',
};

const GRIND_RANGES = {
  'espresso': { min: 1, max: 15, note: 'Fine — like powdered sugar' },
  'aeropress': { min: 15, max: 35, note: 'Medium-fine — like table salt' },
  'v60': { min: 25, max: 55, note: 'Medium — like beach sand' },
  'kalita': { min: 25, max: 50, note: 'Medium — slightly finer than V60' },
  'chemex': { min: 40, max: 65, note: 'Medium-coarse — like kosher salt' },
  'french press': { min: 55, max: 80, note: 'Coarse — like sea salt' },
};

function localDiagnose(text: string, state: DiagnosticState): { reply: string; newState: DiagnosticState } {
  const lower = text.toLowerCase();

  // Global commands: "menu", "back", "help"
  if (matchKeyword(text, ['menu', 'back to menu', 'main menu', 'home'])) {
    return {
      reply: `╔══ Brew Assistant ══╗
  Type a mode name to enter it:

  • **symptom** — Diagnose hollow, bitter, sour, etc.
  • **grinder** — Grind size recommendations
  • **turbulence** — Pour technique & flow advice  
  • **bean** — Process-specific brewing guide
  • **recipe** — Generate a new brew recipe
  • **tds** — Quick TDS/EY lookup for any ratio
  • **dial** — Track grind settings, log likes/dislikes, find your sweet spot
  • **ec** — EC & bed collapse analysis — understand your extraction health
  • **cut** — Cut time assist — decide when to pull based on your curve
  • **cut** — Cut time assist — decide when to pull based on your curve

  Or just describe your problem and I'll match it.`,
      newState: { mode: 'menu', step: 0, data: {} }
    };
  }

  // Handle back from within a mode
  if (matchKeyword(text, ['back', 'exit', 'stop'])) {
    return {
      reply: `Type **menu** to see all modes, or describe a new symptom.`,
      newState: { mode: 'menu', step: 0, data: {} }
    };
  }

  // Handle "check [something]" globally — routes to the right mode
  if (matchKeyword(text, ['check', 'checking', 'checkup'])) {
    if (matchKeyword(text, ['tds', 'ey', 'ratio', 'extraction'])) {
      return {
        reply: `TDS/EY lookup — tell me the ratio and EY% or TDS% you want to check.

Examples:
• "tds 1:15 at 20%" — TDS for 1:15 at 20% EY
• "ey 1:11.5 at 1.95%" — EY for 1:11.5 at 1.95% TDS
• "range 1:11.5" — SCA TDS range for that ratio`,
        newState: { mode: 'tds', step: 0, data: {} }
      };
    }
    if (matchKeyword(text, ['grind', 'grinder', 'setting', 'burr', 'micron', 'grindsize'])) {
      if (state.mode === 'dial') {
        return { reply: `You're already in dial mode. Say **history** to see your log, or tell me a new grind you tried.`, newState: state };
      }
      return {
        reply: `**Grind Dial-In** — tell me what you've tried and whether you liked it.

Say things like:
• "I tried **15** and **liked** it"
• "**17** was **too bitter**"
• "**14** was **good**"

I'll track your history, suggest the next grind to try, and show the search range + chance of finding your sweet spot.

Type **reset** to clear, or **happy** when you've found it.`,
        newState: { mode: 'dial', step: 0, data: {} }
      };
    }
    if (matchKeyword(text, ['symptom', 'taste', 'brew'])) {
      return {
        reply: `Describe what you taste: hollow, bitter, sour, muddy, or salty?`,
        newState: { mode: 'symptom', step: 0, data: {} }
      };
    }
    if (matchKeyword(text, ['recipe', 'pour', 'brew plan'])) {
      return {
        reply: `Recipe generator — I'll build you a pour plan.

Tell me: dose, ratio, hot or iced, and brewer. (e.g. "25g at 1:11.5 iced on V60 Neo")`,
        newState: { mode: 'recipe', step: 1, data: {} }
      };
    }
    if (matchKeyword(text, ['turbulence', 'pour technique', 'flow'])) {
      return {
        reply: `How do you pour? Describe your height, pattern, or pre-wet.`,
        newState: { mode: 'turbulence', step: 1, data: {} }
      };
    }
    if (matchKeyword(text, ['bean', 'process', 'roast'])) {
        return {
          reply: `Bean assist — brewing guide by process type.

What process is your coffee? (Washed, Natural, Honey, Anaerobic, Lactic, Carbonic Maceration, Co-Fermented, Koji, Thermal Shock)`,
          newState: { mode: 'bean', step: 1, data: {} }
        };
    }
    if (matchKeyword(text, ['cut', 'cutoff', 'pull', 'when to stop'])) {
      return {
        reply: `**Cut Time Assist** — use the Bed Health report table to decide when to pull.

The table shows you 4 key moments in your EC curve:

• **Decline ↓** — when extraction rate first slows. EC is still good, but the sweet spot is ending.
• **Collapse ↓** — when the bed starts losing structure. Cut BEFORE this if you want clean cups.
• **Cut @ RL** — when EC hits your red light threshold. Hard deadline — everything after is over-extracted.
• **Lowest** — the minimum EC reached post-peak. Useful for fast brews.

There's also a **Cut at time** field: type your target brew time (e.g. 1:20) and it instantly shows the EC + phase at that moment.

If you're brewing fast (1:00–1:30), focus on **Collapse ↓** and **Cut @ RL** — those tell you if your bed held together at that speed.`,
        newState: state
      };
    }
    if (matchKeyword(text, ['ec', 'bed', 'collapse', 'extraction health', 'conductivity'])) {
      return {
        reply: `**EC & Bed Collapse Analysis** — I'll help you understand your brew's health.

EC = Electrical Conductivity of your brew water, measured in µS/cm (or mS/cm). It tells you how much is actually being extracted.

Some context:
• EC ≤ 15 → bed likely collapsed, extraction stalled
• EC 16–20 → partial bed deformation, inconsistent
• EC 21–25 → moderate breakdown, risk of uneven extraction
• EC > 25 → healthy extraction, bed holding together

Tell me your EC reading, ratio, and what you're tasting and I'll give you a full analysis.`,
        newState: { mode: 'ec', step: 0, data: {} }
      };
    }
    return {
      reply: `Not sure what you want to check. Try **check tds**, **check grind**, **check taste**, **check recipe**, **check bean**, **check ec**, or **check pour**.`,
      newState: state
    };
  }

  // ── MODE: menu ──
  if (state.mode === 'menu') {
    if (matchKeyword(text, ['symptom', 'taste', 'bitter', 'sour', 'hollow', 'diagnose'])) {
      return {
        reply: `Symptom mode — describe what you're tasting and I'll help.

(Hollow, bitter, sour, muddy, salty — or just describe it)`,
        newState: { mode: 'symptom', step: 0, data: {} }
      };
    }
    if (matchKeyword(text, ['grinder', 'grind', 'setting', 'burr', 'micron'])) {
      return {
        reply: `Grinder assist — I'll help you find the right grind.

What brew method are you using? (e.g. "V60", "Kalita", "Aeropress", "espresso")`,
        newState: { mode: 'grinder', step: 1, data: {} }
      };
    }
    if (matchKeyword(text, ['turbulence', 'pour', 'height', 'spout', 'pattern', 'flow'])) {
      return {
        reply: `Turbulence assist — pour technique advice.

What brewer are you using? (e.g. "V60", "V60 Neo", "Kalita", "Switch")`,
        newState: { mode: 'turbulence', step: 1, data: {} }
      };
    }
    if (matchKeyword(text, ['bean', 'process', 'washed', 'natural', 'anaerobic', 'roast'])) {
      return {
        reply: `Bean assist — brewing guide by process type.

What process is your coffee? (Washed, Natural, Honey, Anaerobic, Lactic, Carbonic Maceration, Co-Fermented, Koji, Thermal Shock)`,
        newState: { mode: 'bean', step: 1, data: {} }
      };
    }
    // Quick TDS lookup from menu — detect ratio pattern with EY or TDS keyword
    const menuRatio = (() => {
      const m = text.match(/(?:1:)?(\d{2}(?:\.\d+)?)\b/);
      return m && parseFloat(m[1]) >= 8 ? parseFloat(m[1]) : null;
    })();
    if (menuRatio) {
      const menuEy = (() => {
        const m = text.match(/(?:(?:(\d{2}(?:\.\d+)?)\s*%\s*(?:EY|extraction))|(?:EY[:\s]+(\d{2}(?:\.\d+)?)\s*%))/i);
        return m ? parseFloat(m[1] || m[2]) : null;
      })();
      const menuTds = (() => {
        const m = text.match(/TDS[:\s]*(\d+(?:\.\d+)?)/i);
        return m ? parseFloat(m[1]) : null;
      })();
      if (menuEy) {
        const tds = getReferenceTDS(menuRatio, menuEy);
        return { reply: `At **1:${menuRatio}** with **${menuEy}% EY** → TDS = **${tds.toFixed(2)}%**`, newState: { mode: 'menu', step: 0, data: {} } };
      }
      if (menuTds) {
        const ey = getReferenceEY(menuRatio, menuTds);
        return { reply: `At **1:${menuRatio}** with **${menuTds.toFixed(2)}% TDS** → EY = **${ey.toFixed(1)}%**`, newState: { mode: 'menu', step: 0, data: {} } };
      }
    }
    if (matchKeyword(text, ['recipe', 'new recipe', 'generate', 'plan', 'pour plan'])) {
      return {
        reply: `Recipe generator — I'll build you a pour plan.

Tell me: dose, ratio, hot or iced, and brewer. (e.g. "25g at 1:11.5 iced on V60 Neo")`,
        newState: { mode: 'recipe', step: 1, data: {} }
      };
    }
    if (matchKeyword(text, ['tds', 'ey', 'reference', 'lookup'])) {
      // Check if they already provided ratio data in the same message
      const tdsRatio = (() => {
        const m = text.match(/(?:1:)?(\d{2}(?:\.\d+)?)\b/);
        return m && parseFloat(m[1]) >= 8 ? parseFloat(m[1]) : null;
      })();
      if (tdsRatio) {
        // Generate full table inline
        const tds18 = getReferenceTDS(tdsRatio, 18);
        const tds22 = getReferenceTDS(tdsRatio, 22);
        const tds20 = getReferenceTDS(tdsRatio, 20);
        const ey1_3 = getReferenceEY(tdsRatio, 1.3);
        const ey1_35 = getReferenceEY(tdsRatio, 1.35);
        let tab = `**TDS/EY table for 1:${tdsRatio}**\n\n`;
        tab += `| EY | TDS |\n`;
        tab += `|----|-----|\n`;
        tab += `| 18% | ${tds18.toFixed(2)}% |\n`;
        tab += `| 19% | ${getReferenceTDS(tdsRatio, 19).toFixed(2)}% |\n`;
        tab += `| 20% | ${tds20.toFixed(2)}% |\n`;
        tab += `| 21% | ${getReferenceTDS(tdsRatio, 21).toFixed(2)}% |\n`;
        tab += `| 22% | ${tds22.toFixed(2)}% |\n`;
        tab += `| 25% | ${getReferenceTDS(tdsRatio, 25).toFixed(2)}% |\n\n`;
        tab += `SCA range: **${tds18.toFixed(2)}% – ${tds22.toFixed(2)}%**\n`;
        tab += `At 1.30% TDS → ${ey1_3.toFixed(1)}% EY\n`;
        tab += `At 1.35% TDS → ${ey1_35.toFixed(1)}% EY\n`;
        return { reply: tab, newState: { mode: 'menu', step: 0, data: {} } };
      }
      return {
        reply: `TDS/EY lookup — tell me the ratio and EY% or TDS% you want to check.

Examples:
• "tds 1:15 at 20%" — TDS for 1:15 at 20% EY
• "ey 1:11.5 at 1.95%" — EY for 1:11.5 at 1.95% TDS
• "range 1:11.5" — SCA TDS range for that ratio`,
        newState: { mode: 'tds', step: 0, data: {} }
      };
    }
    if (matchKeyword(text, ['dial', 'track', 'grind log', 'sweet spot', 'dial in'])) {
      return {
        reply: `**Grind Dial-In** — tell me what you've tried and whether you liked it.

Say things like:
• "I tried **15** and **liked** it"
• "**17** was **too bitter**"
• "**14** was **good**"

I'll track your history, suggest the next grind to try, and show the search range + chance of finding your sweet spot.

Type **reset** to clear, or **happy** when you've found it.`,
        newState: { mode: 'dial', step: 0, data: {} }
      };
    }
    if (matchKeyword(text, ['ec', 'bed', 'collapse', 'extraction health', 'conductivity'])) {
      return {
        reply: `**EC & Bed Collapse Analysis** — I'll help you understand your brew's health.

EC = Electrical Conductivity of your brew water. It's a real-time window into how well your coffee bed is extracting.

Context:
• EC ≤ 15 → bed likely collapsed, extraction stalled
• EC 16–20 → partial bed deformation, inconsistent
• EC 21–25 → moderate breakdown, risk of uneven
• EC > 25 → healthy extraction, bed holding together

Tell me your EC reading, ratio, and what you're tasting.`,
        newState: { mode: 'ec', step: 0, data: {} }
      };
    }
    if (matchKeyword(text, ['cut', 'cutoff', 'pull', 'when to stop', 'cut time'])) {
      return {
        reply: `**Cut Time Assist** — use the Bed Health table to decide when to pull.

The table shows:
• **Decline ↓** — extraction slowing, sweet spot ending
• **Collapse ↓** — bed losing structure, cut before this
• **Cut @ RL** — EC hits red light, hard deadline
• **Lowest** — minimum EC post-peak

Type a target time in the **Cut at time** field below the chart to see EC + phase.`,
        newState: { mode: 'cut', step: 0, data: {} }
      };
    }

    // If they type a symptom directly from menu, switch to symptom mode
    if (matchKeyword(text, ['weak', 'thin', 'watery', 'only aroma', 'no body', 'dull', 'dry', 'astringent', 'harsh', 'salty', 'muddy'])) {
      state = { mode: 'symptom', step: 0, data: {} };
    } else {
      return {
        reply: `Not sure what you mean, babe. Try: **symptom**, **grinder**, **turbulence**, or **bean**. Or type **menu** to see options.`,
        newState: state
      };
    }
  }

  // ── MODE: symptom (existing flow, adapted) ──
  if (state.mode === 'symptom') {
    const nums = lower.match(/[\d.]+/g)?.map(Number).filter(n => n > 0 && n < 1000) || [];
    // Parse imported context for brew data
    const ctx = state.data.importedContext as string | undefined;
    const ctxRatio = ctx ? (() => { const m = ctx.match(/Ratio:\s*1:([\d.]+)/); return m ? parseInt(m[1]) : null; })() : null;
    const ctxGrind = ctx ? (() => { const m = ctx.match(/Grind setting:\s*([\d.]+)/); return m ? parseInt(m[1]) : null; })() : null;

    if (state.step === 0) {
      const ctxHint = ctxRatio ? ` (you're at 1:${ctxRatio})` : '';
      if (matchKeyword(text, ['hollow', 'weak', 'thin', 'watery', 'only aroma', 'no body', 'no flavour', 'dull'])) {
        return { reply: `Under-extraction. The aromatics came through but not the solubles.

What's your brew time${ctxHint}? (e.g. "2:30")`, newState: { mode: 'symptom', step: 1, data: { issue: 'under', ctx } } };
      }
      if (matchKeyword(text, ['bitter', 'dry', 'astringent', 'harsh', 'dry finish', 'tannic'])) {
        const grindHint = ctxGrind ? ` (grind at ${ctxGrind})` : '';
        return { reply: `Over-extraction or channeling. That bitter tail is from uneven flow.

What paper and brewer${grindHint}? Fast flow?`, newState: { mode: 'symptom', step: 1, data: { issue: 'over', ctx } } };
      }
      if (matchKeyword(text, ['sour', 'sharp', 'acidic', 'under-ripe'])) {
        return { reply: `Sour means under-extraction — acids before sugars.

Water temp and${ctxHint} ?`, newState: { mode: 'symptom', step: 1, data: { issue: 'sour', ctx } } };
      }
      if (matchKeyword(text, ['muddy', 'heavy', 'thick', 'too strong'])) {
        const grindHint = ctxGrind ? ` (current grind: ${ctxGrind})` : '';
        return { reply: `Too fine or too much agitation${grindHint}.

What grinder setting?`, newState: { mode: 'symptom', step: 1, data: { issue: 'muddy', ctx } } };
      }
      if (matchKeyword(text, ['salty'])) {
        return { reply: `Salty = under-extraction. Minerals extract first.

What ratio${ctxHint}?`, newState: { mode: 'symptom', step: 1, data: { issue: 'under', ctx } } };
      }
      return { reply: `Describe what you taste: hollow, bitter, sour, muddy, or salty?`, newState: state };
    }

    if (state.step === 1) {
      let reply = '';
      const d = state.data;
      const ctx = d.ctx as string | undefined;
      const ctxRatio = ctx ? (() => { const m = ctx.match(/Ratio:\s*1:([\d.]+)/); return m ? parseInt(m[1]) : null; })() : null;
      const ctxGrind = ctx ? (() => { const m = ctx.match(/Grind setting:\s*([\d.]+)/); return m ? parseInt(m[1]) : null; })() : null;
      if (d.issue === 'under' || d.issue === 'sour') {
        reply = `For under-extraction: **grind 2-3 clicks finer** first. That's the highest-impact change.`;
        const ratio = nums.find(n => n >= 8 && n <= 25) || ctxRatio;
        if (ratio && ratio > 15) reply += `\n\nYour ratio (1:${ratio}) is also loose — tightening to 1:14 helps.`;
        reply += `\n\nWater temp: 92-94°C for light roasts, 88-90°C for dark.`;
      } else if (d.issue === 'over') {
        reply = `For over-extraction: **grind slightly coarser** (not finer!) to reduce channeling.`;
        if (ctxGrind) reply += `\n\nCurrent grind: ${ctxGrind}. Try ${ctxGrind + 3}-${ctxGrind + 5}.`;
        reply += `\n\nAlso: lower pour height to 4-6cm, center-pulse pattern, and switch to regular paper.`;
      } else if (d.issue === 'muddy') {
        reply = `Go **significantly coarser** — 5-8 clicks, or until the drawdown speeds up.`;
        if (ctxGrind) reply += `\n\nFrom ${ctxGrind}, try ${ctxGrind + 5}-${ctxGrind + 8}.`;
        reply += `\n\nLower pour height and less agitation too.`;
      }
      reply += `\n\nTry that and tell me how it tastes 💕`;
      return { reply, newState: { mode: 'menu', step: 0, data: {} } };
    }
  }

  // ── MODE: grinder ──
  if (state.mode === 'grinder') {
    if (state.step === 1) {
      // Step 1: they told us the brew method
      let method: string | null = null;
      for (const [key] of Object.entries(GRIND_RANGES)) {
        if (lower.includes(key)) { method = key; break; }
      }
      if (!method) {
        return {
          reply: `What method? (V60, Kalita, Chemex, Aeropress, Espresso, French Press)`,
          newState: state
        };
      }
      const range = GRIND_RANGES[method as keyof typeof GRIND_RANGES];
      return {
        reply: `For **${method}**: typical range is **${range.min}–${range.max}** (${range.note}).

What's your current grind setting? And are you getting any specific taste issue?`,
        newState: { mode: 'grinder', step: 2, data: { method } }
      };
    }

    if (state.step === 2) {
      const setting = extractNum(text, 1, 200);
      let taste = '';
      if (matchKeyword(text, ['bitter', 'dry'])) taste = 'over';
      else if (matchKeyword(text, ['sour', 'hollow', 'weak'])) taste = 'under';
      else taste = 'ok';

      let reply = '';
      if (setting) reply = `Current: **${setting}**. `;
      if (taste === 'over') {
        reply += `Go **coarser** by 3-5. The extractions is running too hot.`;
      } else if (taste === 'under') {
        reply += `Go **finer** by 2-3 clicks. Need more extraction surface.`;
      } else {
        reply += `If it tastes good, you're in the zone. If not, try adjusting 2 clicks at a time.`;
      }
      const method = state.data.method as string;
      const range = GRIND_RANGES[method as keyof typeof GRIND_RANGES];
      if (range) reply += `\n\nYour ${method} sweet spot is typically ${range.min}–${range.max}.`;
      reply += `\n\nType **menu** for other tools, or describe a new symptom.`;
      return { reply, newState: { mode: 'menu', step: 0, data: {} } };
    }
  }

  // ── MODE: turbulence ──
  if (state.mode === 'turbulence') {
    if (state.step === 1) {
      let brewer = '';
      if (matchKeyword(text, ['v60 neo', 'neo'])) brewer = 'v60 neo';
      else if (matchKeyword(text, ['v60', 'hario'])) brewer = 'v60';
      else if (matchKeyword(text, ['kalita', 'wave'])) brewer = 'kalita';
      else if (matchKeyword(text, ['chemex'])) brewer = 'chemex';
      else if (matchKeyword(text, ['switch'])) brewer = 'switch';

      if (!brewer) {
        return { reply: `What brewer? (V60, V60 Neo, Kalita, Chemex, Switch)`, newState: state };
      }
      const advice = BREWER_ADVICE[brewer] || '';
      return {
        reply: `${advice}

What pour pattern do you use? (spiral, center-pulse, single-point) And what height? (e.g. "spiral at 10cm")`,
        newState: { mode: 'turbulence', step: 2, data: { brewer } }
      };
    }

    if (state.step === 2) {
      let pattern = matchKeyword(text, ['spiral']) ? 'spiral' : matchKeyword(text, ['center-pulse', 'pulse']) ? 'center-pulse' : matchKeyword(text, ['single-point', 'single']) ? 'single-point' : null;
      const height = extractNum(text, 1, 30);

      let reply = '';
      if (pattern) reply = `**${pattern}** pattern. `;
      if (height) reply += `Pour height **${height}cm**. `;

      if ((height && height > 10) || pattern === 'single-point') {
        reply += '\n\n⚠ That generates high turbulence — risk of channeling. Try lower height (4-6cm) and a spiral or center-pulse pattern for even extraction.';
      } else if (pattern === 'spiral' && height && height <= 10) {
        reply += '\n\n✓ Good balance. Spiral + moderate height = even extraction. Could try center-pulse if you get channeling.';
      } else {
        reply += '\n\nGeneral rule: lower height (4-8cm) + wider spout = less turbulence, fewer channels.';
      }
      reply += `\n\nType **menu** for other tools.`;
      return { reply, newState: { mode: 'menu', step: 0, data: {} } };
    }
  }

  // ── MODE: bean ──
  if (state.mode === 'bean') {
    if (state.step === 1) {
      let processId: string | null = null;
      for (const [id] of Object.entries(PROCESS_GUIDE)) {
        if (lower.includes(id)) { processId = id; break; }
      }
      if (!processId) {
        return {
          reply: `What process? (Washed, Natural, Honey, Anaerobic, Lactic, Carbonic Maceration, Co-Fermented, Koji, Thermal Shock)`,
          newState: state
        };
      }
      const g = PROCESS_GUIDE[processId];
      const label = processId.charAt(0).toUpperCase() + processId.slice(1).replace('-', ' ');
      return {
        reply: `**${label}** brewing guide:

• Water temp: **${g.temp}°C**
• Density: ${g.density}% — ${g.density < 50 ? 'light, careful with agitation' : 'dense, needs more extraction'}
• Grind: ${g.grindImpact}
• Method: ${g.extraction}
• Water PPM: ${g.waterPpm}

Want specific advice for this process? Ask about grind, temp, or water.`,
        newState: { mode: 'bean', step: 2, data: { process: processId } }
      };
    }

    if (state.step === 2) {
      let reply = '';
      if (matchKeyword(text, ['grind'])) {
        const g = PROCESS_GUIDE[state.data.process as string];
        reply = `For ${state.data.process}: ${g.grindImpact}. Try starting mid-range and adjust by taste.`;
      } else if (matchKeyword(text, ['temp', 'temperature', 'water'])) {
        const g = PROCESS_GUIDE[state.data.process as string];
        reply = `For ${state.data.process}: brew at **${g.temp}°C**. Water PPM target: ${g.waterPpm}.`;
      } else {
        reply = `Ask me about **grind**, **temp**, or **water** for this process. Or type **menu** for other tools.`;
      }
      reply += `\n\nType **menu** to switch modes.`;
      return { reply, newState: { mode: 'menu', step: 0, data: {} } };
    }
  }

  // ── MODE: recipe ──
  if (state.mode === 'recipe') {
    if (state.step === 1) {
      let dose = extractNum(text, 5, 60);
      let ratio = extractNum(text, 8, 25);
      const isIced = matchKeyword(text, ['ice', 'iced', 'cold']);

      // Use imported context data as defaults if available
      const ctx = state.data.importedContext as string | undefined;
      if (!dose && ctx) {
        const m = ctx.match(/Dose:\s*([\d.]+)g/);
        if (m) dose = parseFloat(m[1]);
      }
      if (!ratio && ctx) {
        const m = ctx.match(/Ratio:\s*1:([\d.]+)/);
        if (m) ratio = parseInt(m[1]);
      }
      let brewer = '';
      if (matchKeyword(text, ['v60 neo', 'neo'])) brewer = 'V60 Neo';
      else if (matchKeyword(text, ['v60', 'hario'])) brewer = 'V60';
      else if (matchKeyword(text, ['kalita', 'wave'])) brewer = 'Kalita Wave';
      else if (matchKeyword(text, ['switch'])) brewer = 'Hario Switch';

      if (!dose || !ratio) {
        return {
          reply: `Tell me the dose and ratio at least. (e.g. "25g at 1:11.5 iced on V60 Neo")`,
          newState: state
        };
      }

      const water = Math.round(dose * ratio);
      const icePct = isIced ? 40 : 0;
      const ice = isIced ? Math.round(water * icePct / 100) : 0;
      const hotWater = water - ice;

      let reply = `╔══ Recipe: ${dose}g × 1:${ratio} ${isIced ? '🧊 ICED' : '☕ HOT'} ══╗\n\n`;
      reply += `Total water: **${water}g**${isIced ? `\nHot water: **${hotWater}g**\nIce: **${ice}g** (${icePct}%)` : ''}\n`;
      reply += `Beverage: **~${water}g**\n\n`;

      if (isIced) {
        reply += `**Pour plan (iced):**\n`;
        reply += `1. Bloom: ${Math.round(dose * 2.5)}g — 45s\n`;
        const pours = 4;
        const pourSize = Math.round(hotWater / pours);
        for (let i = 0; i < pours; i++) {
          const cumG = Math.round(pourSize * (i + 1));
          const cumPct = Math.round((cumG / hotWater) * 100);
          const time = i === 0 ? 45 : 30 + i * 20;
          reply += `${i + 2}. Pour ${pourSize}g (to ${cumG}g / ${cumPct}%) — ~${time}s\n`;
        }
        const totalTime = Math.round(45 + pours * 25);
        reply += `\nTarget brew time: **~${Math.floor(totalTime / 60)}:${(totalTime % 60).toString().padStart(2, '0')}**\n`;
        // TDS/EY for iced: compute hot-side and final
        const icedTds18 = getReferenceTDS(ratio, 18);
        const icedTds22 = getReferenceTDS(ratio, 22);
        const icedTds25 = getReferenceTDS(ratio, 25);
        const hotTds18 = ratio > 0 && hotWater > 0 ? icedTds18 * water / hotWater : 0;
        const hotTds22 = ratio > 0 && hotWater > 0 ? icedTds22 * water / hotWater : 0;
        const hotTds25 = ratio > 0 && hotWater > 0 ? icedTds25 * water / hotWater : 0;
        reply += `\n**Expected TDS range (target 18-22% EY):**\n`;
        reply += `  Hot-side TDS: **${hotTds18.toFixed(2)}% – ${hotTds22.toFixed(2)}%**\n`;
        reply += `  Final cup TDS (after ice): **${icedTds18.toFixed(2)}% – ${icedTds22.toFixed(2)}%**\n`;
        reply += `  At 25% EY (max): hot ${hotTds25.toFixed(2)}% → final ${icedTds25.toFixed(2)}%\n`;
      } else {
        const pours = ratio <= 14 ? 5 : ratio <= 16 ? 4 : 3;
        const pourSize = Math.round(water / pours);
        reply += `**Pour plan (hot):**\n`;
        reply += `1. Bloom: ${Math.round(dose * 2.5)}g — 30s\n`;
        for (let i = 0; i < pours - 1; i++) {
          reply += `${i + 2}. Pour ${pourSize}g — wait for bed to drain ~⅓\n`;
        }
        reply += `${pours}. Final pour — let drawdown finish\n`;
        const totalTime = pours * 45;
        reply += `\nTarget brew time: **~${Math.floor(totalTime / 60)}:${(totalTime % 60).toString().padStart(2, '0')}**\n`;
        // TDS/EY for hot
        const hotTds18 = getReferenceTDS(ratio, 18);
        const hotTds22 = getReferenceTDS(ratio, 22);
        const hotTds25 = getReferenceTDS(ratio, 25);
        const approxTds = getReferenceTDS(ratio, 20);
        reply += `\n**Expected (SCA zone, 18-22% EY):**\n`;
        reply += `  TDS: **${hotTds18.toFixed(2)}% – ${hotTds22.toFixed(2)}%**\n`;
        reply += `  At ~${approxTds.toFixed(2)}% TDS = **~20% EY**\n`;
        reply += `  Max (25% EY): **${hotTds25.toFixed(2)}% TDS**\n`;
      }

      reply += `\n**Suggested grind:** medium${brewer ? ` for ${brewer}` : ''} — start mid-range and adjust\n`;
      reply += `\nWant me to adjust anything? Or type **menu** for other tools.`;

      return { reply, newState: { mode: 'menu', step: 0, data: { dose, ratio, isIced, brewer, water, hotWater, ice } } };
    }
  }

  // ── MODE: tds ──
  if (state.mode === 'tds') {
    const ratioNum = (() => {
      const m = text.match(/(?:1:)?(\d{2}(?:\.\d+)?)\b/);
      if (m) return parseFloat(m[1]);
      const m2 = text.match(/ratio\s*(?:of\s*)?(\d{2}(?:\.\d+)?)/i);
      return m2 ? parseFloat(m2[1]) : null;
    })();
    const eyNum = (() => {
      const m = text.match(/(?:(?:(\d{2}(?:\.\d+)?)\s*%\s*(?:EY|extraction))|(?:EY[:\s]+(\d{2}(?:\.\d+)?)\s*%))/i);
      return m ? parseFloat(m[1] || m[2]) : null;
    })();
    const tdsNum = (() => {
      const m = text.match(/(?:TDS|tds)\s*(\d+(?:\.\d+)?)\s*%/i);
      return m ? parseFloat(m[1]) : null;
    })();

    if (state.step === 0 && ratioNum) {
      if (eyNum && ratioNum >= 5) {
        const tds = getReferenceTDS(ratioNum, eyNum);
        return {
          reply: `At **1:${ratioNum}** with **${eyNum}% EY** → TDS = **${tds.toFixed(2)}%**`,
          newState: { mode: 'menu', step: 0, data: {} }
        };
      }
      if (tdsNum && ratioNum >= 5) {
        const ey = getReferenceEY(ratioNum, tdsNum);
        return {
          reply: `At **1:${ratioNum}** with **${tdsNum.toFixed(2)}% TDS** → EY = **${ey.toFixed(1)}%**`,
          newState: { mode: 'menu', step: 0, data: {} }
        };
      }
      if (matchKeyword(text, ['range']) && ratioNum >= 5) {
        const tds18 = getReferenceTDS(ratioNum, 18);
        const tds22 = getReferenceTDS(ratioNum, 22);
        return {
          reply: `At **1:${ratioNum}** SCA zone (18-22% EY): TDS **${tds18.toFixed(2)}% – ${tds22.toFixed(2)}%**`,
          newState: { mode: 'menu', step: 0, data: {} }
        };
      }
    }

    if (state.step >= 0) {
      if (ratioNum && ratioNum >= 5) {
        const tds18 = getReferenceTDS(ratioNum, 18);
        const tds22 = getReferenceTDS(ratioNum, 22);
        const tds20 = getReferenceTDS(ratioNum, 20);
        const ey1_3 = getReferenceEY(ratioNum, 1.3);
        const ey1_35 = getReferenceEY(ratioNum, 1.35);
        let tab = `**TDS/EY table for 1:${ratioNum}**\n\n`;
        tab += `| EY | TDS |\n`;
        tab += `|----|-----|\n`;
        tab += `| 18% | ${tds18.toFixed(2)}% |\n`;
        tab += `| 19% | ${getReferenceTDS(ratioNum, 19).toFixed(2)}% |\n`;
        tab += `| 20% | ${tds20.toFixed(2)}% |\n`;
        tab += `| 21% | ${getReferenceTDS(ratioNum, 21).toFixed(2)}% |\n`;
        tab += `| 22% | ${tds22.toFixed(2)}% |\n`;
        tab += `| 25% | ${getReferenceTDS(ratioNum, 25).toFixed(2)}% |\n\n`;
        tab += `SCA range: **${tds18.toFixed(2)}% – ${tds22.toFixed(2)}%**\n`;
        tab += `At 1.30% TDS → ${ey1_3.toFixed(1)}% EY\n`;
        tab += `At 1.35% TDS → ${ey1_35.toFixed(1)}% EY\n`;
        return { reply: tab, newState: { mode: 'menu', step: 0, data: {} } };
      }
      return {
        reply: `Enter a ratio number (e.g. "1:15" or just "15") and optionally "at 20% EY" or "at 1.35% TDS".\n\nOr say **range 1:15** for the SCA zone.**`,
        newState: state
      };
    }
  }

  // ── MODE: dial ──
  if (state.mode === 'dial') {
    const DIAL_KEY = 'belka.grindDialLog';

    function getDialLog(): { grind: number; rating: 'like' | 'dislike'; note?: string }[] {
      try { return JSON.parse(localStorage.getItem(DIAL_KEY) || '[]'); } catch { return []; }
    }
    function saveDialLog(entries: { grind: number; rating: 'like' | 'dislike'; note?: string }[]) {
      localStorage.setItem(DIAL_KEY, JSON.stringify(entries));
    }

    // Reset
    if (matchKeyword(text, ['reset', 'clear log', 'start over'])) {
      localStorage.removeItem(DIAL_KEY);
      return {
        reply: `Log cleared. You're starting fresh. Tell me your next grind try.`,
        newState: { mode: 'dial', step: 0, data: {} }
      };
    }

    const entries = getDialLog();

    // Happy — mark a favorite
    if (matchKeyword(text, ['happy', 'found it', 'done', 'perfect', 'that\'s it'])) {
      const nums = text.match(/[\d.]+/g)?.map(Number) || [];
      const happyGrind = nums.find(n => n >= 1 && n <= 100);
      if (happyGrind) {
        // Update the liked entry to mark as final
        const updated = entries.map(e => e.grind === happyGrind ? { ...e, note: (e.note || '') + ' ★FINAL' } : e);
        if (!updated.some(e => e.grind === happyGrind)) {
          updated.push({ grind: happyGrind, rating: 'like', note: '★FINAL' });
        }
        saveDialLog(updated);
        return {
          reply: `🎯 **Sweet spot saved: #${happyGrind}!** You're locked in, babe. Type **menu** when you're ready for other tools.`,
          newState: { mode: 'dial', step: 0, data: {} }
        };
      }
      // No number given — assume the most recent liked is the winner
      const lastLiked = [...entries].reverse().find(e => e.rating === 'like');
      if (lastLiked) {
        const updated = entries.map(e => e.grind === lastLiked.grind ? { ...e, note: (e.note || '') + ' ★FINAL' } : e);
        saveDialLog(updated);
        return {
          reply: `🎯 **Sweet spot saved: #${lastLiked.grind}!** Congrats babe! Type **menu** to switch modes.`,
          newState: { mode: 'dial', step: 0, data: {} }
        };
      }
      return {
        reply: `You said you're happy — tell me which grind worked so I can save it. (e.g. "happy with #15")`,
        newState: state
      };
    }

    // History
    if (matchKeyword(text, ['history', 'log', 'what i tried', 'show me'])) {
      if (entries.length === 0) {
        return { reply: `No entries yet. Tell me a grind you tried!`, newState: state };
      }
      let hist = `**Your grind log:**\n`;
      for (const e of [...entries].reverse().slice(0, 20)) {
        const icon = e.rating === 'like' ? '👍' : '👎';
        const finalTag = e.note?.includes('★FINAL') ? ' ✓' : '';
        hist += `  #${e.grind} ${icon}${e.note && !e.note.includes('★FINAL') ? ' — ' + e.note : ''}${finalTag}\n`;
      }
      return { reply: hist, newState: state };
    }

    // Parse grind numbers + sentiment
    const grindNums = text.match(/[\d.]+/g)?.map(Number).filter(n => n >= 1 && n <= 100) || [];
    const likeWords = ['like', 'good', 'great', 'yummy', 'nice', 'loved', 'best', 'amazing', 'smooth', 'clean', 'sweet', 'better', 'improved', 'improvement', 'improving', 'progress'];
    const dislikeWords = ['dislike', 'bad', 'bitter', 'sour', 'harsh', 'muddy', 'weak', 'terrible', 'worst', 'awful', 'astringent', 'tannic', 'dry', 'thin', 'watery', 'salty', 'hollow', 'over', 'under', 'too fine', 'too coarse', 'channelling', 'channeling'];

    const isLike = likeWords.some(w => lower.includes(w));
    const isDislike = dislikeWords.some(w => lower.includes(w));

    if (grindNums.length > 0 && (isLike || isDislike)) {
      for (const g of grindNums) {
        const existing = entries.findIndex(e => e.grind === g);
        const entry = { grind: g, rating: isLike ? 'like' as const : 'dislike' as const, note: isLike ? 'liked' : 'disliked' };
        if (existing >= 0) {
          entries[existing] = { ...entries[existing], ...entry };
        } else {
          entries.push(entry);
        }
      }
      saveDialLog(entries);

      // Build response
      let reply = '';
      const liked = entries.filter(e => e.rating === 'like').map(e => e.grind).sort((a, b) => a - b);
      const disliked = entries.filter(e => e.rating === 'dislike').map(e => e.grind).sort((a, b) => a - b);

      reply += `Got it! `;
      for (const g of grindNums) {
        const icon = isLike ? '👍' : '👎';
        reply += `#${g} ${icon} `;
      }
      reply += `\n\n`;

      // Show history summary
      if (entries.length > 0) {
        reply += `**Log:** `;
        for (const e of [...entries].reverse().slice(0, 10)) {
          const icon = e.rating === 'like' ? '👍' : '👎';
          reply += `#${e.grind}${icon} `;
        }
        reply += `\n\n`;
      }

      // Suggest next target
      const minLiked = liked.length > 0 ? liked[0] : null;
      const maxLiked = liked.length > 0 ? liked[liked.length - 1] : null;
      const upperDislike = disliked.length > 0 && maxLiked !== null ? disliked.find(d => d > maxLiked) : null;
      const lowerDislike = disliked.length > 0 && minLiked !== null ? [...disliked].reverse().find(d => d < minLiked) : null;
      const targetRange = state.data.targetRange as { min: number; max: number } | undefined;

      const rangeMin = lowerDislike != null ? lowerDislike : (targetRange ? targetRange.min : (minLiked != null ? minLiked - 2 : 1));
      const rangeMax = upperDislike != null ? upperDislike : (targetRange ? targetRange.max : (maxLiked != null ? maxLiked + 2 : 100));
      const triedSet = new Set(entries.map(e => e.grind));

      let target: number | null = null;
      if (maxLiked != null && upperDislike != null) {
        // Bracketed above — try midpoint
        target = Math.round((maxLiked + upperDislike) / 2 * 2) / 2;
      } else if (minLiked != null && lowerDislike != null) {
        // Bracketed below — try midpoint
        target = Math.round((lowerDislike + minLiked) / 2 * 2) / 2;
      } else if (maxLiked != null) {
        // Only likes — suggest one step finer
        target = Math.round((maxLiked + 1) * 2) / 2;
      }

      // Adjust if already tried
      if (target !== null) {
        const triedAdjs = [0, 0.5, 1, 1.5, 2, -0.5, -1, -1.5, -2];
        for (const adj of triedAdjs) {
          const candidate = Math.round((target + adj) * 2) / 2;
          if (!triedSet.has(candidate) && candidate >= rangeMin && candidate <= rangeMax) {
            target = candidate;
            break;
          }
        }
        if (triedSet.has(target)) target = null; // all options exhausted
      }

      // Calculate chance %
      const totalInRange = Math.round((rangeMax - rangeMin) * 2) + 1; // slots at 0.5 increments
      const triedInRange = entries.filter(e => e.grind >= rangeMin && e.grind <= rangeMax).length;
      const remaining = Math.max(1, totalInRange - triedInRange);
      const confidence = 100 - Math.round((liked.length > 0 ? (remaining / totalInRange) * 50 : 70));
      const chance = Math.min(95, Math.max(5, confidence));

      if (target !== null) {
        reply += `**Next try: #${target.toFixed(1)}**\n`;
        reply += `Range: **${rangeMin.toFixed(1)} – ${rangeMax.toFixed(1)}** | Chance: **~${chance}%**\n`;
        reply += `\nTell me how it goes! Or say **history**, **reset**, or **happy with #X**.`;
      } else if (liked.length > 0 && disliked.length > 0 && maxLiked !== null && upperDislike !== null && maxLiked === upperDislike! - 1) {
        const finalGrind = liked.length > 0 ? liked[liked.length - 1] : null;
        reply += `Looks like **#${finalGrind}** might be your sweet spot! Say **happy with #${finalGrind}** to lock it in. 💕`;
      } else {
        reply += `Tell me another grind you tried and I'll help narrow it down.`;
      }

      return { reply, newState: state };
    }

    // User is talking about range/target, not a new try
    if (matchKeyword(text, ['range', 'target', 'next', 'recommend', 'suggest'])) {
      const rangeNums = text.match(/[\d.]+/g)?.map(Number).filter((n, i, a) => n >= 1 && n <= 100 && (a.length === 1 || i < 2)) || [];
      // If user gave numbers with "range" — treat as setting their target range
      if (rangeNums.length >= 2) {
        const rMin = Math.min(rangeNums[0], rangeNums[1]);
        const rMax = Math.max(rangeNums[0], rangeNums[1]);
        let confirm = `**Target range set: ${rMin.toFixed(1)} – ${rMax.toFixed(1)}**`;
        if (entries.length > 0) {
          confirm += `\nLog history: `;
          for (const e of [...entries].reverse().slice(0, 10)) {
            confirm += `#${e.grind}${e.rating === 'like' ? '👍' : '👎'} `;
          }
        }
        confirm += `\nTry a grind in that zone and tell me how it tastes 💕`;
        return { reply: confirm, newState: { mode: 'dial', step: 0, data: { targetRange: { min: rMin, max: rMax } } } };
      }
      if (rangeNums.length === 1) {
        // Single number — treat as target, set range around it
        const center = rangeNums[0];
        return { reply: `**Target set: #${center}** — range around **${(center - 1).toFixed(1)} – ${(center + 1).toFixed(1)}**. Try it and let me know!`, newState: { mode: 'dial', step: 0, data: { targetRange: { min: center - 1, max: center + 1 } } } };
      }
      // No numbers — show computed range from log
      if (entries.length === 0) {
        return { reply: `You haven't tried anything yet. Say **range 13-14** to set a target range, then tell me how it tastes!`, newState: state };
      }
      const liked = entries.filter(e => e.rating === 'like').map(e => e.grind).sort((a, b) => a - b);
      const disliked = entries.filter(e => e.rating === 'dislike').map(e => e.grind).sort((a, b) => a - b);
      const maxLiked = liked.length > 0 ? liked[liked.length - 1] : null;
      const minLiked = liked.length > 0 ? liked[0] : null;
      const upperDislike = disliked.length > 0 && maxLiked != null ? disliked.find(d => d > maxLiked) : null;
      const lowerDislike = disliked.length > 0 && minLiked != null ? [...disliked].reverse().find(d => d < minLiked) : null;
      const targetRange = state.data.targetRange as { min: number; max: number } | undefined;
      const rangeMin = lowerDislike != null ? lowerDislike : (targetRange ? targetRange.min : (minLiked != null ? minLiked - 2 : 1));
      const rangeMax = upperDislike != null ? upperDislike : (targetRange ? targetRange.max : (maxLiked != null ? maxLiked + 2 : 100));
      let hist = `**Your grind log:** `;
      for (const e of [...entries].reverse().slice(0, 10)) {
        hist += `#${e.grind}${e.rating === 'like' ? '👍' : '👎'} `;
      }
      hist += `\n\n`;
      if (upperDislike != null && maxLiked != null) {
        const target = Math.round((maxLiked + upperDislike) / 2 * 2) / 2;
        hist += `**Try next: #${target.toFixed(1)}** | Range: **${rangeMin.toFixed(1)} – ${rangeMax.toFixed(1)}**`;
      } else if (maxLiked != null) {
        hist += `Try going finer. Range: **${rangeMin.toFixed(1)} – ${rangeMax.toFixed(1)}**`;
      } else {
        hist += `Tell me a grind you tried and I can recommend a range.`;
      }
      return { reply: hist, newState: state };
    }

    // User said a number but no rating
    if (grindNums.length > 0) {
      return {
        reply: `How was #${grindNums[0]}? Like it or dislike it?`,
        newState: state
      };
    }

    return {
      reply: `Tell me a grind you tried and how it was (e.g. "**15 liked**" or "**17 was bitter**").\n\nOr say **history**, **reset**, or **happy with #X**.`,
      newState: state
    };
  }

  // ── MODE: ec ──
  if (state.mode === 'ec') {
    const ecNum = (() => {
      const m = text.match(/(\d{1,2}(?:\.\d)?)\s*(?:µS|uS|mS|ms|μS)?/);
      if (m) { const v = parseFloat(m[1]); if (v >= 5 && v <= 50) return v; }
      const m2 = text.match(/EC[:\s]*(\d{1,2}(?:\.\d)?)/i);
      if (m2) { const v = parseFloat(m2[1]); if (v >= 5 && v <= 50) return v; }
      return null;
    })();
    const ratioNum = (() => {
      const m = text.match(/(?:1:)?(\d{2}(?:\.\d+)?)\b/);
      if (m) return parseFloat(m[1]);
      return null;
    })();

    // Step 0: accept EC reading and analyze
    if (ecNum && ecNum >= 5 && ecNum <= 50) {
      let ecStatus, bedState, risk, advice;

      if (ecNum <= 15) {
        ecStatus = '🔴 Critical — very low EC';
        bedState = '**Total bed collapse.** The coffee bed has lost structural integrity. Water is channeling through or pooling on top without extracting properly.';
        risk = 'High risk of **hollow, thin, sour** or **astringent** taste. Prolonged low EC = bad taste that persists.';
        advice = 'Go **coarser** 3-5 clicks to reduce fines migration. Lower pour height (4-6cm). Use center-pulse pattern to reduce agitation. Check your water distribution — are you pouring evenly?';
      } else if (ecNum <= 20) {
        ecStatus = '🟠 Low — partial bed deformation';
        bedState = '**Partial bed collapse.** Some channels have formed. Parts of the bed are extracting normally while others stall.';
        risk = 'Moderate risk of **inconsistent flavor** — some sips taste good, others bitter or hollow.';
        advice = 'Check your grind distribution. Try **2 clicks coarser** and reduce pour turbulence. Pour in a tight spiral at 5-7cm height.';
      } else if (ecNum <= 25) {
        ecStatus = '🟡 Moderate — bed breaking down';
        bedState = '**Bed is breaking down but still extracting.** Some unevenness in flow. Fines migration may be starting to clog pores.';
        risk = 'Risk of **astringency and bitterness** from over-extracted pockets. Mouthfeel may be unbalanced.';
        advice = 'Slight adjustment — try **1 click coarser** or reduce your pour count. Keep pour height moderate (5-8cm).';
      } else {
        ecStatus = '🟢 Good — healthy extraction';
        bedState = '**Bed is holding together well.** Even flow, proper dissolution, EC rising steadily through the brew.';
        risk = 'Low risk. You\'re in a good zone.';
        advice = 'Keep doing what you\'re doing! If you want to experiment, try adjusting grind 1 click at a time and compare.';
      }

      let reply = `╔══ EC Analysis ══╗\n\n`;
      reply += `EC: **${ecNum}**\n`;
      reply += `Status: ${ecStatus}\n\n`;
      reply += `**Bed state:** ${bedState}\n\n`;
      reply += `**Risk:** ${risk}\n\n`;
      reply += `**Advice:** ${advice}\n\n`;

      if (ratioNum && ratioNum >= 5) {
        reply += `Your ratio is **1:${ratioNum}**. `;
        if (ecNum <= 15 && ratioNum > 16) {
          reply += `That's a loose ratio — combined with low EC it suggests water is running through too fast. Try tightening to 1:14-1:15.`;
        } else if (ecNum <= 15 && ratioNum <= 14) {
          reply += `A tight ratio — which normally extracts well, so low EC suggests a bed issue specifically. Focus on grind and pour technique.`;
        } else if (ecNum >= 25) {
          reply += `That's working well with your EC. Good combo.`;
        }
      }

      reply += `\n\n**Particle expansion note:** Coffee grounds swell 2-3x when they hit hot water. This makes the bed denser over time. If the particle size distribution has too many fines, they clog the pores -> bed collapses -> EC drops. If it\'s too uniform (all same size), water flows through too fast -> EC stays low.\n\n`;
      reply += `Type **menu** for other tools, or give me another EC reading. 💕`;

      return { reply, newState: { mode: 'ec', step: 0, data: {} } };
    }

    // State
    if (matchKeyword(text, ['state', 'progress', 'visual'])) {
      let s = 'Think of the brew bed like a **sponge structure**:\n\n';
      s += '- Low EC (<=15) = sponge collapsed, water runs around it\n';
      s += '- Mid EC (16-20) = sponge partially crushed, some channels\n';
      s += '- High EC (>25) = sponge holding shape, water flows through evenly\n\n';
      s += 'Each pour adds more turbulence. If the bed is too fine or too agitated, it collapses mid-brew. Good EC = the bed survived all your pours.';
      return { reply: s, newState: state };
    }

    if (matchKeyword(text, ['why', 'explain', 'science', 'how'])) {
      let w = `**Why EC drops:**\n\n1. **Particle swelling** — 2-3x volume increase -> pores close up\n2. **Fines migration** — tiny particles drift down -> clog bottom pores\n3. **Bed fracture** — pressure builds, bed cracks -> water channels\n\nOnce a channel forms, water follows that path every time -> rest of the bed is untouched -> EC stays low because most grounds aren\'t being extracted.\n\n**Why it matters:** EC is the only real-time window into whether your extraction is even or not. TDS tells you the total, but EC tells you how it happened.`;
      return { reply: w, newState: state };
    }

    if (matchKeyword(text, ['fix', 'improve', 'help', 'save'])) {
      let fix = '**To fix low EC / bed collapse:**\n\n';
      fix += '1. **Go coarser** - fewer fines = less clogging = bed stays open longer\n';
      fix += '2. **Lower pour height** - 4-6cm instead of 10-15cm = less turbulence\n';
      fix += '3. **Softer pour** - use a wider spout or pour slowly\n';
      fix += '4. **Pre-wet filter** thoroughly - eliminates air pockets\n';
      fix += '5. **Check water distribution** - pour in even circles, not one spot\n\n';
      fix += 'Best quick fix: coarser grind + lower pour. That fixes most EC issues.';
      return { reply: fix, newState: state };
    }

    let ecPrompt = 'Tell me your EC reading (your scale 15-30) — like "18" or "my EC was 22" — and I\'ll analyze what it means for your bed and taste. Or ask about **why**, **fix**, or **state**.';
    return { reply: ecPrompt, newState: state };
  }

  // ── Cut Mode ───────────────────────────────────────────────
  if (state.mode === 'cut') {
    return {
      reply: `**Cut Time Assist**

Open the **Bed Health** section below the digitizer. The report table shows:

• **Decline ↓** — first sign extraction is slowing. Sweet spot ending.
• **Collapse ↓** — bed losing structure. Cut before this for clean flavor.
• **Cut @ RL** — EC hits your red light line. Hard deadline.
• **Lowest** — minimum EC after peak. Useful benchmark for fast brews.

There's also a **Cut at time** input: type your target brew time (e.g. 1:20) and it shows the EC + phase at that moment.

Type **check cut** from anywhere to see this again. Type **menu** for other tools.`,
      newState: state
    };
  }

  // Fallback
  return {
    reply: `Type **menu** to see available modes: symptom, grinder, turbulence, bean, recipe, tds, dial, ec, cut.`,
    newState: { mode: 'menu', step: 0, data: {} }
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
  const [diagnostic, setDiagnostic] = useState<DiagnosticState>({ mode: 'menu', step: 0, data: {} });
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
        content: chatMode === 'local'
          ? `Hey babe 💕 I'm your brew assistant in **local mode**. Type a mode name to start:

• **symptom** — Diagnose hollow, bitter, sour, etc.
• **grinder** — Grind size recommendations
• **turbulence** — Pour technique & flow advice
• **bean** — Process-specific brewing guide
• **recipe** — Generate a new brew recipe
• **ec** — EC & bed collapse analysis

Or just describe what you're tasting.`
          : "Hey babe. 💕 I'm your brew assistant. Tell me what you're working on — dose, ratio, grind, how it's tasting — and I'll help you dial it in. Or just ask me anything about your brew."
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

    // Global reset commands — go back to the very first welcome message
    if (matchKeyword(text, ['exit', 'quit', 'im done', "i'm done", 'done for now', 'back to start', 'start over', 'restart'])) {
      setMessages([]);
      setDiagnostic({ mode: 'menu', step: 0, data: {} });
      return;
    }

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
            : 'bg-white dark:bg-slate-800 dark:bg-slate-800 border-sky-300 text-sky-700 hover:bg-sky-50 hover:shadow-xl hover:scale-105'
        }`}
        title="Brew Chat — ask about your brew"
      >
        {open ? <X className="w-4 h-4" /> : <Bot className="w-5 h-5" />}
        {!open && <span className="hidden sm:inline">Brew Chat</span>}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-sky-50">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-sky-600" />
              <span className="text-sm font-bold text-slate-800 dark:text-white">Brew Chat</span>
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
                    if (chatMode === 'local') {
                      setDiagnostic({ mode: 'menu', step: 0, data: { importedContext: ctx } });
                      setTimeout(() => {
                        setMessages(prev => [...prev, { role: 'assistant', content: `Got your brew data, babe 💕\n\n${ctx}\n\nWhat would you like to do? Try **symptom**, **grinder**, **turbulence**, **bean**, or **recipe** — I'll use your actual numbers.` }]);
                      }, 50);
                    } else {
                      sendToAI(msg, updatedMessages);
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-amber-600 dark:text-amber-400 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 dark:bg-amber-900/20 transition-colors"
                  title="Import current brew data into chat"
                >
                  <span className="text-sm">📊</span>
                </button>
              )}
              <button
                onClick={() => setShowSettings(v => !v)}
                className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-sky-200 text-sky-800' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:bg-slate-700'}`}
                title="API settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-500 dark:text-red-400 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 dark:bg-red-900/20 dark:hover:bg-red-900/20 dark:bg-red-900/20 transition-colors"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20/50 text-xs max-h-[260px] overflow-y-auto space-y-2">
              <label className="block">
                <span className="font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-300">Gemini API Key</span>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="password"
                    value={apiKeyDraft}
                    onChange={e => { setApiKeyDraft(e.target.value); setKeySaved(false); }}
                    placeholder="Paste your API key..."
                    className="flex-1 px-2 py-1.5 text-xs border border-amber-300 rounded-lg bg-white dark:bg-slate-800 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400 leading-relaxed">
                  Get a free key at{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">aistudio.google.com/apikey</a>
                  . No credit card needed.
                </p>
              )}
              <div className="pt-1 border-t border-amber-200 dark:border-amber-800 dark:border-amber-800/50">
                <span className="font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-300">Model</span>
                <div className="mt-1 space-y-1">
                  {MODELS.map(m => (
                    <label key={m.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${modelId === m.id ? 'bg-amber-100 dark:bg-amber-900/30 dark:bg-amber-900/30 text-amber-900' : 'hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 dark:bg-amber-900/20 text-slate-600 dark:text-slate-400 dark:text-slate-400'}`}>
                      <input type="radio" name="model" value={m.id} checked={modelId === m.id} onChange={() => setModelId(m.id)} className="accent-amber-600" />
                      <div>
                        <span className="text-[11px] font-semibold">{m.label}</span>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-amber-200 dark:border-amber-800 dark:border-amber-800/50">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-300">Mode</span>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">{chatMode === 'ai' ? 'AI (Gemini)' : 'Local (no API needed)'}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setChatMode('local'); setDiagnostic({ mode: 'menu', step: 0, data: {} }); }}
                    className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${chatMode === 'local' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500 dark:text-slate-400 dark:text-slate-400'}`}>
                    Local
                  </button>
                  <button onClick={() => setChatMode('ai')}
                    className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${chatMode === 'ai' ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500 dark:text-slate-400 dark:text-slate-400'}`}>
                    AI
                  </button>
                </div>
              </div>
              {chatMode === 'ai' && (
              <div className="flex items-center justify-between pt-1 border-t border-amber-200 dark:border-amber-800 dark:border-amber-800/50">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-300">App Control</span>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500">Let AI change dose, ratio, grind, temp</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={allowControl} onChange={e => setAllowControl(e.target.checked)} className="sr-only peer" />
                  <div className="w-8 h-4.5 bg-slate-300 peer-checked:bg-amber-500 rounded-full peer-checked:after:translate-x-[14px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 dark:bg-slate-800 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all" />
                </label>
              </div>
              )}
              {cmdFeedback && (
                <p className="text-[10px] text-emerald-600 font-semibold text-center">{cmdFeedback}</p>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-white dark:bg-slate-800 dark:bg-slate-800">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 dark:text-slate-500 dark:text-slate-500 text-xs space-y-2">
                <Bot className="w-10 h-10 text-slate-300 dark:text-slate-600 dark:text-slate-600" />
                <p>Ask me anything about your brew.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white rounded-br-md'
                    : 'bg-slate-100 text-slate-800 dark:text-white rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-md bg-slate-100 text-slate-400 dark:text-slate-500 dark:text-slate-500 text-xs flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 dark:border-slate-700 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-800 dark:bg-slate-800">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your brew..."
                rows={2}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 dark:border-slate-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 placeholder:text-slate-400 dark:text-slate-500 dark:text-slate-500"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="p-2.5 rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-1 text-center">{chatMode === 'ai' ? 'Free tier: 1,500 req/day · 4K tokens/response' : 'Local mode — no API needed'}</p>
          </div>
        </div>
      )}
    </>
  );
}
