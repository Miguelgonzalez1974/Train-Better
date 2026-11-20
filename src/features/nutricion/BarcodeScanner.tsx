import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Keyboard, Loader2, ScanBarcode, X } from 'lucide-react';
import type { CustomFood, ExtraFoodEntry } from '../../data/athlete/types';
import { customFoodToCatalogFood } from '../../engine/customFoods';
import { groupForProduct, hasValidCheckDigit, macrosForGrams, normalizeBarcode, quickQuantities, type ScannedProduct } from '../../engine/barcodeFood';
import { lookupBarcode } from '../../lib/openFoodFacts';
import { toast } from '../../lib/toast';
import { QuantityStepper } from './QuantityStepper';
import { customFoodByBarcode, withCustomFood, withExtra } from './nutritionData';
import type { NutritionShared } from './shared';

/**
 * Escanear un producto: la cámara lee el código de barras, Open Food Facts da su proteína e hidratos por 100 g y eliges cuánto has comido; al
 * apuntarlo se guarda en «Mis alimentos» con su código y la próxima vez se reconoce sin consultar nada. Lo único que sale de la app es el número
 * del código; la cámara solo se enciende aquí y se apaga al salir. Si el producto no está, se escriben los valores de la etiqueta una vez.
 */

type Stage =
  | { kind: 'camera' }
  | { kind: 'manual' }
  | { kind: 'looking'; code: string }
  | { kind: 'result'; product: ScannedProduct; known: CustomFood | null; manual?: boolean }
  | { kind: 'missing'; code: string; reason: 'notfound' | 'error' };

type CameraProblem = 'denied' | 'unsupported' | 'failed' | null;

