export class ContractError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ContractError';
    this.path = path;
  }
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

export type Schema<T> = {
  parse: (value: unknown, path?: string) => T;
};

export function fail(path: string, message: string): never {
  throw new ContractError(path, message);
}

export function schema<T>(parse: (value: unknown, path: string) => T): Schema<T> {
  return { parse: (value, path = '$') => parse(value, path) };
}

export const text = schema<string>((v, p) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 4000
    ? v
    : fail(p, 'expected nonblank text, at most 4,000 characters')
);

export const boolean = schema<boolean>((v, p) =>
  typeof v === 'boolean' ? v : fail(p, 'expected boolean')
);

export function number(min = -Number.MAX_VALUE, max = Number.MAX_VALUE, integer = false): Schema<number> {
  return schema((v, p) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isSafeInteger(v))
      ? v
      : fail(p, `expected ${integer ? 'safe integer' : 'finite number'} in [${min}, ${max}]`)
  );
}

export const count = number(0, Number.MAX_SAFE_INTEGER, true);
export const ratio = number(0, 1);

export function literal<const T extends string | number | boolean>(expected: T): Schema<T> {
  return schema((v, p) => (v === expected ? expected : fail(p, `expected ${expected}`)));
}

export function enumeration<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return schema((v, p) =>
    typeof v === 'string' && values.includes(v) ? (v as T[number]) : fail(p, `expected one of ${values.join(', ')}`)
  );
}

export function nullable<T>(item: Schema<T>): Schema<T | null> {
  return schema((v, p) => (v === null ? null : item.parse(v, p)));
}

export function array<T>(item: Schema<T>, min = 0, max = 10000): Schema<T[]> {
  return schema((v, p) => {
    if (!Array.isArray(v) || v.length < min || v.length > max) {
      return fail(p, `expected array with ${min}-${max} items`);
    }
    return Array.from(v, (value, i) => item.parse(value, `${p}[${i}]`));
  });
}

export function object<const S extends Record<string, Schema<unknown>>>(shape: S): Schema<{
  [K in keyof S]: Infer<S[K]>;
}> {
  return schema((v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      return fail(p, 'expected plain object');
    }
    const record = v as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!Object.hasOwn(shape, key)) fail(`${p}.${key}`, 'unknown field');
    }
    const entries = Object.entries(shape).map(([key, item]) => {
      if (!Object.hasOwn(record, key)) fail(`${p}.${key}`, 'required field');
      return [key, item.parse(record[key], `${p}.${key}`)];
    });
    return Object.fromEntries(entries) as { [K in keyof S]: Infer<S[K]> };
  });
}

export function union<const S extends readonly Schema<unknown>[]>(...items: S): Schema<Infer<S[number]>> {
  return schema((v, p) => {
    const errors: string[] = [];
    for (const item of items) {
      try {
        return item.parse(v, p) as Infer<S[number]>;
      } catch (error) {
        if (!(error instanceof ContractError)) throw error;
        errors.push(error.message);
      }
    }
    return fail(p, `no matching variant (${errors.join('; ')})`);
  });
}

export function refine<T>(item: Schema<T>, check: (value: T, path: string) => void): Schema<T> {
  return schema((v, p) => {
    const parsed = item.parse(v, p);
    check(parsed, p);
    return parsed;
  });
}

export const timestamp = refine(text, (v, p) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) {
    fail(p, 'expected canonical UTC ISO timestamp');
  }
});

export function unique(values: readonly string[], path: string) {
  if (new Set(values).size !== values.length) {
    fail(path, 'duplicate identifiers or names');
  }
}
