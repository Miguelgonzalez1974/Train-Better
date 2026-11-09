import { useState } from 'react';
import type { AthleteProfile, PersonalRecords, VariantPersonalRecords } from '../../data/athlete/types';
import { Modal } from '../shell/Modal';
import { MARK_LIFTS } from './rexMarks';

const inputClass = 'rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-sm text-white transition-colors focus:border-brand-gold focus:outline-none';

/**
 * Tus marcas (los PR) para corregirlas a mano: los ocho levantamientos y, opcionales, las seis variantes (sumo, push press…). Vive en el
 * Análisis, junto a la gráfica de cada levantamiento; la caja de Rex es la forma rápida de apuntar una («mi back squat es 140»).
 * Una marca de variante vacía hace que el coach use la del levantamiento base.
 */
export function MarksEditor({ profile, onSave, onClose }: { profile: AthleteProfile; onSave: (patch: Pick<AthleteProfile, 'prs' | 'variantPrs'>) => void; onClose: () => void }) {
  const [prs, setPrs] = useState<PersonalRecords>(profile.prs);
  const [variantPrs, setVariantPrs] = useState<VariantPersonalRecords>(profile.variantPrs ?? {});

  const base = MARK_LIFTS.filter((l) => !l.variant);
  const variants = MARK_LIFTS.filter((l) => l.variant);

  return (
    <Modal open onClose={onClose} title="Tus marcas">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ prs, variantPrs });
          onClose();
        }}
      >
        <p className="text-xs text-neutral-500">Tus marcas personales alimentan los pesos que calcula el coach. Si solo has mejorado una, también puedes decírselo a Rex: «mi back squat es 140».</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {base.map((l) => (
            <label key={l.key} className="flex flex-col gap-1 text-xs text-neutral-400">
              {l.label} (kg)
              <input
                type="number"
                min={0}
                step={2.5}
                value={prs[l.key as keyof PersonalRecords]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPrs((prev) => ({ ...prev, [l.key]: Number.isFinite(n) ? n : 0 }));
                }}
                className={inputClass}
              />
            </label>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs text-neutral-500">
            Opcional: rellena solo si tienes una marca propia y distinta a la del levantamiento base. Mientras no pongas un número, el coach no calcula ningún peso a partir de un PR que no le corresponde a ese movimiento.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {variants.map((l) => (
              <label key={l.key} className="flex flex-col gap-1 text-xs text-neutral-400">
                {l.label} (kg)
                <input
                  type="number"
                  min={0}
                  step={2.5}
                  placeholder="—"
                  value={variantPrs[l.key as keyof VariantPersonalRecords] ?? ''}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setVariantPrs((prev) => ({ ...prev, [l.key]: Number.isFinite(n) && n > 0 ? n : undefined }));
                  }}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="self-start rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-black shadow-md shadow-brand-orange/20 transition-all duration-200 hover:bg-brand-orange-dark">
          Guardar marcas
        </button>
      </form>
    </Modal>
  );
}
