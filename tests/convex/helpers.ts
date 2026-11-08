/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import type { Id } from '../../convex/_generated/dataModel';

export const modules = import.meta.glob('../../convex/**/*.*s');

export function setup() {
  // transactionLimits: enforce production's per-function limits (32k docs
  // read, 16k written, ...). Off by default in convex-test, which would let a
  // query that fails in production pass here.
  return convexTest({ schema, modules, transactionLimits: true });
}

export type T = ReturnType<typeof setup>;

/** Creates the two allowlisted people and returns a signed-in client for each. */
export async function couple(t: T) {
  const [aId, bId] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'a@example.com', name: 'Asha' }),
    await ctx.db.insert('users', { email: 'b@example.com', name: 'Bilal' }),
  ]);
  return {
    aId,
    bId,
    // Convex Auth's getAuthUserId reads the user id from `subject` ("<userId>|<sessionId>").
    a: t.withIdentity({ subject: `${aId}|session-a` }),
    b: t.withIdentity({ subject: `${bId}|session-b` }),
  };
}

/* ------------------------------------------------------------------ *
 * Valid-argument synthesis from a function's exported validator JSON
 * ------------------------------------------------------------------ */

type ValidatorJson =
  | { type: 'null' | 'number' | 'bigint' | 'boolean' | 'string' | 'bytes' | 'any' }
  | { type: 'literal'; value: unknown }
  | { type: 'id'; tableName: string }
  | { type: 'array'; value: ValidatorJson }
  | { type: 'object'; value: Record<string, { fieldType: ValidatorJson; optional: boolean }> }
  | { type: 'record'; keys: ValidatorJson; values: { fieldType: ValidatorJson } }
  | { type: 'union'; value: ValidatorJson[] };

/** A value that passes `validator`, using only required fields. */
export function sampleFor(validator: ValidatorJson): unknown {
  switch (validator.type) {
    case 'null':
      return null;
    case 'number':
      return 1;
    case 'bigint':
      return 1n;
    case 'boolean':
      return false;
    case 'string':
      return 'x';
    case 'bytes':
      return new ArrayBuffer(1);
    case 'any':
      return 'x';
    case 'literal':
      return validator.value;
    case 'id':
      // convex-test ids are "<digits><tableName>"; this passes validation
      // without pointing at a real document.
      return `999999${validator.tableName}` as Id<never>;
    case 'array':
      return [];
    case 'record':
      return {};
    case 'union':
      return sampleFor(validator.value[0]);
    case 'object':
      return Object.fromEntries(
        Object.entries(validator.value)
          .filter(([, f]) => !f.optional)
          .map(([k, f]) => [k, sampleFor(f.fieldType)]),
      );
  }
}

export interface PublicFn {
  path: string; // "expenses:add"
  kind: 'query' | 'mutation' | 'action';
  args: Record<string, unknown>;
}

/** Every public query/mutation/action across the convex/ directory. */
export async function publicFunctions(): Promise<PublicFn[]> {
  const out: PublicFn[] = [];
  for (const [file, load] of Object.entries(modules)) {
    if (file.includes('/_generated/') || file.endsWith('.d.ts')) continue;
    const mod = (await load()) as Record<string, any>;
    const name = file.replace('../../convex/', '').replace(/\.[jt]s$/, '');
    for (const [exportName, fn] of Object.entries(mod)) {
      if (!fn || typeof fn !== 'function' || !fn.isPublic) continue;
      const kind = fn.isQuery ? 'query' : fn.isMutation ? 'mutation' : fn.isAction ? 'action' : null;
      if (!kind) continue;
      const argsJson = JSON.parse(fn.exportArgs()) as ValidatorJson;
      out.push({
        path: `${name}:${exportName}`,
        kind,
        args: argsJson.type === 'any' ? {} : (sampleFor(argsJson) as Record<string, unknown>),
      });
    }
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}
