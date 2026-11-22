import type { en } from "./en";

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The dictionary shape: every locale must provide exactly the keys of `en` (checked by tsc and tests). */
export type Dict = Widen<typeof en>;
