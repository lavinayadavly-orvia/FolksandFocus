import { ARCHETYPES } from './models.mjs';
export function aggregateArchetypes(records, now = new Date()) {
  const start = new Date(now.getTime() - 90 * 86400000);
  const unique = new Map();
  for (const row of records) {
    const time = new Date(row.timestamp);
    if (time >= start && time <= now) unique.set(`${row.platform}:${row.post_id}`, row);
  }
  const counts = Object.fromEntries(ARCHETYPES.map(a => [a, 0]));
  for (const row of unique.values()) if (ARCHETYPES.includes(row.extracted_archetype)) counts[row.extracted_archetype]++;
  const total = unique.size;
  const distribution = Object.fromEntries(ARCHETYPES.map(a => [a, total ? counts[a] / total : 0]));
  const ranked = ARCHETYPES.filter(a => counts[a] > 0).sort((a, b) => counts[b] - counts[a]);
  return { window_start: start.toISOString(), window_end: now.toISOString(), posts_in_window: total,
    classified_posts: Object.values(counts).reduce((a, b) => a + b, 0), archetype_distribution: distribution,
    primary_behavioral_archetype: ranked[0] ?? null,
    secondary_behavioral_archetype: ranked[1] && distribution[ranked[1]] > .25 ? ranked[1] : null,
    tied_primary: ranked.length > 1 && counts[ranked[0]] === counts[ranked[1]],
    denominator: 'All successfully extracted posts in the publication-time window, including out-of-scope posts' };
}
