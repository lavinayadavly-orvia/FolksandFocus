const assets = new Set([
  'publication-analytics.mjs', 'publication-analytics-ui.mjs', 'publication-resolution.mjs',
  'reported-experience.mjs',
  'geography.mjs', 'geography-ui.mjs', 'location-reviews.mjs',
  'listening-analytics.mjs',
  'voice-dashboard.mjs', 'voice-dashboard-ui.mjs', 'analytics-ui.mjs',
  'listening-evidence.mjs', 'listening-refresh.mjs',
  'statement-quality.mjs',
  'source-review.mjs', 'social-identity.mjs',
  'index.html', 'styles.css', 'workspace.css', 'persona.css', 'app.js', 'coverage.js',
  'persona-ui.mjs', 'persona-model.mjs', 'listening.css', 'listening-ui.mjs', 'listening-data.mjs', 'experience.mjs', 'source-library.mjs',
  'favicon.png', 'folksandfocus-logo-light.png', 'folksandfocus-logo-dark.png', 'folksandfocus-mark.png',
  'watercolor-paper.png', 'welcome-physicians-voices.png'
]);
export function publicAsset(pathname) {
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  return assets.has(name) ? name : null;
}
