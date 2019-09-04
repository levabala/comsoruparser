import { clearLine, cursorTo } from 'readline';

// tslint:disable:no-expression-statement no-let

const startTime = Date.now();
let lastTime = startTime;

say('start');

export function say(message: string): void {
  const totalElapsed = Date.now() - startTime;
  const currentElapsed = Date.now() - lastTime;
  const str = `${ms2s(totalElapsed).toFixed(2)}s [${ms2s(
    currentElapsed
  ).toFixed(2)}s]: ${message}`;

  process.stdout.write(str + '\n');

  lastTime = Date.now();
}

function ms2s(ms: number): number {
  return ms / 1000;
}

export function up(): void {
  clearLine(process.stdout, 0);
  cursorTo(process.stdout, 0);
}
