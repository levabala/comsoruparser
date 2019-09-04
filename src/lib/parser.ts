import { existsSync, promises, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import Horseman from 'node-horseman';

import { say } from './print';
import { getHTML } from './requester';

const { readFile, writeFile } = promises;

// tslint:disable:no-object-mutation no-expression-statement
const starsRubricText = 'Звезды';
const comsoURL = 'https://www.cosmo.ru';

const dataPath = 'data';
const storeArticlesFileName = 'parsedArticles.json';
const storeArticlesPath = `${dataPath}/${storeArticlesFileName}`;
const excludedLinksFileName = 'excludedArticles.json';
const excludedLinksPath = `${dataPath}/${excludedLinksFileName}`;

const blockSize = 20;

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

function scrollSections(
  horseman: Horseman.HorsemanPromise<void> & Horseman,
  sectionsToScroll: number
): Horseman.HorsemanPromise<void> & Horseman {
  const scrollWaitTime = 100;
  const scrollMax = 10e7;
  let scrolled = 0;

  const waiter = (done, i) => {
    say(`Scrolled section ${i}/${sectionsToScroll}`);
    setTimeout(done, scrollWaitTime);
  };

  let h: Horseman.HorsemanPromise<void> & Horseman = horseman;
  while (scrolled++ < sectionsToScroll) {
    const s = scrolled;
    h = h.scrollTo(scrollMax, 0).do(done => waiter(done, s));
  }
  return h;
}

function getPageViaHorseman(): Horseman.HorsemanPromise<void> & Horseman {
  const horseman = new Horseman(undefined);

  say('Getting page via Horseman');

  const h = horseman.open(`${comsoURL}/news`).do(done => {
    say('Page downloaded');
    done();
  });

  return h;
  // const { body } = dom.window.document;
  // const newsSections = Array.from(body.querySelectorAll('.news-section'));
  // console.log(body.querySelector('.discussed-news-div'));
  // console.log(body.querySelector('.section-3cols'));
  // console.log('sectionsCount:', newsSections.length);
}

async function parse(
  dom: JSDOM,
  excludeHrefs: string[] = []
): Promise<{ articlesData: ArticleData[]; excluded: string[] }> {
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
    .map(link => `${comsoURL}${link}`)
    .filter(link => !excludeHrefs.includes(link));
  // temporary we'll use only 1 aritcle
  // .slice(0, 1);

  say(
    `${starsLinks.length}/${starsNewsBlocks.length} links will be processed (it may take a while)`
  );

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
    // say(`Request block ${blockIndex} (${0}/${block.length})`);
    say(`Request block ${blockIndex}`);
    return Promise.all(
      block
        .map(async href => {
          try {
            const html = await getHTML(href);

            if (!html) throw new Error('just error');

            left--;

            // say(`Link ${i} loaded (${left} left)`);
            // up();
            // say(`Request block ${blockIndex} (${i}/${block.length})`);

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
  }> = (await tasks.reduce((lastTask, task) => {
    const r = lastTask().then(async data => {
      const newData = await task();
      return [...data, ...newData];
    });
    return () => r;
  })()).filter(a => !!a && a.href && a.html);

  say(
    `${articlesTextHTML.length} article${
      articlesTextHTML.length > 1 ? 's' : ''
    } received. Processing started`
  );

  const articles: Array<{
    article: Element;
    href: string;
  }> = articlesTextHTML.map(({ html, href }, i, arr) => {
    if (i % Math.floor(arr.length / 10) === 0)
      say(`${i} (${Math.round((i / arr.length) * 100)}%) articles processed`);

    return {
      article: new JSDOM(html).window.document.body.querySelector(
        '.article-layout'
      ),
      href
    };
  });

  say('Converting to DOM completed. Parsing started');

  const articlesDataRaw = articles.map(({ href, article }) =>
    parseArticle(article, href)
  );

  say('Parsing completed. Filtering started');

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

  const included = articlesData.map(({ href }) => href);
  const excluded = starsLinks.filter(link => !included.includes(link));

  say(
    `Included ${included.length}/${excluded.length} (${excluded.length} excluded)`
  );

  return { articlesData, excluded };
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

async function readArticlesData(): Promise<Record<string, ArticleData>> {
  if (!existsSync(storeArticlesPath)) writeFileSync(storeArticlesPath, '{}');

  const alreadyStoredArticles = JSON.parse(
    (await readFile(storeArticlesPath, { encoding: 'utf-8' })) || '{}'
  );

  return alreadyStoredArticles;
}

async function readExludedData(): Promise<string[]> {
  if (!existsSync(excludedLinksPath)) writeFileSync(excludedLinksPath, '[]');

  const excludedArticles = JSON.parse(
    (await readFile(excludedLinksPath, { encoding: 'utf-8' })) || '[]'
  );

  return excludedArticles;
}

async function saveExcludedLinksDataToDisk(
  oldExcluded: string[],
  newExcluded: string[]
): Promise<void> {
  if (!existsSync(excludedLinksPath)) writeFileSync(excludedLinksPath, '{}');

  say('Mixing old&new excluded links');
  const excluded = Array.from(new Set([...oldExcluded, ...newExcluded]));
  const excludedStr = JSON.stringify(excluded);

  say('Writing excluded links to disk');

  await writeFile(excludedLinksPath, excludedStr);

  say(`Writing done (${excluded.length} links are excluded)`);
}

async function saveArticlesDataToDisk(
  oldData: Record<string, ArticleData>,
  newData: ArticleData[]
): Promise<void> {
  // check if file exists
  if (!existsSync(storeArticlesPath)) writeFileSync(storeArticlesPath, '{}');

  say('Starting reading articles store file');

  say(
    `Articles store file was read (contains ${
      Object.keys(oldData).length
    } articles)`
  );

  // we use an article's href as key
  const newArticles = newData.reduce(
    (acc, val) => ({ ...acc, [val.href]: val }),
    {}
  );

  const newStoredArticlesJSON = JSON.stringify({
    ...oldData,
    ...newArticles
  });

  await writeFile(storeArticlesPath, newStoredArticlesJSON);

  say(
    `Articles store file was updated (contains ${
      Object.keys({
        ...oldData,
        ...newArticles
      }).length
    } articles)`
  );
}

async function processNextData(
  page: Horseman.HorsemanPromise<void> & Horseman
): Promise<void> {
  const updatedPage = scrollSections(page, 30);
  const html = await updatedPage.html();
  const dom = new JSDOM(html);

  try {
    const oldData = await readArticlesData();
    const oldExcluded = [...(await readExludedData()), ...Object.keys(oldData)];
    const { articlesData: newData, excluded } = await parse(dom, oldExcluded);

    const newExcluded = Array.from(
      new Set([...newData.map(({ href }) => href), ...excluded])
    );

    await saveArticlesDataToDisk(oldData, newData);
    await saveExcludedLinksDataToDisk(oldExcluded, newExcluded);
  } catch (e) {
    say(e);
  }
}

async function justDoIt(): Promise<void> {
  const page = getPageViaHorseman();

  let count = 5500;

  while (count--) await processNextData(page);

  say('DONE');
}

justDoIt();

// loadNextSection();

// getDOMviaHorseman();
