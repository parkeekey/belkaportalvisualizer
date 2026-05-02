# Red Light Toggle Issue: Problem, Fix, and How To Use

## Context
This project is a Belka Portal EC digitizer used to extract EC curve data from screenshots and export it as structured data (JSON/CSV). The red light marker is intended to indicate the first time point where extraction enters a specific threshold condition.

Condition used:
- time >= configured time threshold
- EC <= configured EC threshold

## Problem Observed
The red light feature appeared unreliable:
- toggling on/off did not consistently update the screenshot overlay
- the custom interactive graph did not always show the red vertical reference line
- users had to recalculate multiple times and still saw inconsistent visuals

## Root Causes
1. Stale render dependencies in the screenshot canvas draw callback:
   - the canvas draw logic depended on red-light state, but hook dependencies did not fully reflect that state in all redraw paths

2. Missing red line drawing logic in the custom graph canvas:
   - red-light status panel existed, but a vertical line was not actually rendered on the graph canvas itself

3. No explicit user toggle control for line visibility:
   - after calculation, there was no clear, dedicated show/hide control for the red-light line

## What Was Implemented
### 1) Screenshot overlay now updates correctly
File:
- src/components/ManualDigitizer.tsx

Changes:
- ensured the screenshot canvas draw callback reacts to red-light state updates
- kept red-line label rendering stable by formatting the displayed time directly in the draw block

Result:
- toggling visibility now immediately reflects on the uploaded screenshot canvas

### 2) Added explicit Red Light visibility toggle
File:
- src/components/ManualDigitizer.tsx

Changes:
- added a checkbox control: "Show Red Light Line"
- this control appears once a red-light time is available

Result:
- users can show/hide the red line without forcing recalculation

### 3) Red vertical line is now rendered in the custom graph
File:
- src/components/InteractiveDataGraph.tsx

Changes:
- implemented dashed vertical red line drawing when enabled
- added a line label with formatted time
- included red-light props in redraw effect dependencies to guarantee re-render

Result:
- custom graph now visually matches screenshot overlay behavior

## How To Use (Current Flow)
1. Upload and calibrate the screenshot.
2. Extract points (manual/auto/generate/fine as needed).
3. Open Red Light controls.
4. Click Recalculate Red Light.
5. Use "Show Red Light Line" to toggle visibility.
6. Verify the red line appears/disappears in both:
   - screenshot canvas
   - interactive graph

## Quick Validation Checklist
- Recalculate produces a red-light time when threshold condition is met
- Toggling visibility updates screenshot immediately
- Toggling visibility updates interactive graph immediately
- Red line label time matches red-light summary time

## Notes
- Build verification passed after the fix (`npm run build`).
- Existing warning about package module type is unrelated to this feature fix.
