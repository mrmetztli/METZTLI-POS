// dashboard-widgets.js — lista de bloques disponibles del Dashboard (nombre y tipo).
// "kpi" = tarjeta de indicador (se agrupan en cuadrícula) · "block" = bloque grande (ancho completo o mitad).
// Los bloques de gastos solo se ven si el módulo Gastos está activo.
export const EXPENSE_WIDGETS = ['periodExpenses', 'periodResult', 'expensesByCategory', 'recentExpenses'];
// Para agregar un bloque nuevo: agrégalo aquí, en DEFAULT_CONFIG.dashboard.widgets (state.js) y en dashboard.js.
export const WIDGET_META = {
  shortcuts: { label: 'Accesos directos', kind: 'block' },
  lowStock: { label: 'Alerta de existencias bajas', kind: 'block' },
  todaySales: { label: 'Ventas de hoy', kind: 'kpi' },
  monthSales: { label: 'Ventas del mes', kind: 'kpi' },
  periodOps: { label: 'Operaciones del periodo', kind: 'kpi' },
  periodAvg: { label: 'Ticket promedio del periodo', kind: 'kpi' },
  periodDiscounts: { label: 'Descuentos del periodo', kind: 'kpi' },
  periodCancelled: { label: 'Ventas canceladas del periodo', kind: 'kpi' },
  periodUnits: { label: 'Unidades vendidas del periodo', kind: 'kpi' },
  periodExpenses: { label: 'Gastos del periodo', kind: 'kpi' },
  periodResult: { label: 'Ventas menos gastos del periodo', kind: 'kpi' },
  chart: { label: 'Gráfica de ventas', kind: 'block' },
  topProducts: { label: 'Más vendidos', kind: 'block' },
  categories: { label: 'Ventas por categoría', kind: 'block' },
  expensesByCategory: { label: 'Gastos por categoría', kind: 'block' },
  recent: { label: 'Últimas ventas', kind: 'block' },
  recentExpenses: { label: 'Últimos gastos', kind: 'block' }
};
export const kindOf = (id) => WIDGET_META[id]?.kind;
export const PERIOD_NAMES = { day: 'Hoy', week: 'Semana', month: 'Mes' };
