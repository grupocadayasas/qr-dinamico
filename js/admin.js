import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, PUBLIC_BASE_URL } from './config.js';
import { clean, downloadVcard, fullName, initials, randomToken, slugify } from './shared.js';

const configured = !SUPABASE_URL.includes('PEGA_AQUI') && !SUPABASE_ANON_KEY.includes('PEGA_AQUI');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const elements = {
  setupNotice: document.querySelector('#setupNotice'),
  loginView: document.querySelector('#loginView'),
  appView: document.querySelector('#appView'),
  logoutButton: document.querySelector('#logoutButton'),
  loginForm: document.querySelector('#loginForm'),
  loginEmail: document.querySelector('#loginEmail'),
  loginPassword: document.querySelector('#loginPassword'),
  loginMessage: document.querySelector('#loginMessage'),
  contactsList: document.querySelector('#contactsList'),
  searchInput: document.querySelector('#searchInput'),
  newContactButton: document.querySelector('#newContactButton'),
  contactForm: document.querySelector('#contactForm'),
  editorTitle: document.querySelector('#editorTitle'),
  saveStatus: document.querySelector('#saveStatus'),
  formMessage: document.querySelector('#formMessage'),
  deleteButton: document.querySelector('#deleteButton'),
  contactId: document.querySelector('#contactId'),
  contactSlug: document.querySelector('#contactSlug'),
  firstName: document.querySelector('#firstName'),
  lastName: document.querySelector('#lastName'),
  company: document.querySelector('#company'),
  jobTitle: document.querySelector('#jobTitle'),
  mobile: document.querySelector('#mobile'),
  phone: document.querySelector('#phone'),
  email: document.querySelector('#email'),
  website: document.querySelector('#website'),
  address: document.querySelector('#address'),
  whatsapp: document.querySelector('#whatsapp'),
  accentColor: document.querySelector('#accentColor'),
  photoUrl: document.querySelector('#photoUrl'),
  notes: document.querySelector('#notes'),
  isActive: document.querySelector('#isActive'),
  qrCanvas: document.querySelector('#qrCanvas'),
  publicUrl: document.querySelector('#publicUrl'),
  previewAvatar: document.querySelector('#previewAvatar'),
  previewName: document.querySelector('#previewName'),
  previewRole: document.querySelector('#previewRole'),
  copyUrlButton: document.querySelector('#copyUrlButton'),
  downloadQrButton: document.querySelector('#downloadQrButton'),
  openCardButton: document.querySelector('#openCardButton'),
  downloadVcardButton: document.querySelector('#downloadVcardButton'),
};

let contacts = [];
let activeContactId = null;
let currentUserId = null;
let qrRenderCounter = 0;
const CADAYA_LOGO_URL = new URL('../assets/logo-cadaya.png', import.meta.url).href;
let cadayaLogoPromise = null;

function publicBaseUrl() {
  if (clean(PUBLIC_BASE_URL)) return clean(PUBLIC_BASE_URL).replace(/\/$/, '');
  const current = new URL(window.location.href);
  current.hash = '';
  current.search = '';
  current.pathname = current.pathname.replace(/\/[^/]*$/, '');
  return current.href.replace(/\/$/, '');
}

function contactPublicUrl(slug) {
  return `${publicBaseUrl()}/contact.html?c=${encodeURIComponent(slug || 'vista-previa')}`;
}

function formData() {
  return {
    id: clean(elements.contactId.value) || undefined,
    slug: clean(elements.contactSlug.value),
    first_name: clean(elements.firstName.value),
    last_name: clean(elements.lastName.value),
    company: clean(elements.company.value),
    job_title: clean(elements.jobTitle.value),
    mobile: clean(elements.mobile.value),
    phone: clean(elements.phone.value),
    email: clean(elements.email.value),
    website: clean(elements.website.value),
    address: clean(elements.address.value),
    whatsapp: clean(elements.whatsapp.value),
    accent_color: elements.accentColor.value || '#b51f2e',
    photo_url: clean(elements.photoUrl.value),
    notes: clean(elements.notes.value),
    is_active: elements.isActive.checked,
  };
}

function makeSlug(contact) {
  const base = slugify(`${contact.first_name}-${contact.last_name}-${contact.company}`) || 'contacto';
  return `${base}-${randomToken()}`;
}

