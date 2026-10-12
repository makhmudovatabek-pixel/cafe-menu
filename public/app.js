const copy = {
  kk: {
    subtitle: 'Кафесі', nav: 'Мәзір', order: 'Тапсырыс беру үшін', callAction: 'Қоңырау шалу', whatsappAction: 'WhatsApp-та жазу', addressLabel: 'Мекенжай', address: 'Түркістан облысы, Түркібасы ауданы, Рысқұлов ауылдық округі, Азаттық ауылы, А. Навои көшесі, 59', routeLabel: 'Яндекс маршрут', eyebrow: 'АБДУЛЛА АТА КАФЕСІ', headline: 'Дәмді сәттер осында басталады!', dayOff: 'Бүгін бізде демалыс',
    sectionEyebrow: 'ДӘСТҮРЛІ ДӘМ', menuTitle: 'АС МӘЗІРІ', menuDescription: 'Әр тағам — дастарқанға деген ықылас.', all: 'Барлығы', empty: 'Бұл санатта әзірге тағам жоқ.', price: 'бағасы', newDish: 'Жаңа', addToOrder: 'Тапсырысқа', addedToOrder: 'Тапсырысқа қосылды', viewOrder: 'Тапсырысты көру', order: 'Тапсырыс', orderCount: 'тағам', orderNote: 'Таңдаған тағамдарыңыз осы телефонда сақталады. Тапсырысыңызды даяшыға айтыңыз!', orderEmpty: 'Әзірге тағам таңдалмады.', clearOrder: 'Тазалау', total: 'Барлығы', close: 'Жабу', removeOne: 'Біреуін алып тастау', addOne: 'Тағы біреу қосу'
  },
  ru: {
    subtitle: 'Кафе', nav: 'Меню', order: 'Для заказа', callAction: 'Позвонить', whatsappAction: 'Написать в WhatsApp', addressLabel: 'Адрес', address: 'улица А. Навои, 59, село Азатлык, Рыскуловский сельский округ, район Туркибасы', routeLabel: 'Яндекс маршрут', eyebrow: 'КАФЕ АБДУЛЛА АТА', headline: 'Вкусные моменты начинаются здесь!', dayOff: 'Сегодня у нас выходной',
    sectionEyebrow: 'ТРАДИЦИОННЫЙ ВКУС', menuTitle: 'МЕНЮ', menuDescription: 'Каждое блюдо — с теплом для вашего дастархана.', all: 'Все блюда', empty: 'В этой категории пока нет блюд.', price: 'цена', newDish: 'Новое', addToOrder: 'В заказ', addedToOrder: 'Добавлено в заказ', viewOrder: 'Посмотреть заказ', order: 'Заказ', orderCount: 'позиций', orderNote: 'Ваш выбор сохранится на этом телефоне. Покажите список официанту.', orderEmpty: 'Вы пока не выбрали блюда.', clearOrder: 'Очистить', total: 'Итого', close: 'Закрыть', removeOne: 'Убрать одно блюдо', addOne: 'Добавить ещё одно'
  }
};

let lang = localStorage.getItem('abdulla-ata-language') || 'kk';
let menuData = null;
let activeCategory = 'all';
let activeSlide = 0;
let sliderTimer = null;
let adminTapCount = 0;
let adminTapTimer = null;
const ORDER_STORAGE_KEY = 'abdulla-ata-order';
let order = readSavedOrder();

const byId = (id) => document.getElementById(id);
const languageText = (value) => value && (value[lang] || value.kk || value.ru) || '';

function readSavedOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function saveOrder() {
  try { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order)); } catch { /* Keep the current selection for this page view. */ }
}

function orderQuantity() {
  return Object.values(order).reduce((sum, quantity) => sum + Math.max(0, Number(quantity) || 0), 0);
}

function orderTotal() {
  if (!menuData) return 0;
  return menuData.dishes.reduce((sum, dish) => sum + (Number(order[dish.id]) || 0) * Number(dish.price || 0), 0);
}