type DetectorCtor = new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Enciende la cámara trasera y avisa de cada código leído. Con el lector nativo del navegador si lo hay; si no, con una librería de lectura. */
function useBarcodeCamera(active: boolean, videoRef: React.RefObject<HTMLVideoElement>, onCode: (raw: string) => void, onProblem: (p: Exclude<CameraProblem, null>) => void) {
  const codeRef = useRef(onCode);
  const problemRef = useRef(onProblem);
  codeRef.current = onCode;
  problemRef.current = onProblem;

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      problemRef.current('unsupported');
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let controls: { stop: () => void } | null = null;
    const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };

    (async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
          const tick = async () => {
            if (stopped) return;
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) codeRef.current(found[0].rawValue);
            } catch {
              /* un fotograma sin código: se sigue */
            }
            if (!stopped) timer = window.setTimeout(tick, 200);
          };
          void tick();
        } else {
          // Sin lector nativo (iPhone, Firefox…): la librería se carga solo ahora, no pesa en el resto de la app.
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 200 });
          controls = await reader.decodeFromConstraints(constraints, video, (result) => {
            if (result && !stopped) codeRef.current(result.getText());
          });
          if (stopped) controls.stop();
        }
      } catch (e) {
        if (stopped) return;
        const name = (e as { name?: string })?.name;
        problemRef.current(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unsupported' : 'failed');
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      controls?.stop();
      video.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

const productFromCustom = (f: CustomFood): ScannedProduct => ({
  barcode: f.barcode ?? '',
  name: f.name,
  proteinPer100: f.proteinPer100,
  carbsPer100: f.carbsPer100,
  group: f.group,
  ...(f.packageGrams ? { packageGrams: f.packageGrams } : {}),
  ...(f.servingGrams ? { servingGrams: f.servingGrams } : {}),
});

/** El alimento propio que se guarda de un producto escaneado (con su código, para reconocerlo la próxima vez). */
function toCustomFood(product: ScannedProduct, id: string): CustomFood {
  return {
    id,
    name: product.name,
    proteinPer100: product.proteinPer100,
    carbsPer100: product.carbsPer100,
    group: product.group,
    barcode: product.barcode,
    ...(product.packageGrams ? { packageGrams: product.packageGrams } : {}),
    ...(product.servingGrams ? { servingGrams: product.servingGrams } : {}),
  };
}

/**
 * `diario`: se escanea para apuntar lo que comes (y de paso se guarda en Mis alimentos). `biblioteca`: se escanean los productos que tienes para
 * guardarlos en Mis alimentos, uno tras otro, sin apuntar nada; después se eligen al añadir un alimento.
 */
export function BarcodeScanner({ shared, iso, onClose, mode = 'diario' }: { shared: NutritionShared; iso: string; onClose: () => void; mode?: 'diario' | 'biblioteca' }) {
  const { prefs, updatePrefs, todayIso } = shared;
  const [stage, setStage] = useState<Stage>({ kind: 'camera' });
  const [problem, setProblem] = useState<CameraProblem>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Para ignorar la respuesta de una consulta vieja si ya se pasó a otra cosa. */
  const lookupId = useRef(0);

  async function handleCode(raw: string): Promise<boolean> {
    const code = normalizeBarcode(raw);
    if (!code || !hasValidCheckDigit(code)) return false;
    try {
      navigator.vibrate?.(60);
    } catch {
      /* sin vibración */
    }
    const known = (prefs.customFoods ?? []).find((f) => f.barcode === code) ?? null;
    if (known) {
      setStage({ kind: 'result', product: productFromCustom(known), known });
      return true;
    }
    const id = ++lookupId.current;
    setStage({ kind: 'looking', code });
    const result = await lookupBarcode(code);
    if (id !== lookupId.current) return true;
    if (result.kind === 'found') setStage({ kind: 'result', product: result.product, known: null });
    else setStage({ kind: 'missing', code, reason: result.kind === 'error' ? 'error' : 'notfound' });
    return true;
  }

  useBarcodeCamera(stage.kind === 'camera', videoRef, (raw) => void handleCode(raw), setProblem);

  function backToCamera() {
    lookupId.current++;
    setProblem(null);
    setStage({ kind: 'camera' });
  }

  return (
    <div className="force-dark fixed inset-0 z-50 flex flex-col text-white" style={{ background: '#0a0908' }} data-testid="barcode-scanner" role="dialog" aria-label="Escanear producto">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Cerrar el escáner" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/20">
          <X size={19} />
        </button>
        <p className="text-sm font-semibold text-white/70">{mode === 'biblioteca' ? 'Añadir a mi biblioteca' : 'Escanear producto'}</p>
        <span className="h-10 w-10" aria-hidden="true" />
      </div>

      {stage.kind === 'camera' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-5">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" aria-label="Cámara" />
            {!problem && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[34%] w-[78%] rounded-2xl border-2" style={{ borderColor: '#f97316', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
              </div>
            )}
            {problem && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center" data-testid="barcode-problem">
                <ScanBarcode size={36} className="text-white/60" />
                <p className="text-base font-bold text-white">
                  {problem === 'denied' ? 'La cámara está bloqueada' : problem === 'unsupported' ? 'Este navegador no deja usar la cámara aquí' : 'No he podido encender la cámara'}
                </p>
                <p className="text-sm text-white/60">
                  {problem === 'denied' ? 'Permite el acceso a la cámara en los ajustes del navegador, o escribe el número del código.' : 'Puedes escribir el número que hay bajo el código de barras.'}
                </p>
              </div>
            )}
          </div>
          <p className="text-center text-sm text-white/60">
            {problem ? '' : mode === 'biblioteca' ? 'Escanea cada producto: se guarda en Mis alimentos y sigues con el siguiente' : 'Centra el código de barras dentro del marco'}
          </p>
          <button onClick={() => setStage({ kind: 'manual' })} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-3 text-center text-base font-bold text-white active:bg-white/20" data-testid="barcode-manual">
            <Keyboard size={19} /> Escribir el código a mano
          </button>
        </div>
      )}

      {stage.kind === 'manual' && <ManualCode onBack={backToCamera} onCode={handleCode} />}

      {stage.kind === 'looking' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="barcode-looking">
          <Loader2 size={34} className="animate-spin text-white/70" />
          <p className="text-lg font-bold">Buscando el producto…</p>
          <p className="num text-sm text-white/50">{stage.code}</p>
          <button onClick={backToCamera} className="mt-2 text-sm font-semibold text-white/60 underline decoration-dotted">
            Cancelar
          </button>
        </div>
      )}

      {stage.kind === 'missing' && (
        <MissingForm
          code={stage.code}
          reason={stage.reason}
          onBack={backToCamera}
          onSave={(product) => setStage({ kind: 'result', product, known: null, manual: true })}
        />
      )}

      {stage.kind === 'result' && (
        <ProductResult
          key={stage.product.barcode + stage.product.name}
          product={stage.product}
          known={stage.known}
          manual={stage.manual}
          mode={mode}
          onBack={backToCamera}
          // Solo a la biblioteca: se crea el alimento (con su código) y se vuelve a la cámara para escanear el siguiente, sin tocar el día.
          onSaveOnly={() => {
            const { product } = stage;
            updatePrefs((p) => (customFoodByBarcode(p, product.barcode) ? p : withCustomFood(p, toCustomFood(product, `custom${Date.now()}`))));
            toast.show(`Guardado en Mis alimentos: ${product.name}`);
            backToCamera();
          }}
          onAdd={(grams) => {
            const { product, known } = stage;
            const foodId = known?.id ?? `custom${Date.now()}`;
            const now = new Date();
            const entry: ExtraFoodEntry = { id: `extra${Date.now()}`, hour: iso === todayIso ? now.getHours() + now.getMinutes() / 60 : 12, items: [{ foodId, grams }] };
            updatePrefs((p) => withExtra(known || customFoodByBarcode(p, product.barcode) ? p : withCustomFood(p, toCustomFood(product, foodId)), iso, entry));
            const m = macrosForGrams(product, grams);
            toast.show(`Apuntado: ${product.name} · +${String(m.protein).replace('.', ',')} g proteína · +${String(m.carbs).replace('.', ',')} g hidratos${known ? '' : ' · guardado en Mis alimentos'}`);
            onClose();
          }}
        />
      )}
    </div>
  );
}

