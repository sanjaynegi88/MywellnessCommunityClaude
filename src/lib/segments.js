// Rule-based automatic segmentation. Recomputed whenever a contact changes and hourly.
function engagementBand(c) { const e = Number(c.engagement) || 0; return e >= 60 ? 'High engagement' : e >= 25 ? 'Medium engagement' : 'Low engagement'; }
function isEmailable(c) { return !!(c.consentEmail && !c.suppressed && c.stage !== 'Unsubscribed' && /@/.test(c.email || '')); }
function segmentsOf(c) {
  const s = [];
  if (c.vertical === 'Nutra' || c.vertical === 'Both') s.push('Nutra wellness');
  if (c.vertical === 'Pet' || c.vertical === 'Both') s.push('Pet wellness');
  if (c.country === 'USA') s.push('Market: USA'); else if (c.country === 'UK') s.push('Market: UK'); else if (c.country) s.push('Market: Europe/Other');
  s.push(engagementBand(c));
  for (const i of c.interests || []) s.push('Interest: ' + String(i).toLowerCase());
  if (isEmailable(c)) s.push('Emailable');
  if (c.stage === 'Dormant') s.push('Re-engagement');
  if (c.followUp && c.followUp <= new Date().toISOString().slice(0, 10)) s.push('Follow-up due');
  return s;
}
/** MailerLite group names: one per segment worth emailing. */
function emailGroupsOf(c) { return segmentsOf(c).filter(s => s !== 'Emailable' && s !== 'Follow-up due'); }
module.exports = { segmentsOf, emailGroupsOf, isEmailable, engagementBand };
