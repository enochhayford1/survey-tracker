'use strict';

// Template-based content idea generator. Works fully offline: takes a
// question/keyword (usually clicked through from Top Questions or Keyword
// Explorer) and produces blog titles, YouTube titles + hooks, email subjects,
// and an SEO article outline.

const YEAR = new Date().getFullYear();

function clean(topic) {
  return topic.trim().replace(/\?+$/, '').replace(/\s+/g, ' ');
}

function titleCase(s) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

function generateIdeas(rawTopic, { site = null } = {}) {
  const topic = clean(rawTopic);
  const isQuestion = /\?/.test(rawTopic) || /^(how|what|is|are|can|why|does|which)\b/i.test(rawTopic);
  const t = titleCase(topic);
  const siteName = site || 'the site';

  const blogTitles = isQuestion
    ? [
        `${t}? (Tested for 30 Days — ${YEAR} Results)`,
        `${t}? Here's the Honest Answer Nobody Gives You`,
        `${t}? What ${YEAR}'s Data Actually Says`,
        `I Asked 50 Beermoney Users: ${t}?`,
        `${t}? The Complete Beginner's Guide`,
        `${t}? 7 Things to Know Before You Start`
      ]
    : [
        `${t}: The Complete ${YEAR} Guide`,
        `${t} — 9 Things I Wish I Knew Earlier`,
        `${t}: Honest Review After 30 Days of Testing`,
        `The Truth About ${t} in ${YEAR}`,
        `${t} vs the Alternatives: Which Actually Pays More?`,
        `${t}: Beginner Mistakes That Cost You Money`
      ];

  const youtubeTitles = [
    `${t} — I Tested It So You Don't Have To`,
    `The TRUTH About ${t} (${YEAR})`,
    `${t}: Watch This Before You Sign Up`,
    `How Much I ACTUALLY Made — ${t}`,
    `${t} in ${YEAR}: Still Worth It?`
  ];

  const youtubeHooks = [
    `"I spent 30 days testing this so you don't have to — and the results surprised me."`,
    `"Everyone's asking '${topic}?' — here's the answer with real payment proof."`,
    `"Before you waste hours on this, there are 3 things you need to know."`
  ];

  const emailSubjects = [
    `${t}? (the answer might surprise you)`,
    `I tested it: ${topic}`,
    `The ${topic} question everyone's asking`,
    `Real numbers inside: ${topic}`
  ];

  const outline = [
    `H1: ${blogTitles[0]}`,
    `Intro — hook with the exact question readers searched, promise a tested answer (2-3 sentences)`,
    `Quick Answer box — the TL;DR up top (great for featured snippets)`,
    `My Testing Method — how long, which sites, payment proof screenshots`,
    `Detailed Results — earnings tables, time invested, hourly rate`,
    `Comparison — how ${siteName} stacks up against 2-3 alternatives (natural spot for affiliate links)`,
    `Who Should / Shouldn't Use It — builds trust, lowers refunds/complaints`,
    `FAQ — pull 4-6 related questions from the Keyword Explorer tab`,
    `CTA — affiliate link with your bonus/referral angle`
  ];

  return { topic: rawTopic.trim(), isQuestion, blogTitles, youtubeTitles, youtubeHooks, emailSubjects, outline };
}

module.exports = { generateIdeas };
