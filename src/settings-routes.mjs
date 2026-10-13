export const DESTINATIONS = Object.freeze([
  { id: 'notes', label: 'Notes & navigation' },
  { id: 'calendar', label: 'Calendar & reminders' },
  { id: 'health', label: 'Health' },
  { id: 'finances', label: 'Finances' },
  { id: 'connections', label: 'Connections & AI' }
].map(destination => Object.freeze(destination)));

export function searchSettings(sections, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return sections.filter(section => {
    const text = [section.label, ...section.keywords].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
