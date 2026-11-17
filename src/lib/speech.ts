/**
 * La voz de Rex: dictar en lugar de escribir. Envuelve el reconocimiento de voz del navegador (Web Speech API) en algo pequeño y probable:
 * detecta si hay, escucha una frase, avisa de lo que va entendiendo y de cuándo termina o falla, y pasa los números dichos («cuarenta y cinco»)
 * a cifras para que la caja de Rex los lea como si los hubieras escrito. No guarda nada: el audio lo transcribe el servicio del navegador.
 */

// --- Los tipos mínimos de la API (el compilador no los trae) ---------------------------------------------------------------------------

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}
export interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

/** El constructor del reconocimiento de voz de este navegador, o null si no lo tiene (Firefox, algunos móviles y navegadores integrados). */
export function getSpeechCtor(win: unknown = typeof window !== 'undefined' ? window : undefined): RecognitionCtor | null {
  const w = win as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

export interface SpeechHandlers {
  onStart?: () => void;
  /** Lo que va entendiendo mientras hablas (puede cambiar). */
  onInterim?: (text: string) => void;
  /** La frase terminada. */
  onFinal: (text: string) => void;
  /** Un fallo: `no-speech`, `not-allowed`, `audio-capture`, `network`… (`aborted` es cancelar a mano). */
  onError?: (code: string) => void;
  /** Termina la escucha, haya habido frase o fallo. */
  onEnd?: () => void;
}

export interface Recognizer {
  start(): void;
  /** Deja de escuchar y da lo que haya entendido. */
  stop(): void;
  /** Cancela sin dar nada. */
  abort(): void;
}

export function createRecognizer(Ctor: RecognitionCtor, handlers: SpeechHandlers, lang = 'es-ES'): Recognizer {
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onstart = () => handlers.onStart?.();
  rec.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) final += text;
      else interim += text;
    }
    if (interim.trim()) handlers.onInterim?.(interim.trim());
    if (final.trim()) handlers.onFinal(final.trim());
  };
  rec.onerror = (e) => handlers.onError?.(e.error);
  rec.onend = () => handlers.onEnd?.();
  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
    abort: () => rec.abort(),
  };
}

// --- Cuando falla -----------------------------------------------------------------------------------------------------------------------

export interface SpeechProblem {
  title: string;
  detail: string;
  /** Tiene sentido volver a intentarlo (ruido, silencio) y no (micrófono bloqueado). */
  canRetry: boolean;
}

/** Qué decirle al atleta según el código de fallo del navegador. */
export function speechProblem(code: string): SpeechProblem {
  switch (code) {
    case 'no-speech':
      return { title: 'No te he oído', detail: 'Habla un poco más cerca o con menos ruido.', canRetry: true };
    case 'not-allowed':
    case 'service-not-allowed':
      return { title: 'El micrófono está bloqueado', detail: 'Permítelo en los ajustes del navegador, o escribe.', canRetry: false };
    case 'audio-capture':
      return { title: 'No encuentro el micrófono', detail: 'Comprueba que no lo esté usando otra app, o escribe.', canRetry: true };
    case 'network':
      return { title: 'La voz necesita conexión', detail: 'Sin internet no puedo oírte: escribe.', canRetry: true };
    case 'language-not-supported':
      return { title: 'Tu navegador no entiende español por voz', detail: 'Escribe lo que necesitas.', canRetry: false };
    case 'unsupported':
      return { title: 'La voz no está disponible aquí', detail: 'Este navegador no la tiene. Prueba en Chrome, o escribe.', canRetry: false };
    default:
      return { title: 'No he podido escucharte', detail: 'Inténtalo otra vez o escribe.', canRetry: true };
  }
}

// --- Números dichos → cifras ------------------------------------------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
  veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
/** «un», «una» y «uno» solos son artículos: solo cuentan como cifra delante de una medida («una hora», «un kilo»). */
const ONES = new Set(['un', 'uno', 'una']);
const MEASURES = /^(hora|horas|minuto|minutos|min|mins|kilo|kilos|kg|repeticion|repeticiones|rep|reps|serie|series|gramos|gr)$/;

const plain = (word: string): string => word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * «tengo cuarenta y cinco minutos» → «tengo 45 minutos»; «mi back squat es ciento cuarenta» → «mi back squat es 140»; «ochenta y dos coma cuatro»
 * → «82,4». Cubre hasta 999. El texto que ya trae cifras, o palabras que no son números, pasa igual.
 */
export function numberWordsToDigits(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    const word = plain(tokens[i]);
    const isNumberWord = word in UNITS || word in TENS || word in HUNDREDS;
    if (!isNumberWord) {
      out.push(tokens[i]);
      i++;
      continue;
    }
    // Una sola palabra de «un/una/uno» es un artículo salvo delante de una medida.
    if (ONES.has(word) && !(i + 1 < tokens.length && MEASURES.test(plain(tokens[i + 1])))) {
      out.push(tokens[i]);
      i++;
      continue;
    }
    let total = 0;
    let j = i;
    if (plain(tokens[j]) in HUNDREDS) {
      total += HUNDREDS[plain(tokens[j])];
      j++;
    }
    if (j < tokens.length && plain(tokens[j]) in TENS) {
      total += TENS[plain(tokens[j])];
      j++;
      // «treinta y cinco»: la «y» solo une decenas con unidades de 1 a 9.
      if (j + 1 < tokens.length && plain(tokens[j]) === 'y' && UNITS[plain(tokens[j + 1])] >= 1 && UNITS[plain(tokens[j + 1])] <= 9) {
        total += UNITS[plain(tokens[j + 1])];
        j += 2;
      }
    } else if (j < tokens.length && plain(tokens[j]) in UNITS) {
      total += UNITS[plain(tokens[j])];
      j++;
    }
    if (j === i) {
      out.push(tokens[i]);
      i++;
      continue;
    }
    out.push(String(total));
    i = j;
  }
  // «82 coma 4» → «82,4».
  return out.join(' ').replace(/(\d+) coma (\d+)/g, '$1,$2');
}
