'use strict';

// Bundled demo dataset used when Reddit can't be reached and no cache exists,
// so the app is fully explorable offline. Clearly flagged as demo in the UI.

const QUESTION_TITLES = [
  ['What are the highest paying survey sites in 2026?', 412, 187],
  ['Is Swagbucks still worth it or has it gone downhill?', 350, 240],
  ['How long does the Prolific waitlist take right now?', 298, 154],
  ['Best beermoney apps for passive income?', 276, 132],
  ['How much can you realistically make on Prolific per month?', 271, 98],
  ['Is Survey Junkie legit? Just got my first $25 payout', 244, 76],
  ['Which sites actually pay through PayPal instantly?', 230, 88],
  ['Why does Swagbucks keep disqualifying me mid-survey?', 219, 167],
  ['Is Freecash a scam or am I doing something wrong?', 201, 143],
  ['How do taxes work for survey income in the US?', 196, 121],
  ['Best survey sites for someone outside the US?', 189, 95],
  ['Can you use a VPN on survey sites without getting banned?', 182, 139],
  ['What is the fastest way to hit InboxDollars $15 minimum?', 168, 64],
  ['UserTesting screeners — how do you actually pass them?', 161, 87],
  ['Is Mistplay worth the grind for gift cards?', 149, 71],
  ['How many survey sites should I stack at once?', 144, 59],
  ['Does Qmee really have no minimum cashout?', 139, 41],
  ['Anyone making $500+/month from beermoney? What is your stack?', 137, 203],
  ['Are receipt scanning apps like Fetch worth it anymore?', 128, 66],
  ['How do I avoid getting banned on Branded Surveys?', 121, 58],
  ['What beermoney works best on a phone only?', 117, 49],
  ['Is Honeygain safe to run on a home network?', 112, 84],
  ['KashKick offers — which games actually pay out?', 107, 52],
  ['Why was my ySense account suspended after cashing out?', 96, 73],
  ['Best surveys for quick $5 before the weekend?', 84, 31]
];

const NEUTRAL_TITLES = [
  ['Prolific just dropped a huge batch of studies', 502, 161, 'prolific'],
  ['Swagbucks payout proof — $250 this month', 387, 92, 'swagbucks'],
  ['PSA: Freecash lowered offerwall rates again', 290, 178, 'freecash'],
  ['My 6-month earnings report across 9 beermoney sites', 274, 130, null],
  ['Survey Junkie raised their PayPal minimum', 233, 97, 'surveyjunkie'],
  ['Warning: InboxDollars not paying — support ghosted me for 3 weeks', 217, 188, 'inboxdollars'],
  ['Prolific waitlist finally opened today', 208, 84, 'prolific'],
  ['Got banned from Swagbucks with $80 pending, no reason given', 193, 221, 'swagbucks'],
  ['AttaPoll quietly added crypto cashout', 142, 38, 'attapoll'],
  ['PrizeRebel 15 years — still paying like clockwork', 130, 44, 'prizerebel'],
  ['Respondent study paid me $150 for one hour', 126, 67, 'respondent'],
  ['Toluna points devaluation megathread', 119, 102, 'toluna'],
  ['YouGov payout took 6 weeks but it arrived', 88, 29, 'yougov'],
  ['Branded Surveys scam or just strict? Account closed at $48', 86, 91, 'branded'],
  ['Five Surveys review after 30 days', 79, 25, 'fiveSurveys']
];

const SUBS = ['beermoney', 'SwagBucks', 'ProlificAc', 'WorkOnline'];

// Demo posts are fictional, so a real post permalink doesn't exist; link to a
// Reddit search for the title in the post's own subreddit instead, which
// surfaces the real threads on the same topic.
function searchPermalink(sub, title) {
  return `/r/${sub}/search/?q=${encodeURIComponent(title)}&restrict_sr=on`;
}

function buildSamplePosts(now = Date.now()) {
  const posts = [];
  let i = 0;
  for (const [title, score, comments] of QUESTION_TITLES) {
    // Spread deterministically across the last 90 days.
    const ageDays = (i * 7 + 2) % 88;
    const subreddit = SUBS[i % SUBS.length];
    posts.push({
      id: `demo-q${i}`,
      title,
      selftext: '',
      score,
      num_comments: comments,
      created_utc: Math.floor(now / 1000) - ageDays * 86400 - i * 3600,
      subreddit,
      permalink: searchPermalink(subreddit, title)
    });
    i++;
  }
  for (const [title, score, comments] of NEUTRAL_TITLES) {
    const ageDays = (i * 11 + 1) % 85;
    const subreddit = SUBS[i % SUBS.length];
    posts.push({
      id: `demo-n${i}`,
      title,
      selftext: '',
      score,
      num_comments: comments,
      created_utc: Math.floor(now / 1000) - ageDays * 86400 - i * 5400,
      subreddit,
      permalink: searchPermalink(subreddit, title)
    });
    i++;
  }
  // A couple of very recent posts so "Rising" has data in demo mode.
  const rising1 = 'Prolific paying double for a huge AI study right now';
  const rising2 = 'Is the new Swagbucks Magic Receipts update worth it?';
  posts.push(
    { id: 'demo-r1', title: rising1, selftext: '', score: 240, num_comments: 75, created_utc: Math.floor(now / 1000) - 8 * 3600, subreddit: 'ProlificAc', permalink: searchPermalink('ProlificAc', rising1) },
    { id: 'demo-r2', title: rising2, selftext: '', score: 95, num_comments: 41, created_utc: Math.floor(now / 1000) - 20 * 3600, subreddit: 'SwagBucks', permalink: searchPermalink('SwagBucks', rising2) }
  );
  return posts;
}

const SAMPLE_SUGGESTIONS = {
  default: [
    'highest paying survey sites', 'survey sites that pay instantly', 'survey sites that pay through paypal',
    'is swagbucks legit', 'prolific surveys', 'beermoney reddit', 'best survey apps 2026',
    'survey junkie review', 'how much can you make doing surveys', 'surveys for gift cards'
  ]
};

module.exports = { buildSamplePosts, SAMPLE_SUGGESTIONS };
