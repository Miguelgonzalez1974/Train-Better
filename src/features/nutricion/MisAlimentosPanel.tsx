import { useState } from 'react';
import { Check, Pencil, ScanBarcode, Trash2, X } from 'lucide-react';
import { SectionLabel } from '../shell/SectionLabel';
import { withCustomFood, withEditedCustomFood, withoutCustomFood } from './nutritionData';
import type { NutritionShared } from './shared';
import type { CustomFoodGroup } from '../../data/athlete/types';

const CUSTOM_FOOD_GROUPS: CustomFoodGroup[] = ['Proteína', 'Hidrato', 'Fruta', 'Verdura', 'Bebida', 'Extra'];

/**
 * Mis alimentos: los que no están en el catálogo, dados de alta con su proteína e hidratos por 100 g. Salen al buscar en
 * "Añadir alimento" del diario. El catálogo predefinido se busca desde ahí, no hace falta verlo entero.
 */
export function MisAlimentosPanel({
  shared,
  initialName = '',
  onScan,
}: {
  shared: NutritionShared;
  /** Nombre ya escrito (cuando Rex no conoce un alimento y se da de alta desde ahí). */
  initialName?: string;
  /** Abre el escáner para añadir productos a la biblioteca (uno tras otro, sin apuntarlos en el día). */
  onScan?: () => void;
}) {
  const { prefs, updatePrefs } = shared;
  const [newFood, setNewFood] = useState<{ name: string; p: string; c: string; group: CustomFoodGroup | null }>({ name: initialName, p: '', c: '', group: null });
  const customFoods = prefs.customFoods ?? [];
  /** El alimento que se está corrigiendo: lo escaneado puede traer errores de la base de datos. */
  const [editing, setEditing] = useState<{ id: string; name: string; p: string; c: string } | null>(null);
  const num = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);

  function saveEdit() {
    if (!editing || editing.name.trim() === '') return;
    updatePrefs((pr) => withEditedCustomFood(pr, editing.id, { name: editing.name, proteinPer100: num(editing.p), carbsPer100: num(editing.c) }));
    setEditing(null);
  }

  function saveCustomFood() {
    const name = newFood.name.trim();
    if (!name || !newFood.group) return;
    updatePrefs((p) =>
      withCustomFood(p, {
        id: `custom${Date.now()}`,
        name,
        proteinPer100: Math.max(0, Number(newFood.p) || 0),
        carbsPer100: Math.max(0, Number(newFood.c) || 0),
        group: newFood.group as CustomFoodGroup,
      }),
    );
    setNewFood({ name: '', p: '', c: '', group: null });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-neutral-500">
        Tu biblioteca: lo que no está en el catálogo. Con su proteína e hidratos por 100 g salen al buscar en «Añadir alimento», y lo que escaneas se guarda aquí.
      </p>

      {onScan && (
        <button
          type="button"
          onClick={onScan}
          data-testid="library-scan"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand-border px-4 py-3 text-sm font-semibold text-neutral-100 transition-colors hover:border-brand-gold hover:text-white"
        >
          <ScanBarcode size={18} strokeWidth={2.25} /> Escanear productos para mi biblioteca
        </button>
      )}

      <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.03] p-3.5">
        <input
          type="text"
          value={newFood.name}
          onChange={(e) => setNewFood((f) => ({ ...f, name: e.target.value }))}
          placeholder="Nombre (ej. Batido de proteína casero)"
          aria-label="Nombre del alimento"
          className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-brand-gold focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Proteína /100 g
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={newFood.p}
              onChange={(e) => setNewFood((f) => ({ ...f, p: e.target.value }))}
              placeholder="0"
              className="num rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Hidratos /100 g
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={newFood.c}
              onChange={(e) => setNewFood((f) => ({ ...f, c: e.target.value }))}
              placeholder="0"
              className="num rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_FOOD_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setNewFood((f) => ({ ...f, group: g }))}
              aria-pressed={newFood.group === g}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                newFood.group === g ? 'border-white/40 bg-white/10 text-white' : 'border-brand-border text-neutral-400 hover:text-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={saveCustomFood}
          disabled={!newFood.name.trim() || !newFood.group}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-orange px-3 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Guardar alimento
        </button>
      </div>

      {customFoods.length > 0 && (
        <section>
          <SectionLabel className="mb-2">Tus alimentos</SectionLabel>
          <ul className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] px-4">
            {customFoods.map((f) =>
              editing?.id === f.id ? (
                <li key={f.id} className="flex flex-col gap-2 py-3" data-testid="library-edit">
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
                    aria-label="Nombre del alimento"
                    className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-2 text-sm text-white focus:border-brand-gold focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
                      Proteína /100 g
                      <input type="text" inputMode="decimal" value={editing.p} onChange={(e) => setEditing((s) => (s ? { ...s, p: e.target.value.replace(/[^\d.,]/g, '') } : s))} aria-label="Proteína por 100 gramos" className="num rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none" />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
                      Hidratos /100 g
                      <input type="text" inputMode="decimal" value={editing.c} onChange={(e) => setEditing((s) => (s ? { ...s, c: e.target.value.replace(/[^\d.,]/g, '') } : s))} aria-label="Hidratos por 100 gramos" className="num rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none" />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(null)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-sm font-semibold text-neutral-300">
                      <X size={14} /> Cancelar
                    </button>
                    <button onClick={saveEdit} disabled={editing.name.trim() === ''} className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-brand-orange px-3 py-2 text-sm font-semibold text-black disabled:opacity-40" data-testid="library-edit-save">
                      <Check size={14} strokeWidth={3} /> Guardar cambios
                    </button>
                  </div>
                </li>
              ) : (
                <li key={f.id} className="flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm text-neutral-100">
                      {f.barcode && <ScanBarcode size={13} className="shrink-0 text-brand-gold" aria-label="Escaneado" />}
                      <span className="min-w-0 [overflow-wrap:anywhere]">{f.name}</span>
                    </span>
                    <span className="num block text-[11px] text-neutral-500">
                      {f.group} · {f.proteinPer100} g prot · {f.carbsPer100} g hid. /100 g
                    </span>
                  </span>
                  <button
                    onClick={() => setEditing({ id: f.id, name: f.name, p: String(f.proteinPer100).replace('.', ','), c: String(f.carbsPer100).replace('.', ',') })}
                    aria-label={`Corregir ${f.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => updatePrefs((p) => withoutCustomFood(p, f.id))}
                    aria-label={`Borrar ${f.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-bad/10 hover:text-bad"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
