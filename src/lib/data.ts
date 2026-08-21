import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import { Mutex } from "async-mutex";

const DATA_DIR = path.resolve(process.cwd(), "data");
const mutexes = new Map<string, Mutex>();

function getMutex(filename: string): Mutex {
  let mutex = mutexes.get(filename);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(filename, mutex);
  }
  return mutex;
}

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

// async-mutex is not reentrant, so the locking wrappers below must never call
// each other. These two do the actual IO and hold no lock themselves.

async function readRaw<T>(filename: string): Promise<T> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Data file not found: ${filename}`);
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Data file corrupted: ${filename} — ${err.message}`);
    }
    throw err;
  }
}

async function writeRaw<T>(filename: string, data: T): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, filePath);
}

export async function readData<T>(filename: string): Promise<T> {
  return readRaw<T>(filename);
}

export async function writeData<T>(filename: string, data: T): Promise<void> {
  await getMutex(filename).runExclusive(() => writeRaw(filename, data));
}

export async function readDataSafe<T>(filename: string, fallback: T): Promise<T> {
  try {
    return await readData<T>(filename);
  } catch {
    return fallback;
  }
}

/** Returned from a `mutateData` callback to finish without writing. */
export const ABORT_WRITE = Symbol("abort-write");

/**
 * Read, modify and write a file under a single lock.
 *
 * `writeData` alone only serialises the write, which is not enough: two
 * requests can both read the same state, both apply their change to their own
 * copy, and the second write silently discards the first. It went unnoticed
 * while the app wrote rarely; a canvas that saves on every gesture — with the
 * AI agent writing through the same routes in parallel — hits it routinely, and
 * the symptom is a change that quietly vanishes with no error anywhere.
 *
 * Return ABORT_WRITE from `mutate` to skip the write (nothing changed, or the
 * target was not found).
 */
export async function mutateData<T, R>(
  filename: string,
  fallback: T,
  mutate: (data: T) => R | typeof ABORT_WRITE | Promise<R | typeof ABORT_WRITE>
): Promise<R | null> {
  return getMutex(filename).runExclusive(async () => {
    let data: T;
    try {
      data = await readRaw<T>(filename);
    } catch {
      data = fallback;
    }
    const result = await mutate(data);
    if (result === ABORT_WRITE) return null;
    await writeRaw(filename, data);
    return result;
  });
}
