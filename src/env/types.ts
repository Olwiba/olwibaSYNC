/**
 * How a value is produced when `.env.example` asks for one to be generated.
 *
 * The set is closed on purpose: these are secrets, and "run whatever the file
 * asks for" is not a thing a scaffolder should offer.
 */
export type EnvGenerateKind = 'random:base64:32' | 'random:hex:32' | 'uuid';

/** One assignment in a `.env.example`, with whatever its directive declared. */
export interface EnvSpec {
  key: string;
  /** The example's own value, used as the default when nothing is supplied. */
  defaultValue: string;
  /** Present when the directive marked the key as generated. */
  generate?: EnvGenerateKind;
  /** From `secret` on the directive — never echoed back to the terminal. */
  secret: boolean;
  /** From `prompt="..."`, for a human-facing label. */
  prompt?: string;
  description?: string;
}

export interface EnvWriteOptions {
  /** The `.env.example` to use as the template — comments and order are kept. */
  examplePath: string;
  outputPath: string;
  /** Key to final value. Keys absent here keep the example's own line. */
  values: Record<string, string>;
}