function setMessage(element, message = '', isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function setSavedState(saved) {
  elements.saveStatus.textContent = saved ? 'Guardado' : 'Sin guardar';
  elements.saveStatus.classList.toggle('saved', saved);
}

function setAccent(color = '#b51f2e') {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-dark', color);
}

async function drawQr() {
  const currentCall = ++qrRenderCounter;
  const contact = formData();
  if (!contact.slug) contact.slug = makeSlug(contact);
  const url = contactPublicUrl(contact.slug);
  elements.publicUrl.value = url;
  elements.previewName.textContent = fullName(contact) === 'Contacto' ? 'Nuevo contacto' : fullName(contact);
  elements.previewRole.textContent = [contact.job_title, contact.company].filter(Boolean).join(' · ') || 'Cargo · Empresa';
  elements.previewAvatar.textContent = initials(contact.first_name, contact.last_name);
  elements.previewAvatar.style.background = contact.accent_color;
  setAccent(contact.accent_color);

  try {
    await QRCode.toCanvas(elements.qrCanvas, url, {
      width: 720,
      margin: 3,
      errorCorrectionLevel: 'H',
      color: { dark: contact.accent_color, light: '#ffffff' },
    });
    if (currentCall !== qrRenderCounter) return;
    await addQrCenterBadge(contact);
  } catch (error) {
    console.error(error);
  }
}

async function loadCadayaLogo() {
  if (!cadayaLogoPromise) {
    cadayaLogoPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No fue posible cargar el logo de Cadaya.'));
      image.src = CADAYA_LOGO_URL;
    });
  }
  return cadayaLogoPromise;
}

async function addQrCenterBadge(contact) {
  const canvas = elements.qrCanvas;
  const ctx = canvas.getContext('2d');
  const badgeSize = canvas.width * 0.205;
  const logoSize = canvas.width * 0.165;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const x = centerX - badgeSize / 2;
  const y = centerY - badgeSize / 2;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, badgeSize / 2, 0, Math.PI * 2);
  ctx.fill();

  const isCadaya = /cadaya/i.test(contact.company || '');
  if (isCadaya) {
    try {
      const logo = await loadCadayaLogo();
      ctx.drawImage(
        logo,
        centerX - logoSize / 2,
        centerY - logoSize / 2,
        logoSize,
        logoSize
      );
      ctx.restore();
      return;
    } catch (error) {
      console.warn(error);
    }
  }

  ctx.fillStyle = contact.accent_color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, badgeSize * 0.40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(badgeSize * 0.28)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials(contact.first_name, contact.last_name), centerX, centerY + 2);
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function resetForm() {
  activeContactId = null;
  elements.contactForm.reset();
  elements.contactId.value = '';
  elements.contactSlug.value = makeSlug({ first_name: '', last_name: '', company: '' });
  elements.accentColor.value = '#b51f2e';
  elements.isActive.checked = true;
  elements.editorTitle.textContent = 'Nuevo contacto';
  elements.deleteButton.classList.add('hidden');
  setMessage(elements.formMessage);
  setSavedState(false);
  renderContacts();
  drawQr();
}

function loadIntoForm(contact) {
  activeContactId = contact.id;
  elements.contactId.value = contact.id;
  elements.contactSlug.value = contact.slug;
  elements.firstName.value = contact.first_name || '';
  elements.lastName.value = contact.last_name || '';
  elements.company.value = contact.company || '';
  elements.jobTitle.value = contact.job_title || '';
  elements.mobile.value = contact.mobile || '';
  elements.phone.value = contact.phone || '';
  elements.email.value = contact.email || '';
  elements.website.value = contact.website || '';
  elements.address.value = contact.address || '';
  elements.whatsapp.value = contact.whatsapp || '';
  elements.accentColor.value = contact.accent_color || '#b51f2e';
  elements.photoUrl.value = contact.photo_url || '';
  elements.notes.value = contact.notes || '';
  elements.isActive.checked = contact.is_active !== false;
  elements.editorTitle.textContent = fullName(contact);
  elements.deleteButton.classList.remove('hidden');
  setMessage(elements.formMessage);
  setSavedState(true);
  renderContacts();
  drawQr();
}

function renderContacts() {
  const term = clean(elements.searchInput.value).toLowerCase();
  const filtered = contacts.filter(contact =>
    `${fullName(contact)} ${contact.company || ''} ${contact.job_title || ''}`.toLowerCase().includes(term)
  );

  if (!filtered.length) {
    elements.contactsList.innerHTML = '<div class="empty-state">No hay contactos para mostrar.</div>';
    return;
  }

  elements.contactsList.innerHTML = '';
  filtered.forEach(contact => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `contact-list-item${contact.id === activeContactId ? ' active' : ''}`;
    button.innerHTML = `
      <span class="contact-list-avatar" style="background:${contact.accent_color || '#b51f2e'}">${initials(contact.first_name, contact.last_name)}</span>
      <span><strong></strong><span></span></span>
    `;
    button.querySelector('strong').textContent = fullName(contact);
    button.querySelector('span span').textContent = `${contact.job_title || 'Sin cargo'} · ${contact.company || 'Sin empresa'}`;
    button.addEventListener('click', () => loadIntoForm(contact));
    elements.contactsList.appendChild(button);
  });
}

