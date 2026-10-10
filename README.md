# FreshVision

**Pre-Visual Food Waste Prevention**

> *Don't detect waste. Prevent it before it happens.*

FreshVision is a computer vision and inventory intelligence platform that identifies potentially at-risk food batches and helps users simulate waste-prevention strategies.

Built for Problem Statement 4 — *Predicting the Unseen: Pre-Visual Food Waste Mitigation*.

## Features

- **Inventory dashboard** — produce batches ranked by risk, with quantity, storage age, conditions, consumption rate and status (demo data, clearly labelled).
- **Image inspection** — upload a produce photo; colour-distribution, discoloration and texture features are extracted locally in the browser and shown as an annotated overlay. Optional MobileNet (TensorFlow.js) identifies the produce type only.
- **Explainable risk engine** — transparent weighted scoring of storage age, temperature and humidity deviation, demand shortfall and visual indicators, with per-factor contributions and configurable weights. The visual score is kept separate from the overall inventory-risk score.
- **Counterfactual simulator** — compare a baseline plan with interventions (menu prioritisation, storage correction, redistribution) and see the change in projected quantity at risk.
- **Actionable recommendations** — prioritised, rule-based actions. Food-safety holds always override scores; held stock is never recommended for use.

All scores are heuristic estimates and all scenarios are model outputs — not validated forecasts, measured waste avoided, or food-safety determinations.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5180

## Production build

```bash
npm run build
npx vite preview --port 4180
```

## Deploy (Vercel)

Static frontend, no backend or API keys. `vercel.json` sets framework `vite`, install `npm ci`, build `npm run build`, output `dist`.

```bash
npx vercel
```

## Tech

React 18 · Vite 5 · TypeScript · Canvas 2D image processing · TensorFlow.js MobileNet (lazy-loaded, optional)

## Limitations

- Risk weights, Q10 ageing factor and shelf lives are uncalibrated assumptions.
- Image heuristics can be affected by shadows, glare, packaging and naturally multi-coloured produce.
- MobileNet weights download from tfhub.dev on first use (internet required).
- State is in-memory; reloading resets to the demo inventory.
