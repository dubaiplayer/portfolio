/**
 * Starter questions shown in the chat panel's empty state.
 *
 * Derived from projects.js / profile.js at module scope (once per page load) so
 * they can never go stale when a project is added or renamed. Deliberately NOT
 * shuffled — a stable set is easier to reason about, and reshuffling on every
 * mount makes the empty state feel jittery.
 *
 * Same plain-data rule as its imports: no JSX, no assets.
 */
import { projects, sortedProjects } from './projects.js';
import { profile } from './profile.js';

/**
 * Most frequently used technology across all projects, or null if none listed yet.
 * Ties break by first appearance, not alphabetically — authors list the technology
 * they consider primary first, and "RAG" beating "React" on an alphabetical
 * tiebreak reads as a bug to everyone except the sort function.
 */
function mostCommonTech() {
  const counts = new Map();
  const firstSeen = new Map();
  let seq = 0;
  for (const p of projects) {
    for (const t of p.tech || []) {
      counts.set(t, (counts.get(t) || 0) + 1);
      if (!firstSeen.has(t)) firstSeen.set(t, seq++);
    }
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || firstSeen.get(a[0]) - firstSeen.get(b[0])
  )[0][0];
}

/** Skip scaffolding entries so the empty state never advertises a TODO. */
function isRealProject(p) {
  return !/^TODO/i.test(p.tagline || '') && !/^Example Project/i.test(p.title || '');
}

function build() {
  const out = [];
  const real = sortedProjects().filter(isRealProject);
  const lead = real[0];
  const firstName = profile.name.split(' ')[0];

  if (lead) out.push(`Tell me about ${lead.title}`);

  const tech = mostCommonTech();
  if (tech) out.push(`What has ${firstName} built with ${tech}?`);

  if (real.length > 1) out.push('Which project was the most challenging?');

  // "How do I get in touch?" stays last — it's the one we always want visible.
  out.push('How do I get in touch?');

  const filler = [`What is ${firstName} working on right now?`, 'What are his strongest skills?'];
  while (out.length < 4 && filler.length) out.splice(out.length - 1, 0, filler.shift());

  return out.slice(0, 4);
}

export const starterQuestions = build();

export default starterQuestions;
