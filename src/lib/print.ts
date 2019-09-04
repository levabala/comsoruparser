// tslint:disable:no-expression-statement no-let

const startTime = Date.now();
let lastTime = startTime;

say('start');

export function say(message: string): void {
  const totalElapsed = Date.now() - startTime;
  const currentElapsed = Date.now() - lastTime;
  console.log(
    `${ms2s(totalElapsed).toFixed(2)}s [${ms2s(currentElapsed).toFixed(
      2
    )}s]: ${message}`
  );

  lastTime = Date.now();
}

function ms2s(ms: number): number {
  return ms / 1000;
}
