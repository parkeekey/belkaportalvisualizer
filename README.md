# Graph Snapshot to JSON

A modern React/TypeScript web application for converting and visualizing graph data structures in JSON format. Perfect for mobile and desktop use, with GitHub Pages deployment support.

## 🚀 Features

- **Interactive Graph Visualization**: D3.js-powered force-directed graph with drag-and-drop nodes
- **JSON Editor**: Real-time JSON editing with validation and formatting
- **Mobile Responsive**: Touch-friendly interface that works perfectly on phones and tablets
- **File Operations**: Upload and download graph data as JSON files
- **Live Preview**: Switch between visualization, JSON editor, or both views simultaneously
- **Sample Data**: Built-in sample graph to explore functionality
- **Node Selection**: Click nodes to view detailed information
- **Modern UI**: Clean, professional interface built with Tailwind CSS

## 📱 Mobile Compatibility

The application is fully responsive and optimized for mobile devices:
- Touch interactions for graph manipulation
- Adaptive layouts for different screen sizes
- Optimized performance for mobile browsers
- PWA-ready for installation on mobile devices

## 🛠️ Technology Stack

- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development with full IntelliSense support
- **Vite** - Fast build tool and development server
- **D3.js** - Powerful data visualization library for graph rendering
- **Tailwind CSS** - Utility-first CSS framework for responsive design
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
