import { XMLHttpRequest } from 'xmlhttprequest-ts';

// tslint:disable:no-object-mutation no-expression-statement no-if-statement

export function getHTML(address: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && xhr.status === 200) resolve(xhr.responseText);
      console.log(xhr.status);
    };
    xhr.onerror = () => {
      reject();
    };

    // say(`Requesting ${address}`);
    console.log(address);

    xhr.open('GET', address);
    xhr.setDisableHeaderCheck(true);
    xhr.send();
  });
}