/** El número escrito a mano: se comprueba el dígito de control para avisar de un número mal tecleado. */
function ManualCode({ onBack, onCode }: { onBack: () => void; onCode: (raw: string) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    const code = normalizeBarcode(value);
    if (!code) return setError('Faltan números: un código de barras tiene 8 o 13 cifras.');
    if (!hasValidCheckDigit(code)) return setError('Ese código no parece correcto: revisa los números.');
    await onCode(code);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5" data-testid="barcode-manual-form">
      <button onClick={onBack} className="flex items-center gap-1.5 self-start text-sm font-semibold text-white/60">
        <ArrowLeft size={16} /> Volver a la cámara
      </button>
      <div>
        <p className="text-2xl font-extrabold leading-tight">Escribe el código</p>
        <p className="mt-1 text-sm text-white/60">Son los números que hay debajo de las barras.</p>
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value.replace(/\D/g, '').slice(0, 14));
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        aria-label="Código de barras"
        placeholder="8412345678901"
        className="num h-14 w-full rounded-2xl border border-white/15 bg-white/[0.07] px-4 text-center text-2xl font-bold tracking-wider text-white placeholder:text-white/25 focus:border-white/40 focus:outline-none"
      />
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
      <button onClick={() => void submit()} className="mt-auto flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-orange px-4 py-3 text-center text-base font-bold text-black active:scale-[0.98]">
        Buscar producto
      </button>
    </div>
  );
}

