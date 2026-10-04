/*
 * Runtime polyfills for older mobile browsers.
 *
 * The es2020 build target makes esbuild transpile newer SYNTAX (??=, class
 * fields, …), but esbuild never polyfills missing RUNTIME APIs. The bundle
 * calls these without feature checks, which crashed phones on pre-2022
 * browsers (white screen, nothing mounted). Each patch is guarded so modern
 * browsers keep their native implementations.
 */
(() => {
  const defineProperty = (obj: object, name: string, value: unknown) => {
    const target = obj as Record<string, unknown>;
    if (name in target) return;
    Object.defineProperty(target, name, {
      value,
      configurable: true,
      writable: true,
    });
  };

  // ES2022 — Chrome 93+, Safari 15.4+
  defineProperty(
    Object,
    "hasOwn",
    (obj: object, prop: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(obj, prop)
  );

  // ES2022 — Chrome 98+, Safari 15.4%. JSON round-trip covers the plain
  // option objects vaul passes (functions/DOM nodes are not cloned).
  defineProperty(globalThis, "structuredClone", (value: unknown) =>
    JSON.parse(JSON.stringify(value))
  );

  // ES2022 — Chrome 92+, Safari 15.4%
  defineProperty(
    Array.prototype,
    "at",
    function (this: unknown[], index: number) {
      const list = this as unknown[];
      const len = list.length >>> 0;
      let i = Math.trunc(index) || 0;
      if (i < 0) i += len;
      if (i < 0 || i >= len) return undefined;
      return list[i];
    }
  );
  defineProperty(
    String.prototype,
    "at",
    function (this: String, index: number) {
      const str = String(this);
      let i = Math.trunc(index) || 0;
      if (i < 0) return str.charAt(str.length + i) || undefined;
      return str.charAt(i) || undefined;
    }
  );

  // ES2023 — Chrome 97+, Safari 15.4%
  defineProperty(Array.prototype, "findLast", function <T>(
    this: T[],
    predicate: (value: T, index: number, array: T[]) => unknown
  ) {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate(this[i], i, this)) return this[i];
    }
    return undefined;
  });
  defineProperty(Array.prototype, "findLastIndex", function <T>(
    this: T[],
    predicate: (value: T, index: number, array: T[]) => unknown
  ) {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate(this[i], i, this)) return i;
    }
    return -1;
  });

  // ES2021 — Chrome 85+, Safari 13.1%
  defineProperty(
    String.prototype,
    "replaceAll",
    function (this: String, search: string | RegExp, replacement: string) {
      const str = String(this);
      if (typeof search === "string") {
        return str.split(search).join(replacement);
      }
      return str.replace(search, replacement);
    }
  );

  // ES2020 — Chrome 76+, Safari 13%
  defineProperty(Promise, "allSettled", function <T>(
    values: Iterable<T | PromiseLike<T>>
  ): Promise<Array<PromiseSettledResult<T>>> {
    return Promise.all(
      Array.from(values, (value) =>
        Promise.resolve(value).then(
          (v): PromiseFulfilledResult<T> => ({ status: "fulfilled", value: v }),
          (e): PromiseRejectedResult => ({ status: "rejected", reason: e })
        )
      )
    );
  });
})();