function changeOrder(dishId, delta) {
  const nextQuantity = Math.max(0, (Number(order[dishId]) || 0) + delta);
  if (nextQuantity) order[dishId] = nextQuantity;
  else delete order[dishId];
  saveOrder();
  renderDishes();
  renderOrder();
}

function renderOrder() {
  const text = copy[lang];
  const dishes = menuData?.dishes || [];
  const availableIds = new Set(dishes.map((dish) => dish.id));
  let removedStaleItems = false;
  Object.keys(order).forEach((id) => {
    if (!availableIds.has(id)) {
      delete order[id];
      removedStaleItems = true;
    }
  });
  if (removedStaleItems) saveOrder();
  const count = orderQuantity();

  const launch = byId('cartLaunch');
  launch.hidden = count === 0;
  document.body.classList.toggle('has-order', count > 0);
  byId('cartLaunchLabel').textContent = text.viewOrder;
  byId('cartLaunchSummary').textContent = `${count} ${text.orderCount} · ${formatPrice(orderTotal())}`;
  byId('orderSheetEyebrow').textContent = lang === 'kk' ? 'СІЗДІҢ ТАҢДАУЫҢЫЗ' : 'ВАШ ВЫБОР';
  byId('orderDialogTitle').textContent = text.order;
  byId('orderSheetNote').textContent = text.orderNote;
  byId('orderClose').setAttribute('aria-label', text.close);
  byId('orderClear').textContent = text.clearOrder;
  byId('orderTotalLabel').textContent = text.total;
  byId('orderTotal').textContent = formatPrice(orderTotal());

  const items = byId('orderItems');
  items.replaceChildren();
  const selected = dishes.filter((dish) => Number(order[dish.id]) > 0);
  if (!selected.length) {
    const empty = document.createElement('p');
    empty.className = 'order-empty';
    empty.textContent = text.orderEmpty;
    items.append(empty);
  }
  selected.forEach((dish) => {
    const quantity = Number(order[dish.id]);
    const row = document.createElement('article');
    row.className = 'order-item';
    const image = document.createElement('img');
    image.className = 'order-item-image';
    image.src = dish.image;
    image.alt = languageText(dish.name);
    const info = document.createElement('div');
    info.className = 'order-item-info';
    const title = document.createElement('strong');
    title.textContent = languageText(dish.name);
    const price = document.createElement('span');
    price.textContent = `${formatPrice(dish.price)} × ${quantity} = ${formatPrice(dish.price * quantity)}`;
    info.append(title, price);
    const controls = document.createElement('div');
    controls.className = 'quantity-control';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'quantity-button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', text.removeOne);
    minus.addEventListener('click', () => changeOrder(dish.id, -1));
    const number = document.createElement('span');
    number.className = 'quantity-value';
    number.textContent = String(quantity);
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'quantity-button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', text.addOne);
    plus.addEventListener('click', () => changeOrder(dish.id, 1));
    controls.append(minus, number, plus);
    row.append(image, info, controls);
    items.append(row);
  });
}

byId('adminEntry').addEventListener('click', (event) => {
  event.preventDefault();
  adminTapCount += 1;
  if (adminTapTimer) clearTimeout(adminTapTimer);
  if (adminTapCount >= 5) {
    window.location.assign('/admin');
    return;
  }
  adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2500);
});

