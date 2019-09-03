import { JSDOM } from 'jsdom';

import { say } from './print';
import { getHTML } from './requester';

// tslint:disable:no-object-mutation no-expression-statement
const starsRubricText = 'Звезды';
const comsoURL = 'https://www.cosmo.ru';

async function parse(): Promise<void> {
  const newsTextHTML = await getHTML(`${comsoURL}/news`);
  say('News HTML received');

  const dom = new JSDOM(newsTextHTML);
  const allNewsBlocks = Array.from(
    dom.window.document.body.querySelectorAll('.news-section-link')
  );

  const starsNewsBlocks = allNewsBlocks.filter(block => {
    const rubric = block.querySelector('.rubric');
    return rubric.textContent.includes(starsRubricText);
  });

  const starsLinks = starsNewsBlocks
    .map(a => a.getAttribute('href'))
    .map(link => `${comsoURL}${link}`)
    // temporary we'll use only 1 aritcle
    .slice(0, 1);

  const articlesTextHTML = await Promise.all(
    starsLinks.map(link => getHTML(link))
  );
  const articles = articlesTextHTML.map(text =>
    new JSDOM(text).window.document.body.querySelector('article-itself')
  );
  say(`${articles.length} articles received`);

  console.log(articles.length);
}

parse();
