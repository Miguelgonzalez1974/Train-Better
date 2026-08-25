import { Trophy } from 'lucide-react';
import type { PersonalRecords } from '../../data/athlete/types';

/** Orden deliberado: fila 1 los grandes basicos, fila 2 press estricto + los 3 de halterofilia — no alfabetico, se lee como un atleta agruparia sus propios numeros. */
const PR_ROWS: { key: keyof PersonalRecords; label: string }[] = [
  { key: 'backSquat', label: 'Back Squat' },
  { key: 'frontSquat', label: 'Front Squat' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'benchPress', label: 'Bench Press' },
  { key: 'strictPress', label: 'Strict Press' },
  { key: 'snatch', label: 'Snatch' },
  { key: 'clean', label: 'Clean' },
  { key: 'cleanAndJerk', label: 'C&J' },
];

/** Tarjeta compacta de los 8 PRs raiz del atleta — antes no habia ni una cifra de 1RM visible en el Dashboard pese a ser el dato mas central para el resto del motor. */
export function PersonalRecordsCard({ prs }: { prs: PersonalRecords }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold/15 text-brand-gold">
          <Trophy size={14} strokeWidth={2.25} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-white">Tus PRs</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PR_ROWS.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center gap-0.5 rounded-lg bg-brand-surfaceMuted/80 px-1 py-2 text-center">
            <span className="text-[15px] font-bold leading-none text-white">{prs[key]}</span>
            <span className="text-[9px] text-neutral-500">kg</span>
            <span className="mt-0.5 text-[9px] leading-tight text-neutral-400">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
