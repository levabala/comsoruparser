import { JSDOM } from 'jsdom';

import { say } from './print';
import { getHTML } from './requester';

// tslint:disable:no-object-mutation no-expression-statement
const starsRubricText = 'Звезды';
const comsoURL = 'https://www.cosmo.ru';

export enum SocialMedia {
  Instagram = 'instagram.com',
  Facebook = 'facebook.com',
  Vkontakte = 'vk.com',
  Other = 'other'
}

export interface Source {
  href: string;
  socialMedia: SocialMedia;
}

export interface ArticleData {
  sources: Source[];
  cosmoLikes: number;
}

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
    new JSDOM(text).window.document.body.querySelector('.article-itself')
  );
  say(`${articles.length} article${articles.length > 1 ? 's' : ''} received`);

  const articlesDataRaw = articles.map(a => parseArticle(a));
  const articlesData: ArticleData[] = articlesDataRaw
    .map(({ sources, cosmoLikes }) => ({
      cosmoLikes,
      sources: sources.filter(
        ({ socialMedia }) => socialMedia !== SocialMedia.Other
      )
    }))
    .filter(({ sources }) => sources.length);

  say(
    `Articles parsed. ${articlesData.length}/${articlesDataRaw.length} has appropriate social media hrefs`
  );
}

function parseArticle(article: Element): ArticleData {
  return {
    cosmoLikes: parseInt(
      article.querySelector('.btn-like-span').textContent,
      10
    ),
    sources: Array.from(article.querySelectorAll('.embed-source'))
      .map(div => div.textContent)
      .map(href => ({
        href,
        socialMedia: extractSocialMedia(href)
      }))
  };
}

function extractSocialMedia(str: string): SocialMedia {
  return Object.entries(SocialMedia).reduce(
    (acc, [key, value]) => (str.includes(value) ? SocialMedia[key] : acc),
    SocialMedia.Other
  );
}

parse();