/** El producto no está en la base de datos (o no hay conexión): se copian los valores de la etiqueta por 100 g, una sola vez. */
function MissingForm({ code, reason, onBack, onSave }: { code: string; reason: 'notfound' | 'error'; onBack: () => void; onSave: (p: ScannedProduct) => void }) {
  const [name, setName] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const num = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);
  const ready = name.trim() !== '' && (p !== '' || c !== '');
  const field = 'num h-12 w-full rounded-2xl border border-white/15 bg-white/[0.07] px-3 text-center text-lg font-bold text-white placeholder:text-white/25 focus:border-white/40 focus:outline-none';
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5" data-testid="barcode-missing">
      <button onClick={onBack} className="flex items-center gap-1.5 self-start text-sm font-semibold text-white/60">
        <ArrowLeft size={16} /> Volver a la cámara
      </button>
      <div>
        <p className="num text-xs font-semibold text-white/50">Código {code}</p>
        <p className="mt-1 text-2xl font-extrabold leading-tight">{reason === 'error' ? 'No he podido consultarlo' : 'No lo encuentro'}</p>
        <p className="mt-1 text-sm leading-snug text-white/60">
          {reason === 'error' ? 'Parece que no hay conexión. ' : 'Ese producto no está en la base de datos. '}
          Copia los valores de la etiqueta, por 100 g: se queda guardado y la próxima vez se reconoce solo.
        </p>
      </div>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Tortitas de arroz)" aria-label="Nombre del producto" className="h-12 w-full rounded-2xl border border-white/15 bg-white/[0.07] px-4 text-base font-semibold text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none" />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/60">
          Proteína por 100 g
          <input type="text" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} placeholder="0" className={field} aria-label="Proteína por 100 gramos" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/60">
          Hidratos por 100 g
          <input type="text" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} placeholder="0" className={field} aria-label="Hidratos por 100 gramos" />
        </label>
      </div>
      <button
        onClick={() => onSave({ barcode: code, name: name.trim(), proteinPer100: num(p), carbsPer100: num(c), group: groupForProduct(num(p), num(c)) })}
        disabled={!ready}
        className="mt-auto flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-orange px-4 py-3 text-center text-base font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="barcode-missing-save"
      >
        Guardar y elegir cantidad
      </button>
    </div>
  );
}

/**
 * El producto encontrado: lo que lleva por 100 g y dos caminos. Apuntar lo que has comido (cantidad rápida o con − / +, y se guarda también en Mis alimentos)
 * o solo guardarlo en tu biblioteca para elegirlo después. En el modo biblioteca se empieza por guardar y la cantidad solo se pide si quieres apuntarlo.
 */
