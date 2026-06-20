# NSR Window Catalog

A unified web app for **New Standard Restoration LLC** that brings the Catalog,
Estimator, and Projects into one consistent product — anchored by a combined
Dashboard (pipeline stats, clients, and recent activity in one view).

Built with React + Vite + TypeScript + Tailwind CSS. All data is seeded and
persisted in the browser (`localStorage`), so the app runs with no backend.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build
npm run preview  # preview the production build
```

## What's inside

The app is organized around one shell and a shared theme:

- **Unified shell & nav** — a single persistent top bar (logo · Dashboard /
  Catalog / Estimator / Projects · company name) on every page, with the
  active tab highlighted. (`src/components/TopNav.tsx`)
- **One theme** — NSR blue primary, dark-slate headers/nav, light-slate page
  bodies, white cards, one button style, one status-badge style, larger base
  type. (`tailwind.config.js`, `src/index.css`)
- **Centered max-width layout** (~1200px) so pages use the available width.
  (`src/components/Container.tsx`)

### Pages

| Page | File | Highlights |
| --- | --- | --- |
| Dashboard | `src/pages/Dashboard.tsx` | Combined home: deduped pipeline/client stats, full client list (search + filter, Profile, New Estimate, New Client), and recent activity. |
| Catalog | `src/pages/Catalog.tsx` | Brand cards, full-width price comparison & energy-performance tables. |
| Estimator | `src/pages/Estimator.tsx` | Wide product builder, collapsible "Add items with AI" tools, centered Window Schedule with empty state, live Estimate Summary. |
| Projects | `src/pages/Projects.tsx` | Pipeline (Draft → Sent → Pending → Won → Lost) driven by each estimate's real status. |
| Client profile | `src/pages/ClientProfile.tsx` | Contact, estimates, "New Estimate" pre-filled from the client (`/clients/:id`; legacy `/crm/:id` redirects here). |

### Cross-linking & data hygiene

- New estimates are auto-named `{Client} — {Address} — {Date}` (never "Untitled").
- "New Estimate" from a client opens the Estimator pre-filled with that client.
- Setting an estimate to **Won** rolls its value into the Dashboard **Won Revenue**.
- The Projects pipeline reflects the real status set on each estimate.

State lives in `src/data/store.tsx`; seed data in `src/data/seed.ts`; the window
product catalog in `src/data/catalog.ts`.
