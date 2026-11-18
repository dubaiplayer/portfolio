/**
 * Derives the EVIDENCE behind the skills list — not the list itself.
 *
 * `profile.skills` stays hand-authored, deliberately. projects.js `tech` is a
 * build manifest, not a skills claim: deriving the list from it would put
 * "React Router" and "Chrome Extension" on the page as peers of "Python", with
 * no ordering and no room for anything used outside these four repos. More
 * decisively, buildProfileBlock() and the indexed bio chunk both read
 * profile.skills — if this page derived and the prompt did not, the page and
 * the chatbot would answer "what are his strongest skills?" differently, which
 * is the exact drift this codebase is built to prevent.
 *
 * What IS worth deriving is the link between a claimed skill and the projects
 * that demonstrate it, plus the inverse: technology shipped in a project that
 * the skills list never claims. That gap is real today.
 *
 * Same plain-data rule as its imports: no JSX, no assets, Node-importable.
 */
import { projects } from './projects.js'
import { profile } from './profile.js'

/** "Node.js" / "node" / "NODE" must all collapse to one key. */
const ALIASES = {
  'node.js': 'node',
  'nodejs': 'node',
  'js': 'javascript',
  'ts': 'typescript',
  'react.js': 'react',
  'reactjs': 'react',
}

export function normaliseTech(s) {
  const k = String(s).toLowerCase().trim()
  return ALIASES[k] ?? k
}

/** Every skill the profile claims, normalised, as a Set. */
function claimedSkills() {
  const out = new Set()
  for (const list of Object.values(profile.skills || {})) {
    for (const s of list || []) out.add(normaliseTech(s))
  }
  return out
}

/**
 * skill (normalised) -> [{ id, title }]  — which projects demonstrate it.
 * Module-scope, computed once per page load, same as suggestions.js.
 */
export const skillEvidence = (() => {
  const map = new Map()
  for (const p of projects) {
    for (const t of p.tech || []) {
      const k = normaliseTech(t)
      if (!map.has(k)) map.set(k, [])
      if (!map.get(k).some((x) => x.id === p.id)) {
        map.get(k).push({ id: p.id, title: p.title })
      }
    }
  }
  return map
})()

/** Look up evidence for a displayed (un-normalised) skill name. */
export function evidenceFor(skill) {
  return skillEvidence.get(normaliseTech(skill)) || []
}

/**
 * Technology that ships in a project but which profile.skills never claims.
 * Surfaced on the page rather than hidden: it is real, demonstrable work, and
 * leaving it invisible is how a portfolio accidentally understates itself.
 */
export const unclaimedTech = (() => {
  const claimed = claimedSkills()
  const counts = new Map()
  const label = new Map()
  for (const p of projects) {
    for (const t of p.tech || []) {
      const k = normaliseTech(t)
      if (claimed.has(k)) continue
      counts.set(k, (counts.get(k) || 0) + 1)
      if (!label.has(k)) label.set(k, t) // keep the author's own capitalisation
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || label.get(a[0]).localeCompare(label.get(b[0])))
    .map(([k, count]) => ({ tech: label.get(k), count }))
})()

/** Skills the profile claims that no project demonstrates. Drives an ingest warning. */
export const unevidencedSkills = (() => {
  const out = []
  for (const [group, list] of Object.entries(profile.skills || {})) {
    for (const s of list || []) {
      if (!skillEvidence.has(normaliseTech(s))) out.push({ skill: s, group })
    }
  }
  return out
})()
