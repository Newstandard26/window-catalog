import type { Client, Estimate } from '../types'

// Sample data so the app looks alive on first load. Persisted to localStorage
// after the first run; clearing storage restores these seeds.

export const SEED_CLIENTS: Client[] = [
  {
    id: 'c-hargrove',
    name: 'Hargrove Residence',
    status: 'Active',
    email: 'dana.hargrove@email.com',
    phone: '(815) 555-0142',
    address: '418 Maple Grove Ln, Rockford, IL',
    createdAt: '2026-05-02T15:00:00.000Z',
  },
  {
    id: 'c-bellamy',
    name: 'Bellamy Property Group',
    status: 'Active',
    email: 'ops@bellamypg.com',
    phone: '(312) 555-0188',
    address: '77 Lakeshore Ct, Evanston, IL',
    createdAt: '2026-04-18T15:00:00.000Z',
  },
  {
    id: 'c-okafor',
    name: 'Okafor Family',
    status: 'Prospect',
    email: 'j.okafor@email.com',
    phone: '(773) 555-0119',
    address: '2210 Birchwood Ave, Chicago, IL',
    createdAt: '2026-06-09T15:00:00.000Z',
  },
  {
    id: 'c-reyes',
    name: 'Reyes Remodel',
    status: 'Prospect',
    email: 'marisol.reyes@email.com',
    phone: '(630) 555-0173',
    address: '95 Oak Hollow Dr, Naperville, IL',
    createdAt: '2026-06-15T15:00:00.000Z',
  },
]

export const SEED_ESTIMATES: Estimate[] = [
  {
    id: 'e-hargrove-1',
    name: 'Hargrove Residence — 418 Maple Grove Ln — May 4, 2026',
    clientId: 'c-hargrove',
    address: '418 Maple Grove Ln, Rockford, IL',
    status: 'Won',
    taxRate: 0.0825,
    createdAt: '2026-05-04T15:00:00.000Z',
    updatedAt: '2026-05-20T15:00:00.000Z',
    items: [
      { id: 'w1', location: 'Living Room', width: 36, height: 60, productId: 'andersen-400', quantity: 2, unitPrice: 1185 },
      { id: 'w2', location: 'Primary Bedroom', width: 30, height: 48, productId: 'andersen-400', quantity: 3, unitPrice: 1185 },
      { id: 'w3', location: 'Kitchen', width: 24, height: 36, productId: 'pella-250', quantity: 1, unitPrice: 845 },
    ],
  },
  {
    id: 'e-bellamy-1',
    name: 'Bellamy Property Group — 77 Lakeshore Ct — Jun 1, 2026',
    clientId: 'c-bellamy',
    address: '77 Lakeshore Ct, Evanston, IL',
    status: 'Pending',
    taxRate: 0.0825,
    createdAt: '2026-06-01T15:00:00.000Z',
    updatedAt: '2026-06-12T15:00:00.000Z',
    items: [
      { id: 'w4', location: 'Unit 2A Front', width: 36, height: 60, productId: 'marvin-elevate', quantity: 4, unitPrice: 1320 },
      { id: 'w5', location: 'Unit 2A Rear', width: 30, height: 48, productId: 'milgard-tuscany', quantity: 6, unitPrice: 760 },
    ],
  },
  {
    id: 'e-okafor-1',
    name: 'Okafor Family — 2210 Birchwood Ave — Jun 11, 2026',
    clientId: 'c-okafor',
    address: '2210 Birchwood Ave, Chicago, IL',
    status: 'Sent',
    taxRate: 0.0825,
    createdAt: '2026-06-11T15:00:00.000Z',
    updatedAt: '2026-06-14T15:00:00.000Z',
    items: [
      { id: 'w6', location: 'Front Bay', width: 48, height: 60, productId: 'simonton-6500', quantity: 1, unitPrice: 615 },
      { id: 'w7', location: 'Bedrooms', width: 30, height: 48, productId: 'simonton-6500', quantity: 4, unitPrice: 615 },
    ],
  },
  {
    id: 'e-reyes-1',
    name: 'Reyes Remodel — 95 Oak Hollow Dr — Jun 16, 2026',
    clientId: 'c-reyes',
    address: '95 Oak Hollow Dr, Naperville, IL',
    status: 'Draft',
    taxRate: 0.0825,
    createdAt: '2026-06-16T15:00:00.000Z',
    updatedAt: '2026-06-16T15:00:00.000Z',
    items: [
      { id: 'w8', location: 'Sunroom', width: 36, height: 72, productId: 'provia-aspect', quantity: 5, unitPrice: 690 },
    ],
  },
]
