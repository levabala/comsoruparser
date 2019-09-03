import { XMLHttpRequest } from 'xmlhttprequest-ts';

// tslint:disable:no-object-mutation no-expression-statement no-if-statement

export function getHTML(address: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && xhr.status === 200) {
        resolve(xhr.responseText);
      }
    };
    xhr.onerror = () => {
      reject();
    };

    xhr.open('GET', address);
    xhr.send();
  });
}
