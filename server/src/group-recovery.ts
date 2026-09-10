export function lostWebContext(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Execution context was destroyed|Cannot find context with specified id|Target closed|Session closed/i.test(message);
}

// Only group membership can be checked before retrying. Never retry an uncertain message send.
export function recoverGroupEntry(kind: string, stage: string, attempts: number, error: unknown) {
  return kind === 'group_join' && stage === 'adicionar-participante' && attempts < 4 && lostWebContext(error);
}
