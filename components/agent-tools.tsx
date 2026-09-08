'use client';
import { useEffect, useRef } from 'react';
import { rankings, type Player, type Game, divisions } from '@/lib/tournament';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};
export default function AgentTools({
  players,
  games,
}: {
  players: Player[];
  games: Game[];
}) {
  const state = useRef({ players, games });
  state.current = { players, games };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool: Tool = {
      name: 'read_escada_standings',
      description:
        'Read the September 2026 demonstration standings shown in the Escada backoffice. Does not modify data.',
      inputSchema: {
        type: 'object',
        properties: { division: { type: 'string', enum: divisions } },
        required: ['division'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute(input) {
        if (
          !input ||
          typeof input !== 'object' ||
          !('division' in input) ||
          !divisions.includes(input.division as (typeof divisions)[number])
        )
          throw new Error('A divisão deve ser M1+, M1 ou M2.');
        return {
          demo: true,
          month: '2026-09',
          players: rankings(state.current.players, state.current.games)
            .filter((p) => p.division === input.division)
            .map((p, i) => ({
              position: i + 1,
              name: p.name,
              side: p.side,
              points: p.points,
              wins: p.wins,
              losses: p.losses,
            })),
        };
      },
    };
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, []);
  return null;
}
