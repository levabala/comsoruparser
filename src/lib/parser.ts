import { existsSync, promises, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import Horseman from 'node-horseman';

import { say } from './print';
import { getHTML } from './requester';

const { readFile, writeFile } = promises;

// tslint:disable:no-object-mutation no-expression-statement
const starsRubricText = 'Звезды';
const comsoURL = 'https://www.cosmo.ru';

console.log(__dirname);
const dataPath = 'data';
const storeArticlesFileName = 'parsedArticles.json';
const storeArticlesPath = `${dataPath}/${storeArticlesFileName}`;

export enum SocialMedia {
  Instagram = 'instagram.com',
  Facebook = 'facebook.com',
  Vkontakte = 'vk.com',
  Other = 'other'
}

export interface Source {
  hrefs: {
    page: string;
    photo: string;
  };
  socialMedia: SocialMedia;
}

export interface ArticleData {
  sources: Source[];
  cosmoLikes: number;
  href: string;
}

// async function scrollSections(horseman: Horseman, sections: number) : Horseman {
//   let scrolled = 0;
//   let h = horseman;
//   while (scrolled < sections)
//     h = await horseman.scrollTo(10e6, 0).do(done => {
//       setTimeout(done, 500);
//       return;
//     });
// }

async function getDOMviaHorseman(): Promise<JSDOM> {
  const scrollMax = 10e7;
  const scrollWaitTime = 2000;
  const horseman = new Horseman(undefined);
  const waiter = done => {
    setTimeout(done, scrollWaitTime);
    say('Scrolled section');
  };

  say('Getting page via Horseman');

  const h = await horseman
    .open(`${comsoURL}/news`)
    .do(done => {
      say('Page downloaded');
      done();
    })
    .scrollTo(scrollMax, 0)
    .do(waiter)
    .scrollTo(scrollMax, 0)
    .do(waiter)
    .scrollTo(scrollMax, 0)
    .do(waiter)
    .scrollTo(scrollMax, 0)
    .do(waiter)
    .scrollTo(scrollMax, 0)
    .do(waiter)
    // .scrollTo(scrollMax, 0)
    // .do(waiter)
    // .scrollTo(scrollMax, 0)
    // .do(waiter)
    // .scrollTo(scrollMax, 0)
    // .do(waiter)
    // .scrollTo(scrollMax, 0)
    // .do(waiter)
    // .scrollTo(scrollMax, 0)
    // .do(waiter)
    // .scrollTo(scrollMax, 0)
    // .do(waiter)
    // .scrollTo(scrollMax, 0)
    // .do(waiter)
    .html();

  const dom = new JSDOM(h);
  return dom;
  // const { body } = dom.window.document;
  // const newsSections = Array.from(body.querySelectorAll('.news-section'));
  // console.log(body.querySelector('.discussed-news-div'));
  // console.log(body.querySelector('.section-3cols'));
  // console.log('sectionsCount:', newsSections.length);
}

async function loadNextSection(): Promise<void> {
  const newsTextHTML = await getHTML(`${comsoURL}/news`);
  say('News HTML received');

  const sectionIdReg = /'\/article\/getSection\/\?sectionId=.[^']*/;
  const [sectionIdRequestString] = sectionIdReg.exec(newsTextHTML);
  console.log(sectionIdRequestString);

  const newTextHTML = await getHTML(
    encodeURI(
      `${comsoURL}${sectionIdRequestString.slice(
        1,
        sectionIdRequestString.length
      )}`
    )
  );

  const dom = new JSDOM(newTextHTML);
  const { body } = dom.window.document;
  const newsSections = Array.from(body.querySelectorAll('.news-section'));
  console.log(body.querySelector('.discussed-news-div'));
  console.log(body.querySelector('.section-3cols'));
  console.log('sectionsCount:', newsSections.length);
}

