const startTime = Date.now();

export function say(message: string, withTime = true): void {
  console.log(message, withTime ? `${ms2s(Date.now() - startTime)}ms` : '');
}

function ms2s(ms: number): number {
  return ms / 1000;
}
