# Deployment Guide

## Quick Deployment Options

### 1. GitHub Pages (Recommended)

**Step 1: Create Repository**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/graph-snapshot-json.git
git push -u origin main
```

**Step 2: Update package.json**
Replace the homepage field with your actual repository URL:
```json
{
  "homepage": "https://yourusername.github.io/graph-snapshot-json"
}
```

**Step 3: Enable GitHub Pages**
- Go to your repository on GitHub
- Navigate to Settings → Pages
- Source: Deploy from a branch
- Branch: main / (root)
- Click Save

**Step 4: Automatic Deployment**
The GitHub Actions workflow will automatically deploy when you push to main branch.

### 2. Netlify

**Step 1: Build**
```bash
npm run build
```

**Step 2: Deploy**
- Drag and drop the `dist` folder to Netlify
- Or connect your GitHub repository for automatic deployment

### 3. Vercel

**Step 1: Install Vercel CLI**
```bash
npm i -g vercel
```

**Step 2: Deploy**
```bash
vercel --prod
```

### 4. Manual Deployment

**Step 1: Build**
```bash
npm run build
```

**Step 2: Upload**
Upload the contents of the `dist` folder to your web server.

## Environment Variables

No environment variables are required for basic functionality.

## Performance Optimization

The application is optimized for:
- **Mobile devices**: Touch interactions and responsive design
- **Fast loading**: Minimal bundle size (~22KB gzipped)
- **PWA support**: Can be installed as a mobile app
- **SEO**: Proper meta tags and semantic HTML

## Testing

Before deploying, test:
1. **Build process**: `npm run build` should complete without errors
2. **Local preview**: `npm run preview` to test production build locally
3. **Mobile testing**: Test on actual mobile devices or browser dev tools
4. **File operations**: Test upload/download functionality

## Troubleshooting

### Build Issues
- Clear node_modules: `rm -rf node_modules && npm install`
- Check Node.js version: `node --version` (requires 18+)

### Deployment Issues
- Ensure `base` is set correctly in `vite.config.ts`
- Check GitHub Pages settings are enabled
- Verify repository URL in package.json homepage field

### Mobile Issues
- Test with browser dev tools mobile simulation
- Check touch interactions work properly
- Verify responsive layout on different screen sizes

## Customization

### Branding
- Update colors in `src/index.css`
- Replace favicon in `public/favicon.svg`
- Update app name in `public/manifest.json`

### Features
- Add new graph types in `src/types/graph.ts`
- Extend visualization in `src/components/GraphVisualization.tsx`
- Add new export formats in `src/utils/graphSnapshotToJson.ts`

## Support

For deployment issues:
1. Check the build logs
2. Verify all dependencies are installed
3. Test locally first
4. Check hosting provider documentation

---

**Ready for production deployment! 🚀**
