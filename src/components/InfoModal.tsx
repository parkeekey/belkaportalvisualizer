

interface InfoModalProps {
  onClose: () => void;
}

export function InfoModal({ onClose }: InfoModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-7 py-5 bg-gradient-to-r from-slate-800 to-slate-700 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">About This App</h2>
            <p className="text-slate-300 text-xs mt-0.5">EC · TDS · Extraction · Coffee Knowledge</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white text-2xl leading-none font-light transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-7 py-6 space-y-8 text-slate-700 text-sm leading-relaxed">

          {/* ── What is EC ── */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              What is EC and Why Is It Used?
            </h3>
            <p>
              <strong>Electrical Conductivity (EC)</strong> measures how well a liquid conducts electricity,
              expressed in <em>milliSiemens per centimetre (mS/cm)</em>. In coffee, dissolved minerals and
              organic compounds — sugars, acids, proteins, oils — all contribute to conductivity.
            </p>
            <p className="mt-2">
              Because pure water conducts almost no electricity and coffee solubles do, EC gives a
              real-time, non-destructive signal of how much material has been extracted from the grounds
              into the brew water. It's fast, repeatable, and requires no reagents — making it ideal for
              continuous in-brew monitoring with a conductivity probe.
            </p>
            <p className="mt-2">
              Temperature affects conductivity, so devices compensate readings to a standard 25 °C
              reference — noted as <strong>EC25</strong> — to make comparisons consistent across brews.
            </p>
          </section>

          {/* ── EC vs TDS ── */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
              How Are EC and TDS Different?
            </h3>
            <p>
              <strong>Total Dissolved Solids (TDS %)</strong> is the percentage by mass of dissolved
              material in the beverage. EC and TDS are related but not identical:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>EC is a raw electrical measurement (mS/cm).</li>
              <li>TDS % is derived from EC using a conversion factor — typically <strong>0.5–0.64</strong> depending on the probe calibration and the SCA refractometer equation.</li>
              <li>A refractometer measures TDS optically (refractive index) and is generally considered more accurate for the final beverage.</li>
              <li>EC probes measure <em>continuously</em> during extraction; refractometers are used on a finished sample.</li>
            </ul>
            <p className="mt-2">
              This app uses EC25 readings as the primary real-time signal and derives TDS/EY from those
              readings. A refractometer anchor can be entered to re-calibrate the calculation against a
              physical measurement.
            </p>
          </section>

          {/* ── What EC can / cannot measure ── */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
              What EC Can — and Cannot — Measure in Coffee
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="font-semibold text-green-800 mb-2">✓ EC Can Measure</p>
                <ul className="space-y-1 text-green-900 text-xs">
                  <li>• Total dissolved solids concentration</li>
                  <li>• Extraction yield (EY %) as a proxy</li>
                  <li>• Rate of extraction over time</li>
                  <li>• Extraction phases (pre-infusion, main, tail)</li>
                  <li>• Relative brew-to-brew consistency</li>
                  <li>• Time windows of high vs. low extraction</li>
                </ul>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="font-semibold text-red-800 mb-2">✗ EC Cannot Measure</p>
                <ul className="space-y-1 text-red-900 text-xs">
                  <li>• Individual compounds (caffeine, chlorogenic acids, lipids…)</li>
                  <li>• Sensory qualities: sweetness, bitterness, acidity, mouthfeel</li>
                  <li>• Ratio of desirable vs. undesirable solubles</li>
                  <li>• Aroma or volatile compounds</li>
                  <li>• Roast-level-specific extraction behaviour</li>
                  <li>• Absolute flavour outcome</li>
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 italic">
              EC is a blunt but powerful instrument. High EC ≠ good coffee; low EC ≠ bad coffee.
              It must always be paired with sensory evaluation.
            </p>
          </section>

          {/* ── How TDS fills the gap ── */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
              How TDS (Refractometer) Fills Some Gaps
            </h3>
            <p>
              A refractometer-based TDS reading gives you the <em>final beverage strength</em> more
              accurately than EC alone, because it measures the optical bending of light through the
              dissolved mass — unaffected by ionic charge or temperature drift.
            </p>
            <p className="mt-2">
              Combined with <strong>dose weight</strong> and <strong>beverage weight</strong> (yield),
              TDS % enables calculation of <strong>Extraction Yield %</strong> — the gold-standard
              metric used by the SCA and World Brewers Cup. This tells you what fraction of the coffee's
              dry mass ended up in the cup.
            </p>
            <p className="mt-2">
              However, even TDS % cannot distinguish <em>which</em> compounds extracted — only that a
              certain mass dissolved. Compound-level analysis requires lab equipment such as
              GC-MS (gas chromatography-mass spectrometry) or HPLC.
            </p>
          </section>

          {/* ── Use Cases ── */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
              How This App Can Help Brewers
            </h3>

            <div className="space-y-4">
              {/* Use case 1 */}
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="font-bold text-slate-800 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold mr-2">1</span>
                  Cut Off the Negative Extraction — Track the Low-EC Tail
                </p>
                <p className="text-xs text-slate-600">
                  As extraction progresses, EC typically rises sharply early then tapers. When EC drops
                  below a threshold — indicated by the <strong className="text-rose-600">red guide line</strong> — the brew is
                  entering the over-extraction tail where harsh, bitter, and astringent compounds
                  dominate. By stopping the pour or diverting the flow at this point, brewers can
                  deliberately exclude the negative fraction and improve cup quality without changing
                  the grind or recipe. This technique is especially powerful for high-extraction
                  pour-over or drip brewing.
                </p>
              </div>

              {/* Use case 2 */}
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="font-bold text-slate-800 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold mr-2">2</span>
                  Log, Detect & Map Extraction Phases with a Sensory Guide
                </p>
                <p className="text-xs text-slate-600">
                  The phase logging system lets you mark distinct brew events — pre-infusion, bloom,
                  first pour, agitation, drain — and overlay them on the EC curve. Over multiple
                  sessions you can build a <strong>sensory map</strong>: which EC range or time window
                  corresponds to the bright acidity phase, the sweet body phase, or the bitter tail.
                  Tasting cuts from different windows and recording impressions alongside the EC data
                  turns each brew into a repeatable experiment, progressively improving your
                  understanding of how your specific coffee, grinder, and method interact.
                </p>
              </div>

              {/* Use case 3 */}
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="font-bold text-slate-800 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-2">3</span>
                  Plan, Adjust & Understand Extraction Behaviour
                </p>
                <p className="text-xs text-slate-600">
                  The Target Assistant lets you set a TDS or EY goal and immediately see which
                  time windows and water-in amounts hit that target for your specific coffee and
                  dose. By comparing brews with different grind sizes, water temperatures, or
                  pour sequences on the same graph, you can see <em>exactly</em> how each variable
                  shifts the EC curve — steeper rise, earlier peak, longer tail. This closes the
                  loop between recipe intention and measurable outcome, making recipe development
                  systematic rather than intuitive.
                </p>
              </div>
            </div>
          </section>

          {/* ── Credits & Disclaimer ── */}
          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-slate-400"></span>
              Credits &amp; Disclaimer
            </h3>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 mb-4">
              <p className="font-semibold mb-1">⚠ Disclaimer</p>
              <p>
                This project is an independent, personal endeavour built out of curiosity and a passion
                for coffee. It has <strong>no affiliation with, endorsement from, or connection to
                Belka Portal, Ultrakoki, or any commercial entity</strong>. Any references to those
                platforms are solely for contextual compatibility (e.g. graph screenshot format).
              </p>
              <p className="mt-2">
                This app is a showcase of coffee knowledge combined with the current wave of AI-assisted
                development — in the hands of a brewer who knows just enough programming and vibes the
                rest. Use it at your own discretion. Results should always be validated with physical
                tasting and calibrated instruments.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="font-bold text-slate-700 mb-2">Creators</p>
                <ul className="space-y-1 text-slate-600">
                  <li>☕ <strong>Blacklistbrewer</strong> — coffee knowledge, concept &amp; direction</li>
                  <li>🗂 <strong>parkeekey</strong> — repository &amp; project owner</li>
                  <li>🤖 <strong>GitHub Copilot</strong> (Claude Sonnet &amp; various AI models) — code generation &amp; implementation</li>
                </ul>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="font-bold text-slate-700 mb-2">Technical Stack</p>
                <ul className="space-y-1 text-slate-600">
                  <li>⚛ React 18 + TypeScript</li>
                  <li>⚡ Vite 4</li>
                  <li>🎨 Tailwind CSS</li>
                  <li>🖼 JSX / TSX components</li>
                  <li>📦 Lucide React icons</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600">
              <p className="font-bold text-slate-700 mb-1">Version Info</p>
              <p>Version 1.0.0 &nbsp;·&nbsp; Built May 2026 &nbsp;·&nbsp; MIT Licence</p>
              <p className="mt-1 text-slate-400">
                "A brewer who can read EC is a brewer who can talk to their coffee."
              </p>
            </div>
          </section>

        </div>

        {/* Footer close */}
        <div className="px-7 py-4 bg-slate-50 rounded-b-2xl border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
