const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

function loadLocalEnvironment() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnvironment();
const PORT = Number(process.env.PORT || 3000);
const SESSION_MS = 30 * 60 * 1000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'menu.json');
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(PUBLIC_DIR, 'uploads'));
const sessions = new Map();

const seedData = {
  categories: [
    { id: 'hot-dishes', names: { kk: 'Ыстық тағамдар', ru: 'Горячие блюда' } },
    { id: 'dough-dishes', names: { kk: 'Қамыр тағамдары', ru: 'Мучные блюда' } }
  ],
  dishes: [
    {
      id: 'beshbarmak',
      categoryId: 'hot-dishes',
      name: { kk: 'Бешбармақ', ru: 'Бешбармак' },
      description: { kk: 'Жұмсақ ет, қолдан жайылған кеспе және пияз тұздығы.', ru: 'Нежное мясо, домашняя лапша и луковый соус.' },
      price: 4790,
      image: '/images/beshbarmak.png'
    },
    {
      id: 'plov',
      categoryId: 'hot-dishes',
      name: { kk: 'Қазақша палау', ru: 'Плов по-казахски' },
      description: { kk: 'Хош иісті күріш, ет, сәбіз және дәмдеуіштер.', ru: 'Ароматный рис, мясо, морковь и душистые специи.' },
      price: 3290,
      image: '/images/plov.png'
    },
    {
      id: 'lagman',
      categoryId: 'dough-dishes',
      name: { kk: 'Лағман', ru: 'Лагман' },
      description: { kk: 'Қол кеспе, ет пен көкөністен дайындалған қою тағам.', ru: 'Сытное блюдо с домашней лапшой, мясом и овощами.' },
      price: 2990,
      image: '/images/lagman.png'
    },
    {
      id: 'manti',
      categoryId: 'dough-dishes',
      name: { kk: 'Манты', ru: 'Манты' },
      description: { kk: 'Бу қазанында піскен жұқа қамырлы, шырынды манты.', ru: 'Сочные манты в тонком тесте, приготовленные на пару.' },
      price: 3490,
      image: '/images/manti.png'
    }
  ],
  slides: [
    { image: '/images/slide-dastarkhan.png', alt: { kk: 'Қазақ дастарқаны', ru: 'Казахский дастархан' } },
    { image: '/images/slide-tea.png', alt: { kk: 'Манты мен шай', ru: 'Манты и чай' } }
  ]
};

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const bundledDataFile = path.join(ROOT, 'data', 'menu.json');
    if (DATA_FILE !== bundledDataFile && fs.existsSync(bundledDataFile)) {
      fs.copyFileSync(bundledDataFile, DATA_FILE);
    } else {
      fs.writeFileSync(DATA_FILE, JSON.stringify(seedData, null, 2), 'utf8');
    }
  }
}

function readData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJson(req, limit = 10 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Файл слишком большой. Максимальный размер — 5 МБ.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('Неверный формат данных.');
    error.status = 400;
    throw error;
  }
}

