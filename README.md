# ☕ Coffee EC Digitizer & Extraction Analyser

A brewer-built, AI-assisted web application for digitising EC (Electrical Conductivity) graphs from coffee brewing devices, analysing extraction yield, and planning recipes — all in the browser, with no server required.

> *"A brewer who can read EC is a brewer who can talk to their coffee."*

---

## ⚠️ Disclaimer

This project is an **independent, personal endeavour** built out of curiosity and a passion for coffee.  
It has **no affiliation with, endorsement from, or connection to Belka Portal, Ultrakoki, or any commercial entity**. References to those platforms exist solely for graph screenshot format compatibility.

This app is a showcase of coffee knowledge combined with AI-assisted development — in the hands of a brewer who knows just enough programming and vibes the rest.

---

## 🌐 Live App

**[Launch the app on GitHub Pages](https://parkeekey.github.io/belka-portal-digitizer/)**

---

## 📖 About This App

### What is EC and Why Is It Used?

**Electrical Conductivity (EC)** measures how well a liquid conducts electricity, expressed in milliSiemens per centimetre (mS/cm). In coffee, dissolved minerals and organic compounds — sugars, acids, proteins — all contribute to conductivity.

Because pure water conducts almost no electricity and coffee solubles do, EC gives a real-time, non-destructive signal of how much material has been extracted from the grounds into the brew water. Temperature-compensated to 25 °C (**EC25**) for consistent cross-brew comparison.

### EC vs TDS — What's the Difference?

| | EC | TDS % |
|---|---|---|
| **What it is** | Raw electrical signal (mS/cm) | Mass of dissolved solids as % of beverage weight |
| **How measured** | Conductivity probe — continuous, in-brew | Refractometer — optical, on finished sample |
| **Use** | Real-time extraction tracking | Final beverage strength & EY calculation |
| **Accuracy** | Proxy; affected by ion type and temperature | More accurate for final beverage |

EC and TDS are related via a conversion factor (~0.5–0.64). This app uses EC25 as the primary signal and derives TDS/EY from it. A **refractometer anchor** can be entered to re-calibrate against a physical measurement.

### What EC Can — and Cannot — Measure

| ✅ EC Can Measure | ❌ EC Cannot Measure |
|---|---|
| Total dissolved solids concentration | Individual compounds (caffeine, acids, lipids…) |
| Extraction yield (EY %) as a proxy | Sensory qualities: sweetness, bitterness, acidity |
| Rate of extraction over time | Ratio of desirable vs. undesirable solubles |
| Extraction phases (bloom, main, tail) | Aroma or volatile compounds |
| Relative brew-to-brew consistency | Roast-specific extraction behaviour |

> EC is a blunt but powerful instrument. High EC ≠ good coffee. It must always be paired with sensory evaluation.

### How TDS (Refractometer) Fills Some Gaps

A refractometer-based TDS reading gives the *final beverage strength* more accurately than EC alone, unaffected by ionic charge or temperature drift. Combined with **dose weight** and **beverage yield**, TDS % enables **Extraction Yield %** — the SCA gold standard.

Even so, TDS % cannot identify *which* compounds extracted. That requires GC-MS or HPLC lab equipment.

---

## 🎯 Use Cases

### 1. Cut Off the Negative Extraction — Track the Low-EC Tail

As extraction progresses, EC typically rises sharply then tapers. When EC drops below a threshold — shown by the **red guide line** — the brew enters the over-extraction tail where harsh, bitter, and astringent compounds dominate. Stopping the pour at this point lets brewers deliberately exclude the negative fraction and improve cup quality without changing grind or recipe.

### 2. Log, Detect & Map Extraction Phases with a Sensory Guide

The phase logging system lets you mark distinct brew events — pre-infusion, bloom, first pour, agitation, drain — and overlay them on the EC curve. Over multiple sessions you can build a **sensory map**: which EC range or time window corresponds to bright acidity, sweet body, or bitter tail. Tasting cuts from different windows and recording impressions alongside EC data turns each brew into a repeatable experiment.

### 3. Plan, Adjust & Understand Extraction Behaviour

The **Target Assistant** lets you set a TDS or EY goal and immediately see which time windows and water-in amounts hit that target for your specific coffee and dose. Comparing brews with different grind sizes, temperatures, or pour sequences on the same graph shows *exactly* how each variable shifts the EC curve — making recipe development systematic rather than intuitive.

---

## 🚀 Features

- **EC Graph Digitiser** — Upload a screenshot from Belka Portal or any conductivity graph; place calibration points and auto-detect the EC curve
- **TDS / EY Analysis** — Real-time TDS% and EY% from EC readings; refractometer anchor for calibration
- **Target Assistant** — Set a TDS or EY target; get matching time windows, EC ranges, water-in amounts, and brew ratios
- **Phase Extraction Log** — Mark and colour-code brew phases; per-phase EC stats with custom expected-EC ranges
- **Phase Summary Table** — EC, TDS, EY, water-in, water-in%, brew ratio, duration — per phase and overall
- **Water-in Tracking** — Ultrakoki flow data integration or estimated linear water-in from brew timeline
- **Zoom Controls** — Zoom the analysis graph and summary tables independently
- **Show/Hide Windows** — Collapse individual Target Assistant windows to reduce clutter when targets are close
- **Export** — Download EC data as JSON; take white or transparent background screenshots
- **No server required** — Runs entirely in the browser

---

## 🛠️ Technology Stack

- **React 18** — UI with hooks and functional components
- **TypeScript** — Type-safe throughout
- **Vite 4** — Build tool and dev server
- **Tailwind CSS** — Utility-first styling
- **Lucide React** — Icons
- **HTML5 Canvas** — Custom graph rendering

---

## 👥 Credits

| Role | Credit |
|---|---|
| ☕ Coffee knowledge, concept & direction | **Blacklistbrewer** |
| 🗂 Repository & project owner | **parkeekey** |
| 🤖 Code generation & implementation | **GitHub Copilot** (Claude Sonnet & various AI models) |

---

## 📦 Local Development

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # production build → docs/
```

The `docs/` folder is used for GitHub Pages deployment.

---

## 📄 Licence

MIT — Version 1.0.0 · Built May 2026
- **Lucide React** - Beautiful icon library

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/graph-snapshot-json.git
   cd graph-snapshot-json
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to `http://localhost:5175`

### Build for Production

```bash
npm run build
```

## 📁 Project Structure

```
graph-snapshot-json/
├── src/
│   ├── components/           # React components
│   │   ├── GraphVisualization.tsx    # D3.js graph component
│   │   └── JsonEditor.tsx           # JSON editor component
│   ├── types/               # TypeScript type definitions
│   │   └── graph.ts         # Graph data types
│   ├── utils/               # Utility functions
│   │   └── graphSnapshotToJson.ts  # Core conversion functions
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── .github/workflows/        # GitHub Actions workflows
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite configuration
└── README.md               # This file
```

## 🎯 Usage

### Creating Graph Data

Graph data follows this JSON structure:

```json
{
  "nodes": [
    {
      "id": "node1",
      "label": "Node 1",
      "data": {
        "color": "#3b82f6",
        "size": 1,
        "customProperty": "value"
      }
    }
  ],
  "edges": [
    {
      "source": "node1",
      "target": "node2",
      "weight": 1.5,
      "data": {
        "relationship": "connected"
      }
    }
  ],
  "metadata": {
    "graph_type": "directed",
    "created": "2025-01-01T00:00:00Z"
  }
}
```

### Features

1. **Visualization Mode**: Interactive graph with:
   - Drag-and-drop nodes
   - Zoom and pan
   - Node click to view details
   - Hover effects

2. **JSON Editor Mode**: Real-time editing with:
   - Syntax validation
   - Auto-formatting
   - Error highlighting
   - Character count

3. **Both Mode**: Split screen with visualization and editor side-by-side

4. **File Operations**:
   - Upload JSON files
   - Download current graph data
   - Load sample data

## 🚀 Deployment

### GitHub Pages (Recommended)

1. **Update package.json** with your repository:
   ```json
   "homepage": "https://yourusername.github.io/graph-snapshot-json"
   ```

2. **Enable GitHub Pages** in your repository settings

3. **Push to main branch** - automatic deployment via GitHub Actions

### Manual Deployment

```bash
npm run build
# Deploy the 'dist' folder to your hosting provider
```

## 🔧 Development

### Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run deploy` - Build and deploy to GitHub Pages

### TypeScript Configuration

The project uses strict TypeScript settings for type safety:
- Strict mode enabled
- No implicit any types
- Full type checking

### Component Architecture

- **GraphVisualization**: D3.js-based interactive graph component
- **JsonEditor**: Real-time JSON editor with validation
- **App**: Main application with state management and layout

## 📱 Mobile Usage Tips

1. **Touch Gestures**:
   - Single tap to select nodes
   - Drag to move nodes
   - Pinch to zoom (on supported devices)

2. **Responsive Design**:
   - Automatically switches to single column on small screens
   - Optimized button sizes for touch
   - Scrolling support for long JSON content

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [D3.js](https://d3js.org/) for powerful data visualization
- [React](https://reactjs.org/) for the UI framework
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Lucide](https://lucide.dev/) for beautiful icons

## 📞 Support

If you have any questions or issues, please:
- Open an issue on GitHub
- Check the documentation
- Review the sample data for format examples

---

**Built with ❤️ for the graph visualization community**
