import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, PUBLIC_BASE_URL } from './config.js';
import { clean, downloadVcard, fullName, initials, randomToken, slugify } from './shared.js';

const configured = !SUPABASE_URL.includes('PEGA_AQUI') && !SUPABASE_ANON_KEY.includes('PEGA_AQUI');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const PHOTO_BUCKET = 'contact-photos';
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_OUTPUT_SIZE = 1000;
const PHOTO_DETECTION_MAX_SIZE = 1600;
const MEDIAPIPE_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

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
  photoFile: document.querySelector('#photoFile'),
  photoPreview: document.querySelector('#photoPreview'),
  photoPreviewPlaceholder: document.querySelector('#photoPreviewPlaceholder'),
  removePhotoButton: document.querySelector('#removePhotoButton'),
  photoUploadMessage: document.querySelector('#photoUploadMessage'),
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
let mediaPipeFaceDetectorPromise = null;

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

function setPhotoPreview(url = '') {
  const value = clean(url);
  elements.photoPreview.classList.toggle('hidden', !value);
  elements.photoPreviewPlaceholder.classList.toggle('hidden', Boolean(value));
  elements.removePhotoButton.classList.toggle('hidden', !value);
  if (value) elements.photoPreview.src = value;
  else elements.photoPreview.removeAttribute('src');
}

function storagePathFromPublicUrl(url = '') {
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const value = clean(url);
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return '';
  const encodedPath = value.slice(markerIndex + marker.length).split('?')[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

async function removeStoredPhoto(url = '') {
  const path = storagePathFromPublicUrl(url);
  if (!path || !currentUserId || !path.startsWith(`${currentUserId}/`)) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.warn('No fue posible eliminar la foto anterior:', error.message);
}

function photoExtension(file) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return extensions[file.type] || 'jpg';
}

async function createOrientedBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return await createImageBitmap(file);
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No fue posible leer la imagen seleccionada.'));
      element.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createDetectionCanvas(source) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const scale = Math.min(1, PHOTO_DETECTION_MAX_SIZE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function getMediaPipeFaceDetector() {
  if (!mediaPipeFaceDetectorPromise) {
    mediaPipeFaceDetectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm');
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.45,
        minSuppressionThreshold: 0.3,
      });
    })().catch(error => {
      mediaPipeFaceDetectorPromise = null;
      throw error;
    });
  }
  return mediaPipeFaceDetectorPromise;
}

function largestDetection(detections = []) {
  return detections.reduce((largest, detection) => {
    const box = detection.boundingBox;
    const area = (box?.width || 0) * (box?.height || 0);
    const largestBox = largest?.boundingBox;
    const largestArea = (largestBox?.width || 0) * (largestBox?.height || 0);
    return area > largestArea ? detection : largest;
  }, null);
}

async function detectMainFace(source) {
  const detectionCanvas = createDetectionCanvas(source);
  try {
    const detector = await getMediaPipeFaceDetector();
    const result = detector.detect(detectionCanvas);
    const detection = largestDetection(result?.detections || []);
    if (!detection?.boundingBox) return null;

    const box = detection.boundingBox;
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    const scaleX = sourceWidth / detectionCanvas.width;
    const scaleY = sourceHeight / detectionCanvas.height;
    return {
      x: box.originX * scaleX,
      y: box.originY * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    };
  } catch (error) {
    console.warn('Detección facial no disponible; se usará centrado automático.', error);
    return null;
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function smartSquareCrop(sourceWidth, sourceHeight, face) {
  const shortestSide = Math.min(sourceWidth, sourceHeight);

  if (!face) {
    const size = shortestSide;
    return {
      x: (sourceWidth - size) / 2,
      y: clamp(sourceHeight * 0.43 - size * 0.43, 0, sourceHeight - size),
      size,
      faceDetected: false,
    };
  }

  const faceCenterX = face.x + face.width / 2;
  const faceCenterY = face.y + face.height / 2;
  // Espacio suficiente para frente, cabello, cuello y hombros sin acercar demasiado el rostro.
  const preferredSize = Math.max(face.width * 3.25, face.height * 3.35, shortestSide * 0.58);
  const size = Math.min(shortestSide, preferredSize);
  const x = clamp(faceCenterX - size / 2, 0, sourceWidth - size);
  // El rostro queda ligeramente arriba del centro para mostrar hombros y parte superior del torso.
  const y = clamp(faceCenterY - size * 0.39, 0, sourceHeight - size);

  return { x, y, size, faceDetected: true };
}

function canvasToBlob(canvas, type = 'image/webp', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('No fue posible preparar la fotografía.'));
    }, type, quality);
  });
}