function cookieValue(req, name) {
  const cookieHeader = req.headers.cookie || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function getSession(req) {
  const token = cookieValue(req, 'admin_session');
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function clearSessionCookie() {
  return `admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session) {
    sendError(res, 401, 'Сеанс завершён. Войдите в панель администратора снова.');
    return null;
  }
  return session;
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function localized(value) {
  return value && typeof value === 'object' &&
    typeof value.kk === 'string' && value.kk.trim() &&
    typeof value.ru === 'string' && value.ru.trim();
}

function validImagePath(value) {
  return typeof value === 'string' && /^\/(?:images|uploads)\/[A-Za-z0-9._-]+$/.test(value);
}

function validateDish(input, data) {
  if (!localized(input.name) || !localized(input.description)) return 'Заполните название и описание блюда на казахском и русском языках.';
  if (!Number.isSafeInteger(Number(input.price)) || Number(input.price) < 0 || Number(input.price) > 100000000) return 'Укажите корректную цену.';
  if (!data.categories.some((category) => category.id === input.categoryId)) return 'Выберите категорию.';
  if (!validImagePath(input.image)) return 'Загрузите фото блюда.';
  return '';
}

function validateCategory(input) {
  if (!localized(input.names)) return 'Заполните название категории на казахском и русском языках.';
  return '';
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/public-data' && req.method === 'GET') {
    const data = readData();
    sendJson(res, 200, { ...data, dishes: data.dishes.filter((dish) => dish.isAvailable !== false) });
    return;
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!process.env.ADMIN_PASSWORD) {
      sendError(res, 503, 'Не задан ADMIN_PASSWORD. Следуйте инструкции в README.');
      return;
    }
    const body = await readJson(req, 1024 * 1024);
    if (body.username !== 'admin' || !sameSecret(body.password || '', process.env.ADMIN_PASSWORD)) {
      sendError(res, 401, 'Неверный логин или пароль.');
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_MS;
    sessions.set(token, { expiresAt });
    const cookie = `admin_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
    sendJson(res, 200, { expiresAt }, { 'Set-Cookie': cookie });
    return;
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const token = cookieValue(req, 'admin_session');
    sessions.delete(token);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    return;
  }

  if (!pathname.startsWith('/api/admin/')) {
    sendError(res, 404, 'Адрес API не найден.');
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  if (pathname === '/api/admin/me' && req.method === 'GET') {
    sendJson(res, 200, { expiresAt: session.expiresAt, username: 'admin' });
    return;
  }

  if (pathname === '/api/admin/menu' && req.method === 'GET') {
    sendJson(res, 200, readData());
    return;
  }

  if (pathname === '/api/admin/upload' && req.method === 'POST') {
    const body = await readJson(req);
    const match = typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      sendError(res, 400, 'Выберите изображение в формате PNG, JPG или WebP.');
      return;
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
      sendError(res, 413, 'Размер изображения не должен превышать 5 МБ.');
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const filename = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), bytes, { flag: 'wx' });
    sendJson(res, 201, { image: `/uploads/${filename}` });
    return;
  }

  if (pathname === '/api/admin/dishes' && req.method === 'POST') {
    const body = await readJson(req, 1024 * 1024);
    const data = readData();
    const error = validateDish(body, data);
    if (error) { sendError(res, 400, error); return; }
    const dish = {
      id: crypto.randomUUID(),
      categoryId: body.categoryId,
      name: { kk: body.name.kk.trim(), ru: body.name.ru.trim() },
      description: { kk: body.description.kk.trim(), ru: body.description.ru.trim() },
      price: Number(body.price),
      image: body.image,
      isNew: body.isNew === true
    };
    data.dishes.push(dish);
    writeData(data);
    sendJson(res, 201, dish);
    return;
  }

  const dishMatch = pathname.match(/^\/api\/admin\/dishes\/([A-Za-z0-9_-]+)$/);
  if (dishMatch && req.method === 'PUT') {
    const body = await readJson(req, 1024 * 1024);
    const data = readData();
    const index = data.dishes.findIndex((dish) => dish.id === dishMatch[1]);
    if (index < 0) { sendError(res, 404, 'Блюдо не найдено.'); return; }
    const error = validateDish(body, data);
    if (error) { sendError(res, 400, error); return; }
    data.dishes[index] = {
      ...data.dishes[index],
      categoryId: body.categoryId,
      name: { kk: body.name.kk.trim(), ru: body.name.ru.trim() },
      description: { kk: body.description.kk.trim(), ru: body.description.ru.trim() },
      price: Number(body.price),
      image: body.image,
      isNew: body.isNew === true
    };
    writeData(data);
    sendJson(res, 200, data.dishes[index]);
    return;
  }

  const dishAvailabilityMatch = pathname.match(/^\/api\/admin\/dishes\/([A-Za-z0-9_-]+)\/availability$/);
  if (dishAvailabilityMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    if (typeof body.isAvailable !== 'boolean') {
      sendError(res, 400, 'Укажите статус наличия блюда.');
      return;
    }
    const data = readData();
    const dish = data.dishes.find((item) => item.id === dishAvailabilityMatch[1]);
    if (!dish) { sendError(res, 404, 'Блюдо не найдено.'); return; }
    dish.isAvailable = body.isAvailable;
    writeData(data);
    sendJson(res, 200, dish);
    return;
  }

  if (pathname === '/api/admin/categories' && req.method === 'POST') {
    const body = await readJson(req, 1024 * 1024);
    const error = validateCategory(body);
    if (error) { sendError(res, 400, error); return; }
    const data = readData();
    const category = { id: crypto.randomUUID(), names: { kk: body.names.kk.trim(), ru: body.names.ru.trim() } };
    data.categories.push(category);
    writeData(data);
    sendJson(res, 201, category);
    return;
  }

  const categoryMatch = pathname.match(/^\/api\/admin\/categories\/([A-Za-z0-9_-]+)$/);
  if (categoryMatch && req.method === 'PUT') {
    const body = await readJson(req, 1024 * 1024);
    const error = validateCategory(body);
    if (error) { sendError(res, 400, error); return; }
    const data = readData();
    const category = data.categories.find((item) => item.id === categoryMatch[1]);
    if (!category) { sendError(res, 404, 'Категория не найдена.'); return; }
    category.names = { kk: body.names.kk.trim(), ru: body.names.ru.trim() };
    writeData(data);
    sendJson(res, 200, category);
    return;
  }

  if (categoryMatch && req.method === 'DELETE') {
    const data = readData();
    const index = data.categories.findIndex((item) => item.id === categoryMatch[1]);
    if (index < 0) { sendError(res, 404, 'Категория не найдена.'); return; }
    if (data.categories.length < 2) { sendError(res, 409, 'Должна остаться хотя бы одна категория.'); return; }
    const removed = data.categories[index];
    const fallback = data.categories.find((item) => item.id !== removed.id);
    for (const dish of data.dishes) {
      if (dish.categoryId === removed.id) dish.categoryId = fallback.id;
    }
    data.categories.splice(index, 1);
    writeData(data);
    sendJson(res, 200, { ok: true, movedDishesTo: fallback.id });
    return;
  }

  const slideMatch = pathname.match(/^\/api\/admin\/slides\/(0|1)$/);
  if (slideMatch && req.method === 'PUT') {
    const body = await readJson(req, 1024 * 1024);
    if (!validImagePath(body.image) || !localized(body.alt)) {
      sendError(res, 400, 'Выберите изображение и сохраните его описание.');
      return;
    }
    const data = readData();
    const index = Number(slideMatch[1]);
    data.slides[index] = { image: body.image, alt: { kk: body.alt.kk.trim(), ru: body.alt.ru.trim() } };
    writeData(data);
    sendJson(res, 200, data.slides[index]);
    return;
  }

  sendError(res, 404, 'Адрес API не найден.');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  })[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let filePath;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(res, 400, 'Некорректный адрес.');
    return;
  }
  if (decodedPath.startsWith('/uploads/')) {
    const filename = decodedPath.slice('/uploads/'.length);
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
      sendError(res, 400, 'Некорректный адрес.');
      return;
    }
    filePath = path.resolve(UPLOAD_DIR, filename);
    if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {
      sendError(res, 403, 'Доступ запрещён.');
      return;
    }
  } else {
    filePath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
      sendError(res, 403, 'Доступ запрещён.');
      return;
    }
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendError(res, 404, 'Страница не найдена.');
    return;
  }
  const headers = {
    'Content-Type': contentType(filePath),
    'Cache-Control': /\.(?:html|js|css)$/.test(filePath) ? 'no-cache' : 'public, max-age=86400'
  };
  if (pathname === '/admin' || pathname === '/admin/') headers['X-Robots-Tag'] = 'noindex, nofollow';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(filePath).pipe(res);
}

function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}

async function handleRequest(req, res) {
  addSecurityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;
  if (pathname === '/admin' || pathname === '/admin/') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    pathname = '/admin.html';
  }
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendError(res, 405, 'Метод не поддерживается.');
      return;
    }
    serveStatic(req, res, pathname === '/' ? '/index.html' : pathname);
  } catch (error) {
    if (!res.headersSent) sendError(res, error.status || 500, error.status ? error.message : 'Внутренняя ошибка сервера.');
    else res.destroy();
  }
}

ensureDataFile();
const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сайт кафе АБДУЛЛА АТА: http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) console.warn('Внимание: задайте переменную ADMIN_PASSWORD для входа администратора.');
});
