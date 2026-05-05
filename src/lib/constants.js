export const MODULE_ID = 'herramientas_admin'
export const ITEMS_PER_PAGE = 15
export const STOCK_HIGH_THRESHOLD = 2000
export const AUTO_FOCUS_DELAY = 50

export const MODULES = [
  {
    id: 'zab',
    name: 'ZAB Generator',
    icon: 'Barcode',
    path: '/zab',
    description: 'Generador de códigos ZAB'
  },
  {
    id: 'checadores',
    name: 'Checadores',
    icon: 'MonitorCheck',
    path: '/checadores',
    description: 'Monitoreo de checadores en red'
  }
]