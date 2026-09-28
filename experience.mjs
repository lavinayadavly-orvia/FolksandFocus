export const EXPERIENCE_TIERS = Object.freeze([
  { id: 'Trailblazer', label: 'Trailblazers', min: 35, max: null },
  { id: 'Trendsetter', label: 'Trendsetters', min: 25, max: 34 },
  { id: 'Rising_Star', label: 'Rising Stars', min: 18, max: 24 },
  { id: 'Frontline_Fair', label: 'Frontline Fair', min: 10, max: 17 },
  { id: 'Early_Spark', label: 'Early Sparks', min: 0, max: 9 }
]);

export function experienceTier(registrationYear, now = new Date()) {
  const year = now.getUTCFullYear();
  if (!Number.isInteger(registrationYear) || registrationYear < 1950 || registrationYear > year) return null;
  const years = year - registrationYear;
  return { years, ...EXPERIENCE_TIERS.find(t => years >= t.min && (t.max === null || years <= t.max)) };
}

export function verifiedExperience(profile, now = new Date()) {
  if (profile?.verification_status !== 'VERIFIED' || !profile.registration_source_url || !profile.verified_by || !profile.verified_at) return null;
  return experienceTier(profile.medical_registration_year, now);
}