async function parse(dom: JSDOM): Promise<ArticleData[]> {
  const allNewsBlocks = Array.from(
    dom.window.document.body.querySelectorAll('.news-section-link')
  );

  const starsNewsBlocks = allNewsBlocks.filter(block => {
    const rubric = block.querySelector('.rubric');
    return rubric.textContent.includes(starsRubricText);
  });

  say(`${starsNewsBlocks.length} stars blocks found`);

  const starsLinks = starsNewsBlocks
    .map(a => a.getAttribute('href'))
    .map(link => `${comsoURL}${link}`);
  // temporary we'll use only 1 aritcle
  // .slice(0, 1);

  say(`${starsLinks.length} links will be processed (it may take a while)`);

  const blockSize = 10;
  let left = starsLinks.length;

  const blocks = starsLinks.reduce(
    (acc: string[][], val) => {
      const lastBlock = acc[acc.length - 1];
      const newBlockNecessity = lastBlock.length > blockSize;
      const lastBlockActual = newBlockNecessity ? [] : lastBlock;

      const tail = newBlockNecessity ? acc.slice(0) : acc.slice(0, -1);

      return [...tail, [...lastBlockActual, val]];
    },
    [[]]
  );

  const executeBlock = async (block: string[], blockIndex: number) => {
    say(`Request block ${blockIndex}`);
    return Promise.all(
      block
        .map(async (href, i) => {
          try {
            const html = await getHTML(href);

            if (!html) throw new Error('just error');

            left--;
            say(`Link ${i} loaded (${left} left)`);
            return { html, href };
          } catch (e) {
            return null;
          }
        })
        .filter(a => a)
    );
  };

  const tasks = blocks.map((block, i) => () => executeBlock(block, i));

  const articlesTextHTML: Array<{
    html: string;
    href: string;
  }> = await tasks.reduce((lastTask, task) => {
    const r = lastTask().then(() => task());
    return () => r;
  })();

  const articles: Array<{
    article: Element;
    href: string;
  }> = articlesTextHTML.map(({ html, href }) => ({
    article: new JSDOM(html).window.document.body.querySelector(
      '.article-layout'
    ),
    href
  }));

  say(`${articles.length} article${articles.length > 1 ? 's' : ''} received`);

  const articlesDataRaw = articles.map(({ href, article }) =>
    parseArticle(article, href)
  );
  const articlesData: ArticleData[] = articlesDataRaw
    .map(article => ({
      ...article,
      sources: article.sources.filter(
        ({ socialMedia }) => socialMedia !== SocialMedia.Other
      )
    }))
    .filter(({ sources }) => sources.length);

  say(
    `Articles parsed. ${articlesData.length}/${articlesDataRaw.length} have appropriate social media hrefs`
  );

  return articlesData;
}

function parseArticle(article: Element, href: string): ArticleData {
  // WARNING: image at the header not being captured
  // WARNING: blocks with more than 1 picture not being captured
  // WARNING: there are collages :/
  const picturesBlocks = Array.from(
    article.querySelectorAll('.article-pic.image-count-1')
  ).filter(block => block.querySelector('.embed-source'));

  return {
    cosmoLikes: parseInt(
      article.querySelector('.btn-like-span').textContent,
      10
    ),
    href,
    sources: picturesBlocks.map(block => {
      const linkBlock = block.querySelector('.embed-source');
      const img: HTMLImageElement = block.querySelector('img');
      const { textContent: page } = linkBlock;

      const output: Source = {
        hrefs: {
          page,
          photo: img.getAttribute('data-original')
        },
        socialMedia: extractSocialMedia(page)
      };

      return output;
    })
  };
}

function extractSocialMedia(str: string): SocialMedia {
  return Object.entries(SocialMedia).reduce(
    (acc, [key, value]) => (str.includes(value) ? SocialMedia[key] : acc),
    SocialMedia.Other
  );
}

async function saveArticlesDataToDisk(data: ArticleData[]): Promise<void> {
  // check if file exists
  if (!existsSync(storeArticlesPath)) writeFileSync(storeArticlesPath, '{}');

  // we use an article's href as key
  const alreadyStoredArticles = JSON.parse(
    (await readFile(storeArticlesPath, { encoding: 'utf-8' })) || '{}'
  );

  say('Articles store file was read');

  const newArticles = data.reduce(
    (acc, val) => ({ ...acc, [val.href]: val }),
    {}
  );

  const newStoredArticlesJSON = JSON.stringify({
    ...alreadyStoredArticles,
    ...newArticles
  });

  await writeFile(storeArticlesPath, newStoredArticlesJSON);

  say('Articles store file was updated');
}

async function justDoIt(): Promise<void> {
  const dom = await getDOMviaHorseman();
  const data = await parse(dom);
  await saveArticlesDataToDisk(data);

  say('DONE');
}

justDoIt();

// loadNextSection();

// getDOMviaHorseman();