function ProductResult({
  product,
  known,
  manual,
  mode,
  onBack,
  onAdd,
  onSaveOnly,
}: {
  product: ScannedProduct;
  known: CustomFood | null;
  manual?: boolean;
  mode: 'diario' | 'biblioteca';
  onBack: () => void;
  onAdd: (grams: number) => void;
  onSaveOnly: () => void;
}) {
  const quick = useMemo(() => quickQuantities(product), [product]);
  const [grams, setGrams] = useState(product.packageGrams ?? product.servingGrams ?? 100);
  /** Se está eligiendo cuánto se ha comido. En el modo biblioteca solo si se pide. */
  const [asking, setAsking] = useState(mode === 'diario');
  const food = useMemo(() => customFoodToCatalogFood({ id: 'scan', name: product.name, proteinPer100: product.proteinPer100, carbsPer100: product.carbsPer100, group: product.group }), [product]);
  const m = macrosForGrams(product, grams);
  const fmt = (n: number) => String(n).replace('.', ',');
  const big = 'flex min-h-16 w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-center text-[clamp(0.95rem,4.6vw,1.125rem)] font-bold leading-tight active:scale-[0.98]';
  const ghost = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-center text-sm font-bold leading-tight text-white active:bg-white/20';
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5" data-testid="barcode-result">
      <button onClick={onBack} className="flex items-center gap-1.5 self-start text-sm font-semibold text-white/60">
        <ArrowLeft size={16} /> Escanear otro
      </button>
      <div>
        <p className="text-xs font-semibold text-white/50">{known ? 'Ya lo tenías en Mis alimentos' : manual ? 'Producto nuevo' : 'Encontrado'}</p>
        <p className="mt-1 text-[clamp(1.35rem,7vw,1.75rem)] font-extrabold leading-tight [overflow-wrap:anywhere]">{product.name}</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white/50">Por 100 g</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.07] px-3 py-3 text-center">
            <p className="num text-2xl font-black leading-none" style={{ color: '#7ee0a0' }}>{fmt(product.proteinPer100)} g</p>
            <p className="mt-1 text-xs font-semibold text-white/55">proteína</p>
          </div>
          <div className="rounded-2xl bg-white/[0.07] px-3 py-3 text-center">
            <p className="num text-2xl font-black leading-none" style={{ color: '#ffd166' }}>{fmt(product.carbsPer100)} g</p>
            <p className="mt-1 text-xs font-semibold text-white/55">hidratos</p>
          </div>
        </div>
        {product.incomplete && <p className="mt-2 text-xs font-semibold text-warn">A este producto le falta un valor en la base de datos: revisa la etiqueta (puedes corregirlo después en Mis alimentos).</p>}
      </div>

      {asking && (
        <>
          <div className="rounded-3xl bg-white/[0.07] px-4 py-4">
            <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-white/55">¿Cuánto has comido?</p>
            <div className="mt-3 flex justify-center">
              <QuantityStepper food={food} grams={grams} onChange={setGrams} />
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {quick.map((q) => (
                <button
                  key={q.label}
                  onClick={() => setGrams(q.grams)}
                  aria-pressed={grams === q.grams}
                  className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${grams === q.grams ? 'border-white/60 bg-white/15 text-white' : 'border-white/15 text-white/65'}`}
                >
                  {q.label}
                  {q.label.endsWith(' g') ? '' : <span className="text-white/45"> {q.grams} g</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center" data-testid="barcode-totals">
            <div className="rounded-2xl bg-white/[0.07] px-2 py-3">
              <p className="num text-[clamp(1.25rem,6.5vw,1.75rem)] font-black leading-none" style={{ color: '#7ee0a0' }}>{fmt(m.protein)} g</p>
              <p className="mt-1 text-xs font-semibold text-white/55">de proteína</p>
            </div>
            <div className="rounded-2xl bg-white/[0.07] px-2 py-3">
              <p className="num text-[clamp(1.25rem,6.5vw,1.75rem)] font-black leading-none" style={{ color: '#ffd166' }}>{fmt(m.carbs)} g</p>
              <p className="mt-1 text-xs font-semibold text-white/55">de hidratos</p>
            </div>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {asking ? (
          <>
            <button onClick={() => onAdd(grams)} className={`${big} bg-brand-orange text-black`} data-testid="barcode-add">
              <Check size={22} strokeWidth={3.25} /> Apuntar
            </button>
            {!known && (
              <button onClick={onSaveOnly} className={ghost} data-testid="barcode-save-only">
                Solo guardar en Mis alimentos
              </button>
            )}
          </>
        ) : known ? (
          <>
            <button onClick={onBack} className={`${big} bg-brand-orange text-black`} data-testid="barcode-next">
              Escanear otro
            </button>
            <button onClick={() => setAsking(true)} className={ghost} data-testid="barcode-ask">
              Apuntar lo que he comido
            </button>
          </>
        ) : (
          <>
            <button onClick={onSaveOnly} className={`${big} bg-brand-orange text-black`} data-testid="barcode-save-only">
              <Check size={22} strokeWidth={3.25} /> Guardar en mi biblioteca
            </button>
            <button onClick={() => setAsking(true)} className={ghost} data-testid="barcode-ask">
              Guardar y apuntar lo que he comido
            </button>
          </>
        )}
      </div>
      <p className="text-center text-xs text-white/50">
        {known
          ? 'Ya está en tu biblioteca: al añadir un alimento lo eliges de Mis alimentos.'
          : asking
            ? 'Al apuntarlo se guarda también en Mis alimentos, para elegirlo la próxima vez.'
            : 'Se guarda en Mis alimentos y lo eliges cuando lo comas, en «Añadir alimento».'}
      </p>
    </div>
  );
}