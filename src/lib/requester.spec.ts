import { getHTML } from './requester';

// tslint:disable:no-object-mutation no-expression-statement

async function test(): Promise<void> {
  const a = await getHTML();
  console.log(a);
}

test();
