'use strict';

// Seed database of popular survey / beermoney sites.
// `aliases` are the strings matched (word-boundary, case-insensitive) when
// counting mentions in Reddit posts; keep them lowercase.
const SEED_SITES = [
  { id: 'swagbucks', name: 'Swagbucks', aliases: ['swagbucks', 'swag bucks', 'sb'], category: 'GPT', minPayout: '$3 (gift card)', payoutMethods: 'PayPal, gift cards', referral: '10% of referral earnings for life', url: 'https://www.swagbucks.com', notes: '' },
  { id: 'prolific', name: 'Prolific', aliases: ['prolific'], category: 'Academic surveys', minPayout: '£6 / ~$8', payoutMethods: 'PayPal', referral: 'No public referral program', url: 'https://www.prolific.com', notes: 'Highest hourly rates; waitlist for new joiners at times.' },
  { id: 'surveyjunkie', name: 'Survey Junkie', aliases: ['survey junkie', 'surveyjunkie'], category: 'Surveys', minPayout: '$5', payoutMethods: 'PayPal, bank, gift cards', referral: 'Varies by campaign', url: 'https://www.surveyjunkie.com', notes: '' },
  { id: 'inboxdollars', name: 'InboxDollars', aliases: ['inboxdollars', 'inbox dollars'], category: 'GPT', minPayout: '$15', payoutMethods: 'PayPal, check, gift cards', referral: '$1 per signup + 30% of earnings', url: 'https://www.inboxdollars.com', notes: '' },
  { id: 'mypoints', name: 'MyPoints', aliases: ['mypoints', 'my points'], category: 'GPT / cashback', minPayout: '$3 (gift card)', payoutMethods: 'PayPal, gift cards', referral: '10% of referral earnings', url: 'https://www.mypoints.com', notes: 'Owned by Prodege (Swagbucks).' },
  { id: 'freecash', name: 'Freecash', aliases: ['freecash', 'free cash'], category: 'GPT / offerwalls', minPayout: '$2-5', payoutMethods: 'PayPal, crypto, gift cards', referral: '5% of referral earnings', url: 'https://freecash.com', notes: '' },
  { id: 'prizerebel', name: 'PrizeRebel', aliases: ['prizerebel', 'prize rebel'], category: 'GPT', minPayout: '$2', payoutMethods: 'PayPal, gift cards', referral: 'Up to 30% of earnings', url: 'https://www.prizerebel.com', notes: '' },
  { id: 'ysense', name: 'ySense', aliases: ['ysense', 'y sense', 'clixsense'], category: 'GPT', minPayout: '$5-10', payoutMethods: 'PayPal, Payoneer, gift cards', referral: 'Tiered commissions', url: 'https://www.ysense.com', notes: '' },
  { id: 'branded', name: 'Branded Surveys', aliases: ['branded surveys', 'branded survey'], category: 'Surveys', minPayout: '$5', payoutMethods: 'PayPal, bank, gift cards', referral: 'Points per active referral', url: 'https://surveys.gobranded.com', notes: '' },
  { id: 'pinecone', name: 'Pinecone Research', aliases: ['pinecone research', 'pinecone'], category: 'Surveys', minPayout: '$3 per survey', payoutMethods: 'PayPal, check, gift cards', referral: 'Invite-only panel', url: 'https://www.pineconeresearch.com', notes: 'Fixed $3/survey; invite links convert well.' },
  { id: 'toluna', name: 'Toluna', aliases: ['toluna'], category: 'Surveys', minPayout: 'Varies', payoutMethods: 'PayPal, gift cards', referral: '500 points per referral (varies)', url: 'https://www.toluna.com', notes: '' },
  { id: 'lifepoints', name: 'LifePoints', aliases: ['lifepoints', 'life points'], category: 'Surveys', minPayout: '$5', payoutMethods: 'PayPal, gift cards', referral: 'Varies', url: 'https://www.lifepointspanel.com', notes: '' },
  { id: 'yougov', name: 'YouGov', aliases: ['yougov', 'you gov'], category: 'Surveys / polls', minPayout: '$15', payoutMethods: 'PayPal, gift cards', referral: 'Points per referral', url: 'https://today.yougov.com', notes: '' },
  { id: 'mistplay', name: 'Mistplay', aliases: ['mistplay'], category: 'Game rewards', minPayout: '$5 (gift card)', payoutMethods: 'Gift cards', referral: 'In-app referral codes', url: 'https://www.mistplay.com', notes: 'Android only.' },
  { id: 'kashkick', name: 'KashKick', aliases: ['kashkick', 'kash kick'], category: 'GPT / offers', minPayout: '$10', payoutMethods: 'PayPal', referral: '25% of earnings (varies)', url: 'https://www.kashkick.com', notes: '' },
  { id: 'qmee', name: 'Qmee', aliases: ['qmee'], category: 'Surveys / search', minPayout: 'No minimum', payoutMethods: 'PayPal, gift cards', referral: '$1 per active referral', url: 'https://www.qmee.com', notes: 'No minimum cashout is a strong selling point.' },
  { id: 'attapoll', name: 'AttaPoll', aliases: ['attapoll', 'atta poll'], category: 'Surveys (mobile)', minPayout: '$3', payoutMethods: 'PayPal, crypto, charity', referral: '10% of referral earnings', url: 'https://attapoll.app', notes: '' },
  { id: 'usertesting', name: 'UserTesting', aliases: ['usertesting', 'user testing'], category: 'User tests', minPayout: '$10 per test', payoutMethods: 'PayPal', referral: 'No public program', url: 'https://www.usertesting.com', notes: '$10 per 20-min test; selective screening.' },
  { id: 'respondent', name: 'Respondent', aliases: ['respondent.io', 'respondent'], category: 'Research studies', minPayout: 'Per study ($50+)', payoutMethods: 'PayPal', referral: '$20-50 per referred participant (varies)', url: 'https://www.respondent.io', notes: 'High-paying professional studies.' },
  { id: 'honeygain', name: 'Honeygain', aliases: ['honeygain', 'honey gain'], category: 'Passive (bandwidth)', minPayout: '$20', payoutMethods: 'PayPal, crypto', referral: '10% of referral earnings', url: 'https://www.honeygain.com', notes: 'Passive income angle pairs well with survey content.' },
  { id: 'pawns', name: 'Pawns.app', aliases: ['pawns.app', 'pawns'], category: 'Passive + surveys', minPayout: '$5', payoutMethods: 'PayPal, crypto, gift cards', referral: '10% of referral earnings', url: 'https://pawns.app', notes: '' },
  { id: 'cointiply', name: 'Cointiply', aliases: ['cointiply'], category: 'Crypto GPT', minPayout: '~$3 in crypto', payoutMethods: 'Bitcoin, altcoins', referral: '25% of faucet + 10% offers', url: 'https://cointiply.com', notes: '' },
  { id: 'fiveSurveys', name: 'Five Surveys', aliases: ['five surveys', 'fivesurveys', '5 surveys'], category: 'Surveys', minPayout: '$5 (after 5 surveys)', payoutMethods: 'PayPal, gift cards', referral: 'Varies', url: 'https://fivesurveys.com', notes: 'Flat $1/survey model.' },
  { id: 'mturk', name: 'Amazon Mechanical Turk', aliases: ['mturk', 'mechanical turk'], category: 'Microtasks', minPayout: '$1', payoutMethods: 'Bank transfer, Amazon credit', referral: 'None', url: 'https://www.mturk.com', notes: '' }
];

module.exports = { SEED_SITES };
