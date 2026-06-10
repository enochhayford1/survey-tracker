'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM = `You are an expert affiliate content writer specializing in the survey/beermoney/side-hustle niche.
Your writing wins because it is honest and experience-based: real numbers, real time investments, real downsides. You never overhype, you disclose affiliate relationships (include a short FTC-compliant disclosure near the top), and you write for search intent — answer the reader's exact question early, then earn the affiliate click with depth and trust.
Style: clear and direct, short paragraphs, markdown with H2/H3 headings, comparison tables where useful, an FAQ section targeting related long-tail questions, and a natural call-to-action where the affiliate link placeholder [AFFILIATE LINK] belongs.`;

const TYPE_INSTRUCTIONS = {
  blog: 'Write a complete, publish-ready SEO blog post in markdown (roughly 1200-1800 words).',
  video: 'Write a complete YouTube video script: a 15-second hook, intro, main sections with natural spoken delivery, b-roll/screen-recording suggestions in [brackets], and an outro with a verbal call-to-action. Include a suggested title and description with the [AFFILIATE LINK] placeholder.',
  email: 'Write a complete email for a beermoney/side-hustle newsletter: subject line, preview text, and a punchy 250-400 word body with one clear call-to-action around [AFFILIATE LINK].'
};

/**
 * Generate a full content draft with Claude. Streams text via onText and
 * resolves with the complete draft. Requires the user's Anthropic API key
 * (set in the app's Settings screen).
 */
async function draftContent({ apiKey, model = 'claude-opus-4-8', topic, site, contentType = 'blog', outline = [], onText }) {
  if (!apiKey) throw new Error('No Claude API key set. Add one under Settings → AI draft writer.');

  const client = new Anthropic({ apiKey });
  const parts = [
    TYPE_INSTRUCTIONS[contentType] || TYPE_INSTRUCTIONS.blog,
    `Topic / target question: ${topic}`
  ];
  if (site) parts.push(`The piece should feature ${site} as the primary recommendation (stay honest about its weaknesses too).`);
  if (outline.length) parts.push(`Follow this outline:\n${outline.map((o) => `- ${o}`).join('\n')}`);
  parts.push('Where specific earnings figures are needed, use realistic ranges and clearly mark anything I must verify before publishing as [VERIFY].');

  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages: [{ role: 'user', content: parts.join('\n\n') }]
  });
  if (onText) stream.on('text', onText);
  const final = await stream.finalMessage();
  return final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (best quality, default)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (faster, cheaper)' }
];

module.exports = { draftContent, MODELS };
