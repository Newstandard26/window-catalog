import type { CatalogProduct } from '../types'

// The window product catalog. This page is the visual reference for the rest of
// the app (Phase 2 theme is modeled on it).
export const CATALOG: CatalogProduct[] = [
  {
    id: 'andersen-400',
    brand: 'Andersen',
    series: '400 Series',
    material: 'Wood-Clad',
    tier: 'Best',
    basePrice: 1185,
    uFactor: 0.27,
    shgc: 0.3,
    warranty: '20 yr glass / 10 yr parts',
    highlight: 'Low-E4 SmartSun glass, premium wood interior',
  },
  {
    id: 'pella-250',
    brand: 'Pella',
    series: '250 Series',
    material: 'Vinyl',
    tier: 'Better',
    basePrice: 845,
    uFactor: 0.29,
    shgc: 0.27,
    warranty: '20 yr glass / limited lifetime frame',
    highlight: 'Insulated vinyl frame, dual-pane Low-E',
  },
  {
    id: 'marvin-elevate',
    brand: 'Marvin',
    series: 'Elevate',
    material: 'Fiberglass',
    tier: 'Best',
    basePrice: 1320,
    uFactor: 0.26,
    shgc: 0.28,
    warranty: '20 yr glass / 10 yr components',
    highlight: 'Ultrex fiberglass exterior, wood interior',
  },
  {
    id: 'milgard-tuscany',
    brand: 'Milgard',
    series: 'Tuscany V400',
    material: 'Vinyl',
    tier: 'Better',
    basePrice: 760,
    uFactor: 0.3,
    shgc: 0.25,
    warranty: 'Full lifetime, transferable',
    highlight: 'SmartTouch hardware, positive-action lock',
  },
  {
    id: 'simonton-6500',
    brand: 'Simonton',
    series: 'Reflections 6500',
    material: 'Vinyl',
    tier: 'Good',
    basePrice: 615,
    uFactor: 0.31,
    shgc: 0.26,
    warranty: 'Lifetime limited',
    highlight: 'Budget-friendly, ENERGY STAR rated',
  },
  {
    id: 'provia-aspect',
    brand: 'ProVia',
    series: 'Aspect',
    material: 'Vinyl',
    tier: 'Good',
    basePrice: 690,
    uFactor: 0.3,
    shgc: 0.24,
    warranty: 'Lifetime limited, transferable',
    highlight: 'Foam-insulated frame, strong value tier',
  },
]

export function getProduct(id: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.id === id)
}
