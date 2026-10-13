// Simple line icons (24px grid, stroke = currentColor).
const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  records: '<rect x="5" y="3.5" width="14" height="18" rx="2"/><path d="M9 2.5h6v3H9zM9 11h6M9 15h6"/>',
  paw: '<circle cx="6.5" cy="10" r="1.7"/><circle cx="10" cy="6" r="1.7"/><circle cx="14" cy="6" r="1.7"/><circle cx="17.5" cy="10" r="1.7"/><path d="M12 11.5c-2.8 0-5.5 4-5.5 6.3 0 1.5 1.1 2.2 2.6 2.2 1.1 0 1.9-.6 2.9-.6s1.8.6 2.9.6c1.5 0 2.6-.7 2.6-2.2 0-2.3-2.7-6.3-5.5-6.3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  vaccine: '<path d="m18 2 4 4M17 7l3-3M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6"/>',
  flea: '<path d="M8.5 7a3.5 3.5 0 0 1 7 0"/><rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8v12M3 13h4M17 13h4M4 8.5l3 2M20 8.5l-3 2M4 19l3-2M20 19l-3-2"/>',
  deworm: '<path d="M12 22c5.5 0 9-3 9-7.5S17.5 7 12 7"/><path d="M12 2c-5.5 0-9 3-9 7.5S6.5 17 12 17"/>',
  med: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  vet: '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v1.5a5 5 0 0 0 10 0V13"/><circle cx="20" cy="11" r="2"/>',
  task: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
  custom: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  weight: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 9a5.5 5.5 0 0 1 8 0"/><path d="m12 11 1.5-2.5"/>',
  stool: '<path d="M4 20h16"/><path d="M6 20c-1.5 0-2.5-1-2.5-2.5S5 15 6.5 15h11c1.5 0 3 1 3 2.5S19.5 20 18 20"/><path d="M8 15c-1 0-2-.8-2-2s1-2 2.5-2h7c1.5 0 2.5.8 2.5 2s-1 2-2 2"/><path d="M9.5 11c0-2 1.5-4 4-6 .5 2 1 3.5 1 6"/>',
  eyes: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  asthma: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  appetite: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M17 3c-2 0-3 2-3 6s1 4 3 4v8"/>',
  urination: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  food: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M12 11V7M8 11V8M16 11V8"/>',
  symptoms: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  medical: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  report: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
};

export function icon(name, cls = '') {
  const d = PATHS[name] ?? PATHS.custom;
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
