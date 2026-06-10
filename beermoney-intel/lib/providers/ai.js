'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM = `You are an expert affiliate content writer specializing in the survey/beermoney/side-hustle niche.
Your writing wins because it is honest and experience-based: real numbers, real time investments, real downsides. You never overhype, you disclose affiliate relationships (include a short FTC-compliant disclosure near the top), and you write for search intent — answer the reader's exact question early, then earn the affiliate click with depth and trust.
Style: clear and direct, short paragraphs, markdown with H2/H3 headings, comparison tables where useful, an FAQ section targeting related long-tail questions, and a natural call-to-action where the affiliate link placeholder [AFFILIATE LINK] belongs.`;

const ANALYST_SYSTEM = `You are a sharp market analyst for a survey/beermoney affiliate content business. You receive raw community data (trending questions, site mention trends, complaints, watchlist hits) and produce a decisive weekly briefing. Be concrete and opinionated: name the exact pieces of content to make next and why, flag sites that are becoming risky to promote, and call out anything time-sensitive. Markdown format.`;

const TYPE_INSTRUCTIONS = {
  blog: 'Write a complete, publish-ready SEO blog post in markdown (roughly 1200-1800 words).',
  video: 'Write a complete YouTube video script: a 15-second hook, intro, main sections with natural spoken delivery, b-roll/screen-recording suggestions in [brackets], and an outro with a verbal call-to-action. Include a suggested title and description with the [AFFILIATE LINK] placeholder.',
  email: 'Write a complete email for a beermoney/side-hustle newsletter: subject line, preview text, and a punchy 250-400 word body with one clear call-to-action around [AFFILIATE LINK].'
};

/** Build the user prompt for a single content draft (shared by streaming and batch paths). */
function buildDraftPrompt({ topic, site, contentType = 'blog', outline = [] }) {
  const parts = [
    TYPE_INSTRUCTIONS[contentType] || TYPE_INSTRUCTIONS.blog,
    `Topic / target question: ${topic}`
  ];
  if (site) parts.push(`The piece should feature ${site} as the primary recommendation (stay honest about its weaknesses too).`);
  if (outline.length) parts.push(`Follow this outline:\n${outline.map((o) => `- ${o}`).join('\n')}`);
  parts.push('Where specific earnings figures are needed, use realistic ranges and clearly mark anything I must verify before publishing as [VERIFY].');
  return parts.join('\n\n');
}

function textOf(message) {
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

/**
 * Generate a full content draft with Claude. Streams text via onText and
 * resolves with the complete draft. Requires the user's Anthropic API key
 * (set in the app's Settings screen).
 */
async function draftContent({ apiKey, model = 'claude-opus-4-8', topic, site, contentType = 'blog', outline = [], onText }) {
  if (!apiKey) throw new Error('No Claude API key set. Add one under Settings → AI draft writer.');
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages: [{ role: 'user', content: buildDraftPrompt({ topic, site, contentType, outline }) }]
  });
  if (onText) stream.on('text', onText);
  return textOf(await stream.finalMessage());
}

/**
 * Queue many drafts at once through the Message Batches API — 50% of standard
 * token prices, results usually ready within the hour. Returns the batch id.
 */
async function queueDraftBatch({ apiKey, model = 'claude-opus-4-8', items }) {
  if (!apiKey) throw new Error('No Claude API key set. Add one under Settings → AI draft writer.');
  const client = new Anthropic({ apiKey });
  const batch = await client.messages.batches.create({
    requests: items.map((item) => ({
      custom_id: item.id,
      params: {
        model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: SYSTEM,
        messages: [{ role: 'user', content: buildDraftPrompt(item) }]
      }
    }))
  });
  return batch.id;
}

async function draftBatchStatus({ apiKey, batchId }) {
  const client = new Anthropic({ apiKey });
  const batch = await client.messages.batches.retrieve(batchId);
  return { status: batch.processing_status, counts: batch.request_counts };
}

/** Collect results of an ended batch: { [custom_id]: { text } | { error } }. */
async function draftBatchResults({ apiKey, batchId }) {
  const client = new Anthropic({ apiKey });
  const out = {};
  for await (const result of await client.messages.batches.results(batchId)) {
    if (result.result.type === 'succeeded') {
      out[result.custom_id] = { text: textOf(result.result.message) };
    } else {
      out[result.custom_id] = { error: result.result.error?.type || result.result.type };
    }
  }
  return out;
}

/** Turn the app's live market data into an analyst briefing + newsletter draft. */
async function generateBriefing({ apiKey, model = 'claude-opus-4-8', digest, onText }) {
  if (!apiKey) throw new Error('No Claude API key set. Add one under Settings → AI draft writer.');
  const client = new Anthropic({ apiKey });
  const prompt = [
    'Here is this period\'s raw market data from Reddit beermoney communities (JSON):',
    '```json',
    JSON.stringify(digest, null, 1),
    '```',
    `Produce a briefing with these sections:
## Market pulse — 3-5 sentences on what changed and why it matters.
## Make these next — the 3 highest-leverage content pieces to produce now: exact working title, format (blog/video/email), and one-sentence rationale tied to the data.
## Risk watch — sites with complaint momentum I should soften or stop promoting, with evidence.
## Time-sensitive — anything that will be stale in a week if I don't move.
## Newsletter draft — a ready-to-send 200-300 word newsletter email version of the above for my beermoney audience (subject line + body, conversational, one [AFFILIATE LINK] placeholder).`
  ].join('\n');
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: ANALYST_SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });
  if (onText) stream.on('text', onText);
  return textOf(await stream.finalMessage());
}

const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (best quality, default)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (faster, cheaper)' }
];

module.exports = { draftContent, buildDraftPrompt, queueDraftBatch, draftBatchStatus, draftBatchResults, generateBriefing, MODELS };
