import { db } from '../db/index.js';
import { bands, type Band } from '../db/schema.js';
import { estimateLoad, type LoadInput } from '../../shared/load.js';

/** Elásticos num mapa por id, prontos para estimar carga. */
export async function loadCatalog() {
  const b = await db.select().from(bands);
  const bandMap = new Map<number, Band>(b.map((x) => [x.id, x]));
  return {
    bands: bandMap,
    estimate: (input: LoadInput) => estimateLoad(input, bandMap),
  };
}

/**
 * Sugestões iniciais. As faixas em kg variam por marca — são só um ponto de
 * partida para editar com os números da embalagem dos seus elásticos.
 */
export const DEFAULT_BANDS: Omit<Band, 'id' | 'createdAt' | 'archived'>[] = [
  { name: 'Amarelo', color: '#facc15', brand: null, minKg: 2, maxKg: 7, notes: null, sortOrder: 0 },
  { name: 'Vermelho', color: '#ef4444', brand: null, minKg: 7, maxKg: 16, notes: null, sortOrder: 1 },
  { name: 'Preto', color: '#52525b', brand: null, minKg: 11, maxKg: 29, notes: null, sortOrder: 2 },
  { name: 'Roxo', color: '#a855f7', brand: null, minKg: 16, maxKg: 39, notes: null, sortOrder: 3 },
  { name: 'Verde', color: '#22c55e', brand: null, minKg: 23, maxKg: 57, notes: null, sortOrder: 4 },
  { name: 'Azul', color: '#3b82f6', brand: null, minKg: 29, maxKg: 79, notes: null, sortOrder: 5 },
];
