'use strict';

const { httpGet } = require('../fetch');

// Minimal RSS/Atom parsing (regex-based, no dependencies). Good enough for
// well-formed blog feeds and YouTube channel feeds.

function strip(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function tag(block, name) {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(block);
  return m ? strip(m[1]) : '';
}

function atomLink(block) {
  const m = /<link[^>]*href="([^"]+)"[^>]*\/?>(?:<\/link>)?/i.exec(block);
  return m ? m[1].replace(/&amp;/g, '&') : '';
}

/** Parse an RSS 2.0 or Atom feed into { title, items: [{title, link, date}] }. */
function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const itemRe = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const items = [];
  let m;
  while ((m = itemRe.exec(xml)) && items.length < 25) {
    const block = m[0];
    const dateStr = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const parsed = Date.parse(dateStr);
    items.push({
      title: tag(block, 'title'),
      link: isAtom ? atomLink(block) : (tag(block, 'link') || atomLink(block)),
      date: Number.isFinite(parsed) ? parsed : null
    });
  }
  const head = xml.slice(0, itemRe.lastIndex > 0 ? xml.search(isAtom ? /<entry[\s>]/i : /<item[\s>]/i) : 2000);
  return { title: tag(head, 'title'), items: items.filter((i) => i.title) };
}

/**
 * Normalize a competitor URL into a feed URL.
 * - YouTube channel URLs / bare channel IDs → the channel's Atom feed
 * - anything else is assumed to already be an RSS/Atom URL
 */
function toFeedUrl(input) {
  const trimmed = input.trim();
  const channel = /youtube\.com\/channel\/(UC[\w-]{10,})/i.exec(trimmed) || /^(UC[\w-]{10,})$/.exec(trimmed);
  if (channel) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channel[1]}`;
  return trimmed;
}

async function fetchFeed(url) {
  const xml = await httpGet(toFeedUrl(url), { timeoutMs: 12000 });
  return parseFeed(xml);
}

module.exports = { parseFeed, fetchFeed, toFeedUrl };