async function processPortraitPhoto(file) {
  const source = await createOrientedBitmap(file);
  try {
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error('La imagen no tiene dimensiones válidas.');

    const face = await detectMainFace(source);
    const crop = smartSquareCrop(sourceWidth, sourceHeight, face);
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_OUTPUT_SIZE;
    canvas.height = PHOTO_OUTPUT_SIZE;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PHOTO_OUTPUT_SIZE, PHOTO_OUTPUT_SIZE);
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.size,
      crop.size,
      0,
      0,
      PHOTO_OUTPUT_SIZE,
      PHOTO_OUTPUT_SIZE
    );

    let blob;
    let outputType = 'image/webp';
    try {
      blob = await canvasToBlob(canvas, outputType, 0.9);
    } catch {
      outputType = 'image/jpeg';
      blob = await canvasToBlob(canvas, outputType, 0.9);
    }

    const extension = outputType === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto-contacto';
    const processedFile = new File([blob], `${baseName}-centrada.${extension}`, {
      type: outputType,
      lastModified: Date.now(),
    });
    return { file: processedFile, faceDetected: crop.faceDetected };
  } finally {
    if (typeof source.close === 'function') source.close();
  }
}
async function uploadSelectedPhoto() {
  const originalFile = elements.photoFile.files?.[0];
  if (!originalFile) return;
  if (!PHOTO_TYPES.has(originalFile.type)) {
    setMessage(elements.photoUploadMessage, 'Selecciona una imagen JPG, PNG o WebP.', true);
    elements.photoFile.value = '';
    return;
  }
  if (originalFile.size > PHOTO_MAX_BYTES) {
    setMessage(elements.photoUploadMessage, 'La foto supera el límite de 5 MB.', true);
    elements.photoFile.value = '';
    return;
  }
  if (!currentUserId) {
    setMessage(elements.photoUploadMessage, 'Debes iniciar sesión para subir la foto.', true);
    return;
  }

  const contact = formData();
  if (!contact.slug) {
    contact.slug = makeSlug(contact);
    elements.contactSlug.value = contact.slug;
  }
  const previousUrl = clean(elements.photoUrl.value);

  setMessage(elements.photoUploadMessage, 'Analizando rostro y centrando la fotografía…');
  elements.photoFile.disabled = true;
  try {
    const processed = await processPortraitPhoto(originalFile);
    const file = processed.file;
    const filename = `${contact.slug}-${Date.now()}-${randomToken(4)}.${photoExtension(file)}`;
    const path = `${currentUserId}/${filename}`;

    setMessage(elements.photoUploadMessage, processed.faceDetected
      ? 'Rostro detectado y centrado. Subiendo foto optimizada…'
      : 'No se detectó un rostro. Aplicando centrado automático y subiendo…');

    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
    if (error) throw error;

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('No fue posible obtener la URL pública de la foto.');

    elements.photoUrl.value = data.publicUrl;
    setPhotoPreview(data.publicUrl);
    setSavedState(false);
    setMessage(elements.photoUploadMessage, processed.faceDetected
      ? 'Foto cargada con el rostro centrado. Guarda el contacto para confirmar el cambio.'
      : 'Foto cargada con centrado automático. Guarda el contacto para confirmar el cambio.');
    if (previousUrl && previousUrl !== data.publicUrl) await removeStoredPhoto(previousUrl);
  } catch (error) {
    console.error(error);
    setMessage(elements.photoUploadMessage, `No se pudo procesar o subir la foto: ${error.message}`, true);
  } finally {
    elements.photoFile.disabled = false;
    elements.photoFile.value = '';
  }
}

async function removeCurrentPhoto() {
  const previousUrl = clean(elements.photoUrl.value);
  elements.photoUrl.value = '';
  setPhotoPreview('');
  setSavedState(false);
  setMessage(elements.photoUploadMessage, 'Foto retirada. Guarda el contacto para confirmar el cambio.');
  await removeStoredPhoto(previousUrl);
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
  elements.photoFile.value = '';
  elements.photoUrl.value = '';
  setPhotoPreview('');
  setMessage(elements.photoUploadMessage);
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
  elements.photoFile.value = '';
  setPhotoPreview(contact.photo_url || '');
  setMessage(elements.photoUploadMessage);
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

  await removeStoredPhoto(contact.photo_url);
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
  elements.photoFile.addEventListener('change', uploadSelectedPhoto);
  elements.removePhotoButton.addEventListener('click', removeCurrentPhoto);
  elements.photoPreview.addEventListener('error', () => {
    elements.photoPreview.classList.add('hidden');
    elements.photoPreviewPlaceholder.classList.remove('hidden');
  });
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
