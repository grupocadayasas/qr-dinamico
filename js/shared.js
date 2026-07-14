export function clean(value = '') {
  return String(value ?? '').trim();
}

export function initials(firstName = '', lastName = '') {
  const parts = `${clean(firstName)} ${clean(lastName)}`.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'QR';
  return `${parts[0][0] || ''}${parts.length > 1 ? parts.at(-1)[0] : ''}`.toUpperCase();
}

export function fullName(contact) {
  return `${clean(contact.first_name)} ${clean(contact.last_name)}`.trim() || 'Contacto';
}

export function slugify(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function randomToken(length = 5) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => chars[byte % chars.length]).join('');
}

export function normalizePhone(value = '') {
  return clean(value).replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

export function normalizeWhatsApp(value = '') {
  return clean(value).replace(/\D/g, '');
}

export function safeWebsite(value = '') {
  const url = clean(value);
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function escapeVcard(value = '') {
  return clean(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function buildVcard(contact) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVcard(contact.last_name)};${escapeVcard(contact.first_name)};;;`,
    `FN:${escapeVcard(fullName(contact))}`,
  ];

  if (clean(contact.company)) lines.push(`ORG:${escapeVcard(contact.company)}`);
  if (clean(contact.job_title)) lines.push(`TITLE:${escapeVcard(contact.job_title)}`);
  if (clean(contact.mobile)) lines.push(`TEL;TYPE=CELL:${escapeVcard(normalizePhone(contact.mobile))}`);
  if (clean(contact.phone)) lines.push(`TEL;TYPE=WORK,VOICE:${escapeVcard(normalizePhone(contact.phone))}`);
  if (clean(contact.email)) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVcard(contact.email)}`);
  if (clean(contact.website)) lines.push(`URL:${escapeVcard(safeWebsite(contact.website))}`);
  if (clean(contact.address)) lines.push(`ADR;TYPE=WORK:;;${escapeVcard(contact.address)};;;;`);
  if (clean(contact.photo_url)) lines.push(`PHOTO;VALUE=URI:${escapeVcard(contact.photo_url)}`);
  if (clean(contact.notes)) lines.push(`NOTE:${escapeVcard(contact.notes)}`);

  lines.push(`REV:${new Date().toISOString()}`, 'END:VCARD');
  return lines.join('\r\n');
}

export function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadVcard(contact) {
  const filename = `${slugify(fullName(contact)) || 'contacto'}.vcf`;
  downloadTextFile(buildVcard(contact), filename, 'text/vcard;charset=utf-8');
}
