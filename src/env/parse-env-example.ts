import type { EnvGenerateKind, EnvSpec } from './types';

const GENERATE_KINDS: readonly EnvGenerateKind[] = ['random:base64:32', 'random:hex:32', 'uuid'];

function readAttribute(directive: string, name: string): string | undefined {
  const quoted = directive.match(new RegExp(`${name}="([^"]*)"`));
  if (quoted) return quoted[1];
  const bare = directive.match(new RegExp(`${name}=([^\\s"]+)`));
  return bare?.[1];
}

/**
 * Reads the `# @genesis` directives in a `.env.example` into specs.
 *
 * The directive sits on the line immediately above its key, which is the
 * convention the template's own tooling uses. A key with no directive above it
 * still yields a spec — it is a real variable, just an undescribed one — so
 * this never silently drops a key from a file it is meant to describe in full.
 *
 * Line endings are normalised first. The directive must be followed by a
 * newline and then the key, and a CRLF file otherwise matches nothing at all:
 * that exact failure has bitten this ecosystem before, silently, because the
 * result is an empty list rather than an error.
 */
export function parseEnvExample(source: string): EnvSpec[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const specs: EnvSpec[] = [];

  for (const [index, line] of lines.entries()) {
    const assignment = line.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!assignment) continue;

    const key = assignment[1]!;
    const rawDefault = assignment[2]!.trim();
    // Strip one layer of surrounding quotes; the file quotes values that
    // contain spaces, and the quotes are not part of the value.
    const defaultValue = rawDefault.replace(/^"(.*)"$/, '$1');

    const previous = lines[index - 1]?.trim() ?? '';
    const directive = previous.startsWith('# @genesis ') ? previous : undefined;

    const generateRaw = directive ? readAttribute(directive, 'generate') : undefined;
    const generate = GENERATE_KINDS.find((kind) => kind === generateRaw);

    specs.push({
      key,
      defaultValue,
      generate,
      // Bare flag, not an assignment — `secret` appears on its own.
      secret: directive ? /(^|\s)secret(\s|$)/.test(directive) : false,
      prompt: directive ? readAttribute(directive, 'prompt') : undefined,
      description: directive ? readAttribute(directive, 'description') : undefined,
    });
  }

  return specs;
}
