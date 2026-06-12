/**
 * Bulk dark mode class injector.
 * Adds `dark:` Tailwind variants to common light-mode classes in .tsx files.
 *
 * Usage: node scripts/add-dark-mode.js <file1> [<file2> ...]
 *
 * Mapping rules (heuristic — always review after running):
 *   bg-white              -> dark:bg-slate-800
 *   bg-gray-50            -> dark:bg-gray-950
 *   bg-slate-50           -> dark:bg-slate-900/50
 *   bg-emerald-50         -> dark:bg-emerald-900/20
 *   bg-amber-50           -> dark:bg-amber-900/20
 *   bg-red-50             -> dark:bg-red-900/20
 *   text-slate-700        -> dark:text-slate-300
 *   text-slate-600        -> dark:text-slate-400
 *   text-slate-500        -> dark:text-slate-400
 *   text-slate-400        -> dark:text-slate-500
 *   text-slate-300        -> dark:text-slate-600
 *   text-gray-800         -> dark:text-slate-200
 *   text-gray-600         -> dark:text-slate-400
 *   border-slate-200      -> dark:border-slate-700
 *   border-slate-300      -> dark:border-slate-600
 *   border-slate-100      -> dark:border-slate-700
 *   border-gray-200       -> dark:border-gray-700
 *   border-emerald-200    -> dark:border-emerald-800
 *   border-emerald-300    -> dark:border-emerald-700
 *   border-amber-200      -> dark:border-amber-800
 *   hover:bg-slate-100    -> dark:hover:bg-slate-700
 *   hover:bg-slate-50     -> dark:hover:bg-slate-800
 *   hover:bg-gray-50      -> dark:hover:bg-gray-800
 *   hover:bg-emerald-50   -> dark:hover:bg-emerald-900/20
 *   hover:bg-amber-50     -> dark:hover:bg-amber-900/30
 *   hover:bg-red-50       -> dark:hover:bg-red-900/20
 *   bg-emerald-100        -> dark:bg-emerald-900/30
 *   bg-amber-100          -> dark:bg-amber-900/30
 */

const fs = require('fs');
const path = require('path');

