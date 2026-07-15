import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { clean, downloadVcard, fullName, initials, normalizePhone, normalizeWhatsApp, safeWebsite } from './shared.js';

const CADAYA_INSTAGRAM_URL = 'https://www.instagram.com/grupo_cadaya_s.a.s/';

const elements = {
  loadingCard: document.querySelector('#loadingCard'),
  errorCard: document.querySelector('#errorCard'),
  errorText: document.querySelector('#errorText'),
  contactCard: document.querySelector('#contactCard'),
  cadayaBrandBanner: document.querySelector('#cadayaBrandBanner'),
  publicPhoto: document.querySelector('#publicPhoto'),
  publicInitials: document.querySelector('#publicInitials'),
  publicCompany: document.querySelector('#publicCompany'),
  publicName: document.querySelector('#publicName'),
  publicJobTitle: document.querySelector('#publicJobTitle'),
  callButton: document.querySelector('#callButton'),
  whatsappButton: document.querySelector('#whatsappButton'),
  saveContactButton: document.querySelector('#saveContactButton'),
  shareButton: document.querySelector('#shareButton'),
  mobileRow: document.querySelector('#mobileRow'),
  mobileLink: document.querySelector('#mobileLink'),
  phoneRow: document.querySelector('#phoneRow'),
  phoneLink: document.querySelector('#phoneLink'),
  emailRow: document.querySelector('#emailRow'),
  emailLink: document.querySelector('#emailLink'),
  websiteRow: document.querySelector('#websiteRow'),
  websiteLink: document.querySelector('#websiteLink'),
  addressRow: document.querySelector('#addressRow'),
  addressLink: document.querySelector('#addressLink'),
  instagramRow: document.querySelector('#instagramRow'),
  instagramLink: document.querySelector('#instagramLink'),
  notesRow: document.querySelector('#notesRow'),
  notesText: document.querySelector('#notesText'),
};

let contact = null;

function showError(message) {
  elements.loadingCard.classList.add('hidden');
  elements.contactCard.classList.add('hidden');
  elements.errorCard.classList.remove('hidden');
  elements.errorText.textContent = message;
}

function setOptionalRow(row, value, callback) {
  row.classList.toggle('hidden', !clean(value));
  if (clean(value)) callback();
}

function render(data) {
  contact = data;
  const accent = data.accent_color || '#b51f2e';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-dark', accent);
  document.querySelector('meta[name="theme-color"]').content = accent;
  document.title = `${fullName(data)} | Contacto`;

  elements.publicCompany.textContent = data.company || 'Contacto profesional';
  elements.publicName.textContent = fullName(data);
  elements.publicJobTitle.textContent = data.job_title || '';
  elements.publicInitials.textContent = initials(data.first_name, data.last_name);
  elements.publicInitials.style.background = accent;

  const isCadaya = /cadaya/i.test(data.company || '');
  elements.cadayaBrandBanner.classList.toggle('hidden', !isCadaya);
  elements.instagramRow.classList.toggle('hidden', !isCadaya);
  if (isCadaya) elements.instagramLink.href = CADAYA_INSTAGRAM_URL;

  if (clean(data.photo_url)) {
    elements.publicPhoto.src = data.photo_url;
    elements.publicPhoto.classList.remove('hidden');
    elements.publicInitials.classList.add('hidden');
    elements.publicPhoto.addEventListener('error', () => {
      elements.publicPhoto.classList.add('hidden');
      elements.publicInitials.classList.remove('hidden');
    }, { once: true });
  }

  const mobile = normalizePhone(data.mobile);
  elements.callButton.href = `tel:${mobile}`;
  elements.mobileLink.href = `tel:${mobile}`;
  elements.mobileLink.textContent = data.mobile;

  const whatsapp = normalizeWhatsApp(data.whatsapp || data.mobile);
  if (whatsapp) {
    elements.whatsappButton.href = `https://wa.me/${whatsapp}`;
    elements.whatsappButton.classList.remove('hidden');
  }

  setOptionalRow(elements.phoneRow, data.phone, () => {
    elements.phoneLink.href = `tel:${normalizePhone(data.phone)}`;
    elements.phoneLink.textContent = data.phone;
  });
  setOptionalRow(elements.emailRow, data.email, () => {
    elements.emailLink.href = `mailto:${data.email}`;
    elements.emailLink.textContent = data.email;
  });
  setOptionalRow(elements.websiteRow, data.website, () => {
    elements.websiteLink.href = safeWebsite(data.website);
    elements.websiteLink.textContent = data.website.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  });
  setOptionalRow(elements.addressRow, data.address, () => {
    elements.addressLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean(data.address))}`;
    elements.addressLink.textContent = data.address;
    elements.addressLink.setAttribute('aria-label', `Abrir ${data.address} en Google Maps`);
  });
  setOptionalRow(elements.notesRow, data.notes, () => { elements.notesText.textContent = data.notes; });

  elements.saveContactButton.addEventListener('click', () => downloadVcard(contact));
  if (navigator.share) {
    elements.shareButton.classList.remove('hidden');
    elements.shareButton.addEventListener('click', async () => {
      try {
        await navigator.share({
          title: fullName(contact),
          text: `${fullName(contact)} · ${contact.job_title || ''} · ${contact.company || ''}`,
          url: window.location.href,
        });
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      }
    });
  }

  elements.loadingCard.classList.add('hidden');
  elements.contactCard.classList.remove('hidden');
}

async function init() {
  const configured = !SUPABASE_URL.includes('PEGA_AQUI') && !SUPABASE_ANON_KEY.includes('PEGA_AQUI');
  if (!configured) {
    showError('La aplicación todavía no está conectada con Supabase.');
    return;
  }

  const slug = clean(new URLSearchParams(window.location.search).get('c'));
  if (!slug) {
    showError('El enlace no contiene un identificador de contacto.');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    showError('No fue posible consultar el contacto.');
    return;
  }
  if (!data) {
    showError('El contacto no existe o fue desactivado.');
    return;
  }

  render(data);
}

init();
