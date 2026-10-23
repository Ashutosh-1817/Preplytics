export const ANNOTATION_COLORS = [
  { id: 'yellow', label: 'Yellow', fill: 'rgba(250, 204, 21, 0.45)', solid: '#facc15' },
  { id: 'green', label: 'Green', fill: 'rgba(74, 222, 128, 0.42)', solid: '#4ade80' },
  { id: 'blue', label: 'Blue', fill: 'rgba(96, 165, 250, 0.42)', solid: '#60a5fa' },
  { id: 'pink', label: 'Pink', fill: 'rgba(244, 114, 182, 0.42)', solid: '#f472b6' },
  { id: 'orange', label: 'Orange', fill: 'rgba(251, 146, 60, 0.42)', solid: '#fb923c' },
];

export const colorOf = (id) => ANNOTATION_COLORS.find((c) => c.id === id) || ANNOTATION_COLORS[0];