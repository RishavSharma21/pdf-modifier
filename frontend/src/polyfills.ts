// Global Polyfills for iOS Safari / WebKit and older browsers (PDF.js v6 compatibility)

// 1. Promise.withResolvers
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// 2. Map.prototype.getOrInsertComputed
if (typeof Map !== 'undefined' && typeof (Map.prototype as any).getOrInsertComputed === 'undefined') {
  (Map.prototype as any).getOrInsertComputed = function <K, V>(
    key: K,
    callback: (key: K) => V
  ): V {
    if (this.has(key)) {
      return this.get(key)!;
    }
    const val = callback(key);
    this.set(key, val);
    return val;
  };
}

// 3. Map.prototype.getOrInsert
if (typeof Map !== 'undefined' && typeof (Map.prototype as any).getOrInsert === 'undefined') {
  (Map.prototype as any).getOrInsert = function <K, V>(key: K, defaultValue: V): V {
    if (this.has(key)) {
      return this.get(key)!;
    }
    this.set(key, defaultValue);
    return defaultValue;
  };
}

// 4. URL.parse
if (typeof URL !== 'undefined' && typeof (URL as any).parse !== 'function') {
  (URL as any).parse = function (url: string | URL, base?: string | URL): URL | null {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

export {};