// (?!\w) at end prevents matching partial class names (e.g. bg-emerald-50 inside bg-emerald-500)
const MAPPINGS = [
  // Backgrounds (order matters — more specific first)
  { from: /(?<!dark:)(?<!\w)bg-white(?!\S*?dark:)(?!\w)/g, to: 'bg-white dark:bg-slate-800' },
  { from: /(?<!dark:)(?<!\w)bg-gray-50(?!\S*?dark:)(?!\w)/g, to: 'bg-gray-50 dark:bg-gray-950' },
  { from: /(?<!dark:)(?<!\w)bg-slate-50(?!\S*?dark:)(?!\w)/g, to: 'bg-slate-50 dark:bg-slate-900/50' },
  { from: /(?<!dark:)(?<!\w)bg-emerald-50(?!\S*?dark:)(?!\w)/g, to: 'bg-emerald-50 dark:bg-emerald-900/20' },
  { from: /(?<!dark:)(?<!\w)bg-amber-50(?!\S*?dark:)(?!\w)/g, to: 'bg-amber-50 dark:bg-amber-900/20' },
  { from: /(?<!dark:)(?<!\w)bg-red-50(?!\S*?dark:)(?!\w)/g, to: 'bg-red-50 dark:bg-red-900/20' },
  { from: /(?<!dark:)(?<!\w)bg-emerald-100(?!\S*?dark:)(?!\w)/g, to: 'bg-emerald-100 dark:bg-emerald-900/30' },
  { from: /(?<!dark:)(?<!\w)bg-amber-100(?!\S*?dark:)(?!\w)/g, to: 'bg-amber-100 dark:bg-amber-900/30' },

  // Text colors (dark headers → white)
  { from: /(?<!dark:)(?<!\w)text-slate-800(?!\S*?dark:)(?!\w)/g, to: 'text-slate-800 dark:text-white' },
  { from: /(?<!dark:)(?<!\w)text-slate-900(?!\S*?dark:)(?!\w)/g, to: 'text-slate-900 dark:text-white' },
  { from: /(?<!dark:)(?<!\w)text-gray-800(?!\S*?dark:)(?!\w)/g, to: 'text-gray-800 dark:text-white' },
  { from: /(?<!dark:)(?<!\w)text-gray-900(?!\S*?dark:)(?!\w)/g, to: 'text-gray-900 dark:text-white' },
  // Text colors (dark body → lighter slate)
  { from: /(?<!dark:)(?<!\w)text-slate-700(?!\S*?dark:)(?!\w)/g, to: 'text-slate-700 dark:text-slate-300' },
  { from: /(?<!dark:)(?<!\w)text-slate-600(?!\S*?dark:)(?!\w)/g, to: 'text-slate-600 dark:text-slate-400' },
  { from: /(?<!dark:)(?<!\w)text-slate-500(?!\S*?dark:)(?!\w)/g, to: 'text-slate-500 dark:text-slate-400' },
  { from: /(?<!dark:)(?<!\w)text-slate-400(?!\S*?dark:)(?!\w)/g, to: 'text-slate-400 dark:text-slate-500' },
  { from: /(?<!dark:)(?<!\w)text-slate-300(?!\S*?dark:)(?!\w)/g, to: 'text-slate-300 dark:text-slate-600' },
  { from: /(?<!dark:)(?<!\w)text-gray-600(?!\S*?dark:)(?!\w)/g, to: 'text-gray-600 dark:text-slate-400' },
  { from: /(?<!dark:)(?<!\w)text-gray-700(?!\S*?dark:)(?!\w)/g, to: 'text-gray-700 dark:text-slate-300' },

  // Border colors
  { from: /(?<!dark:)(?<!\w)border-slate-200(?!\S*?dark:)(?!\w)/g, to: 'border-slate-200 dark:border-slate-700' },
  { from: /(?<!dark:)(?<!\w)border-slate-300(?!\S*?dark:)(?!\w)/g, to: 'border-slate-300 dark:border-slate-600' },
  { from: /(?<!dark:)(?<!\w)border-slate-100(?!\S*?dark:)(?!\w)/g, to: 'border-slate-100 dark:border-slate-700' },
  { from: /(?<!dark:)(?<!\w)border-gray-200(?!\S*?dark:)(?!\w)/g, to: 'border-gray-200 dark:border-gray-700' },
  { from: /(?<!dark:)(?<!\w)border-emerald-200(?!\S*?dark:)(?!\w)/g, to: 'border-emerald-200 dark:border-emerald-800' },
  { from: /(?<!dark:)(?<!\w)border-emerald-300(?!\S*?dark:)(?!\w)/g, to: 'border-emerald-300 dark:border-emerald-700' },
  { from: /(?<!dark:)(?<!\w)border-amber-200(?!\S*?dark:)(?!\w)/g, to: 'border-amber-200 dark:border-amber-800' },

  // Hover states
  { from: /(?<!dark:)(?<!\w)hover:bg-slate-100(?!\S*?dark:)(?!\w)/g, to: 'hover:bg-slate-100 dark:hover:bg-slate-700' },
  { from: /(?<!dark:)(?<!\w)hover:bg-slate-50(?!\S*?dark:)(?!\w)/g, to: 'hover:bg-slate-50 dark:hover:bg-slate-800' },
  { from: /(?<!dark:)(?<!\w)hover:bg-gray-50(?!\S*?dark:)(?!\w)/g, to: 'hover:bg-gray-50 dark:hover:bg-gray-800' },
  { from: /(?<!dark:)(?<!\w)hover:bg-emerald-50(?!\S*?dark:)(?!\w)/g, to: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20' },
  { from: /(?<!dark:)(?<!\w)hover:bg-amber-50(?!\S*?dark:)(?!\w)/g, to: 'hover:bg-amber-50 dark:hover:bg-amber-900/30' },
  { from: /(?<!dark:)(?<!\w)hover:bg-red-50(?!\S*?dark:)(?!\w)/g, to: 'hover:bg-red-50 dark:hover:bg-red-900/20' },

  // Text colors with emerald/amber/red/green
  { from: /(?<!dark:)(?<!\w)text-emerald-700(?!\S*?dark:)(?!\w)/g, to: 'text-emerald-700 dark:text-emerald-400' },
  { from: /(?<!dark:)(?<!\w)text-emerald-800(?!\S*?dark:)(?!\w)/g, to: 'text-emerald-800 dark:text-emerald-200' },
  { from: /(?<!dark:)(?<!\w)text-amber-800(?!\S*?dark:)(?!\w)/g, to: 'text-amber-800 dark:text-amber-200' },
  { from: /(?<!dark:)(?<!\w)text-amber-600(?!\S*?dark:)(?!\w)/g, to: 'text-amber-600 dark:text-amber-400' },
  { from: /(?<!dark:)(?<!\w)text-green-600(?!\S*?dark:)(?!\w)/g, to: 'text-green-600 dark:text-green-400' },
  { from: /(?<!dark:)(?<!\w)text-red-500(?!\S*?dark:)(?!\w)/g, to: 'text-red-500 dark:text-red-400' },

  // Divide colors
  { from: /(?<!dark:)(?<!\w)divide-slate-200(?!\S*?dark:)(?!\w)/g, to: 'divide-slate-200 dark:divide-slate-700' },
];

function addDarkMode(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  let totalChanges = 0;

  for (const { from, to } of MAPPINGS) {
    const before = content;
    content = content.replace(from, to);
    const changes = (content.match(new RegExp(to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length -
                    (original.match(new RegExp(to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    totalChanges += Math.abs(changes);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${path.basename(filePath)} — ${totalChanges} changes`);
    return true;
  }
  console.log(`⏭️  ${path.basename(filePath)} — no changes`);
  return false;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/add-dark-mode.js <file1.tsx> [<file2.tsx> ...]');
  process.exit(1);
}

let changed = 0;
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.warn(`⚠️  Skipping — not found: ${f}`);
    continue;
  }
  if (addDarkMode(f)) changed++;
}

console.log(`\nDone — ${changed}/${files.length} files modified. Review before committing.`);