function applyLanguage() {
  const text = copy[lang];
  document.documentElement.lang = lang;
  byId('brandSubtitle').textContent = text.subtitle;
  byId('footerSubtitle').textContent = lang === 'kk' ? 'Кафе' : 'Кафе';
  byId('addressLabel').textContent = text.addressLabel;
  byId('cafeAddress').textContent = text.address;
  byId('routeLabel').textContent = text.routeLabel;
  byId('routeLink').href = 'https://yandex.kz/maps/?mode=routes&rtext=~42.551760%2C70.287952&rtt=auto';
  byId('orderLabel').textContent = text.order;
  byId('footerOrderLabel').textContent = text.order;
  byId('callAction').setAttribute('aria-label', text.callAction);
  byId('callAction').title = text.callAction;
  byId('footerCallAction').setAttribute('aria-label', text.callAction);
  byId('footerCallAction').title = text.callAction;
  byId('whatsAppAction').setAttribute('aria-label', text.whatsappAction);
  byId('whatsAppAction').title = text.whatsappAction;
  byId('footerWhatsAppAction').setAttribute('aria-label', text.whatsappAction);
  byId('footerWhatsAppAction').title = text.whatsappAction;
  byId('slideEyebrow').textContent = text.eyebrow;
  byId('slideHeadline').textContent = text.headline;
  byId('menuEyebrow').textContent = text.sectionEyebrow;
  byId('menuTitle').textContent = text.menuTitle;
  byId('menuDescription').textContent = text.menuDescription;
  byId('dayOffMessage').textContent = text.dayOff;
  byId('dayOffClose').textContent = text.close;
  document.querySelectorAll('.lang-button').forEach((button) => {
    const active = button.dataset.lang === lang;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (menuData) {
    renderSlides();
    renderCategories();
    renderDishes();
    renderOrder();
  }
}

function formatPrice(value) {
  const locale = lang === 'kk' ? 'kk-KZ' : 'ru-KZ';
  return `${Number(value).toLocaleString(locale)} ₸`;
}

function renderSlides() {
  const slides = menuData.slides || [];
  const container = byId('slides');
  const dots = byId('slideDots');
  container.replaceChildren();
  dots.replaceChildren();
  activeSlide = Math.min(activeSlide, Math.max(0, slides.length - 1));
  slides.forEach((slide, index) => {
    const article = document.createElement('div');
    article.className = `slide${index === activeSlide ? ' is-active' : ''}`;
    article.setAttribute('aria-hidden', String(index !== activeSlide));
    const image = document.createElement('img');
    image.src = slide.image;
    image.alt = languageText(slide.alt);
    image.fetchPriority = index === 0 ? 'high' : 'auto';
    article.append(image);
    container.append(article);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `slide-dot${index === activeSlide ? ' is-active' : ''}`;
    dot.setAttribute('aria-label', `${index + 1}`);
    dot.setAttribute('aria-pressed', String(index === activeSlide));
    dot.addEventListener('click', () => showSlide(index));
    dots.append(dot);
  });
  const arrowsHidden = slides.length < 2;
  byId('slidePrev').hidden = arrowsHidden;
  byId('slideNext').hidden = arrowsHidden;
  dots.hidden = arrowsHidden;
  if (sliderTimer) clearInterval(sliderTimer);
  if (slides.length > 1) sliderTimer = setInterval(() => showSlide((activeSlide + 1) % slides.length), 6500);
}

function showSlide(index) {
  const slideNodes = [...byId('slides').children];
  const dotNodes = [...byId('slideDots').children];
  if (!slideNodes.length) return;
  activeSlide = (index + slideNodes.length) % slideNodes.length;
  slideNodes.forEach((node, i) => {
    node.classList.toggle('is-active', i === activeSlide);
    node.setAttribute('aria-hidden', String(i !== activeSlide));
  });
  dotNodes.forEach((node, i) => {
    node.classList.toggle('is-active', i === activeSlide);
    node.setAttribute('aria-pressed', String(i === activeSlide));
  });
}

function renderCategories() {
  const list = byId('categoryList');
  list.replaceChildren();
  const options = [{ id: 'all', names: { kk: copy.kk.all, ru: copy.ru.all } }, ...menuData.categories];
  options.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-button${activeCategory === category.id ? ' is-active' : ''}`;
    button.textContent = languageText(category.names);
    button.setAttribute('aria-pressed', String(activeCategory === category.id));
    button.addEventListener('click', () => {
      activeCategory = category.id;
      renderCategories();
      renderDishes();
    });
    list.append(button);
  });
}

function renderDishes() {
  const grid = byId('foodGrid');
  const emptyState = byId('emptyState');
  const categoryById = new Map(menuData.categories.map((category) => [category.id, category]));
  const dishes = menuData.dishes.filter((dish) => activeCategory === 'all' || dish.categoryId === activeCategory);
  grid.replaceChildren();
  emptyState.hidden = dishes.length > 0;
  emptyState.textContent = copy[lang].empty;
  dishes.forEach((dish) => {
    const card = document.createElement('article');
    card.className = 'food-card';
    const imageWrap = document.createElement('div');
    imageWrap.className = 'food-image-wrap';
    const image = document.createElement('img');
    image.className = 'food-image';
    image.src = dish.image;
    image.alt = languageText(dish.name);
    image.loading = 'lazy';
    image.addEventListener('error', () => image.classList.add('is-broken'), { once: true });
    imageWrap.append(image);
    if (dish.isNew) {
      const badge = document.createElement('span');
      badge.className = 'new-dish-badge';
      badge.textContent = copy[lang].newDish;
      imageWrap.append(badge);
    }
    const content = document.createElement('div');
    content.className = 'food-content';
    const category = document.createElement('span');
    category.className = 'food-category';
    category.textContent = languageText(categoryById.get(dish.categoryId)?.names);
    const title = document.createElement('h3');
    title.className = 'food-title';
    title.textContent = languageText(dish.name);
    const description = document.createElement('p');
    description.className = 'food-description';
    description.textContent = languageText(dish.description);
    const price = document.createElement('div');
    price.className = 'food-price';
    price.textContent = formatPrice(dish.price);
    const priceLabel = document.createElement('span');
    priceLabel.textContent = copy[lang].price;
    price.append(priceLabel);
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = `add-order-button${Number(order[dish.id]) ? ' is-added' : ''}`;
    const quantity = Number(order[dish.id]) || 0;
    addButton.textContent = quantity ? `✓ ${quantity}` : copy[lang].addToOrder;
    addButton.addEventListener('click', () => changeOrder(dish.id, 1));
    content.append(category, title, description, price, addButton);
    card.append(imageWrap, content);
    grid.append(card);
  });
}

document.querySelectorAll('.lang-button').forEach((button) => {
  button.addEventListener('click', () => {
    lang = button.dataset.lang;
    localStorage.setItem('abdulla-ata-language', lang);
    applyLanguage();
  });
});
byId('slidePrev').addEventListener('click', () => showSlide(activeSlide - 1));
byId('slideNext').addEventListener('click', () => showSlide(activeSlide + 1));
byId('cartLaunch').addEventListener('click', () => byId('orderDialog').showModal());
byId('dayOffClose').addEventListener('click', () => byId('dayOffDialog').close());
byId('orderClose').addEventListener('click', () => byId('orderDialog').close());
byId('orderDialog').addEventListener('click', (event) => {
  if (event.target === byId('orderDialog')) byId('orderDialog').close();
});
byId('orderClear').addEventListener('click', () => {
  order = {};
  saveOrder();
  renderDishes();
  renderOrder();
  byId('orderDialog').close();
});

async function init() {
  try {
    const response = await fetch('/api/public-data');
    if (!response.ok) throw new Error('menu unavailable');
    menuData = await response.json();
    applyLanguage();
  } catch {
    byId('loadError').hidden = false;
    byId('loadError').textContent = lang === 'kk'
      ? 'Мәзірді жүктеу мүмкін болмады. Сайт серверін іске қосыңыз.'
      : 'Не удалось загрузить меню. Запустите сервер сайта.';
  }
}

function showTuesdayDayOffNotice() {
  if (new Date().getDay() !== 2) return;
  byId('dayOffDialog').showModal();
}

showTuesdayDayOffNotice();
init();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }, { once: true });
}