async function loadContacts() {
  setMessage(elements.formMessage, 'Cargando contactos…');
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('owner_id', currentUserId)
    .order('updated_at', { ascending: false });

  if (error) {
    setMessage(elements.formMessage, `No fue posible cargar: ${error.message}`, true);
    return;
  }

  contacts = data || [];
  setMessage(elements.formMessage);
  renderContacts();
  if (activeContactId) {
    const refreshed = contacts.find(item => item.id === activeContactId);
    if (refreshed) loadIntoForm(refreshed);
  }
}

async function saveContact(event) {
  event.preventDefault();
  setMessage(elements.formMessage, 'Guardando…');
  const contact = formData();
  if (!contact.slug) contact.slug = makeSlug(contact);

  const payload = { ...contact };
  delete payload.id;

  let result;
  if (contact.id) {
    result = await supabase.from('contacts').update(payload).eq('id', contact.id).select().single();
  } else {
    result = await supabase.from('contacts').insert(payload).select().single();
  }

  if (result.error) {
    setMessage(elements.formMessage, `No se pudo guardar: ${result.error.message}`, true);
    return;
  }

  setMessage(elements.formMessage, 'Contacto guardado correctamente.');
  setSavedState(true);
  await loadContacts();
  loadIntoForm(result.data);
}

async function deleteContact() {
  const contact = formData();
  if (!contact.id) return;
  const confirmed = window.confirm(`¿Eliminar definitivamente a ${fullName(contact)}?`);
  if (!confirmed) return;

  const { error } = await supabase.from('contacts').delete().eq('id', contact.id);
  if (error) {
    setMessage(elements.formMessage, `No se pudo eliminar: ${error.message}`, true);
    return;
  }

  contacts = contacts.filter(item => item.id !== contact.id);
  resetForm();
}

async function showApp(session) {
  const signedIn = Boolean(session);
  currentUserId = session?.user?.id || null;
  elements.loginView.classList.toggle('hidden', signedIn);
  elements.appView.classList.toggle('hidden', !signedIn);
  elements.logoutButton.classList.toggle('hidden', !signedIn);
  if (signedIn) {
    resetForm();
    await loadContacts();
  }
}

async function login(event) {
  event.preventDefault();
  setMessage(elements.loginMessage, 'Ingresando…');
  const { error } = await supabase.auth.signInWithPassword({
    email: clean(elements.loginEmail.value),
    password: elements.loginPassword.value,
  });
  if (error) setMessage(elements.loginMessage, error.message, true);
  else setMessage(elements.loginMessage);
}

function downloadQr() {
  const anchor = document.createElement('a');
  const contact = formData();
  anchor.download = `qr-${slugify(fullName(contact)) || 'contacto'}.png`;
  anchor.href = elements.qrCanvas.toDataURL('image/png');
  anchor.click();
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(elements.publicUrl.value);
    const previous = elements.copyUrlButton.textContent;
    elements.copyUrlButton.textContent = 'Copiado';
    setTimeout(() => { elements.copyUrlButton.textContent = previous; }, 1200);
  } catch {
    elements.publicUrl.select();
    document.execCommand('copy');
  }
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', login);
  elements.logoutButton.addEventListener('click', () => supabase.auth.signOut());
  elements.newContactButton.addEventListener('click', resetForm);
  elements.contactForm.addEventListener('submit', saveContact);
  elements.deleteButton.addEventListener('click', deleteContact);
  elements.searchInput.addEventListener('input', renderContacts);
  elements.contactForm.addEventListener('input', () => { setSavedState(false); drawQr(); });
  elements.copyUrlButton.addEventListener('click', copyUrl);
  elements.downloadQrButton.addEventListener('click', downloadQr);
  elements.openCardButton.addEventListener('click', () => window.open(elements.publicUrl.value, '_blank', 'noopener'));
  elements.downloadVcardButton.addEventListener('click', () => downloadVcard(formData()));
}

async function init() {
  if (!configured) {
    elements.setupNotice.classList.remove('hidden');
    elements.loginForm.querySelector('button').disabled = true;
    elements.loginMessage.textContent = 'Primero configura la conexión con Supabase.';
    resetForm();
    return;
  }

  bindEvents();
  const { data: { session } } = await supabase.auth.getSession();
  await showApp(session);
  supabase.auth.onAuthStateChange((_event, nextSession) => showApp(nextSession));
}

init();
