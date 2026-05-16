/** Terminal / hub types shown on the map layer */
export const TERMINAL_TYPES = ['bus', 'jeepney', 'e_jeepney', 'tricycle', 'train'] as const;
export type TerminalType = (typeof TERMINAL_TYPES)[number];

export const TERMINAL_TYPE_META: Record<
  TerminalType,
  { label: string; color: string; markerColor: string }
> = {
  bus: { label: 'Bus terminal', color: '#1d4ed8', markerColor: 'blue' },
  jeepney: { label: 'Jeepney terminal', color: '#ea580c', markerColor: 'orange' },
  e_jeepney: { label: 'E-jeepney hub', color: '#16a34a', markerColor: 'green' },
  tricycle: { label: 'Tricycle terminal', color: '#7c3aed', markerColor: 'violet' },
  train: { label: 'Train station', color: '#dc2626', markerColor: 'red' },
};

export const DEFAULT_TERMINAL_FILTERS: Record<TerminalType, boolean> = {
  bus: true,
  jeepney: true,
  e_jeepney: true,
  tricycle: true,
  train: true,
};

/** Map spreadsheet / legacy DB values to terminal types */
export function mapSpreadsheetTransportMode(mode: string): TerminalType | null {
  const s = mode.toLowerCase().trim();
  if (/train|rail|mrt|lrt/.test(s)) return 'train';
  if (/e[-\s]?jeep|modern\s*jeep/.test(s)) return 'e_jeepney';
  if (/jeepney|jeep/.test(s)) return 'jeepney';
  if (/tricycle|trike/.test(s)) return 'tricycle';
  if (/bus|p2p|carousel/.test(s)) return 'bus';
  return null;
}

export function normalizeTerminalType(type: string): TerminalType | null {
  const t = type.toLowerCase().replace(/\s+/g, '_');
  if (TERMINAL_TYPES.includes(t as TerminalType)) return t as TerminalType;
  const fromLabel = mapSpreadsheetTransportMode(type.replace(/_/g, ' '));
  if (fromLabel) return fromLabel;
  if (t === 'station' || t === 'rail' || t === 'mrt' || t === 'lrt') return 'train';
  if (t === 'jeepney_hub' || t === 'jeep') return 'jeepney';
  if (t === 'terminal' || t === 'bus_terminal' || t === 'p2p') return 'bus';
  if (t === 'modern_jeepney' || t === 'ejeep' || t === 'e-jeepney') return 'e_jeepney';
  if (t === 'trike' || t === 'tricycle_hub') return 'tricycle';
  return null;
}
