// Egypt, drawn in code: the coast and borders, the Nile, the canal, the main roads, the towns, the seas, and where the cities are.
// A site sits on the map by its pin (lat, lng), else by its city, else by a place in its name, else by its hub area.
// Every coordinate is [lng, lat]. The projection is a flat one, with longitude squeezed to the cosine of 27 degrees, which is true enough for a country this size.

export const OUTLINE = [
  // the Mediterranean coast, west to east
  [25.15, 31.55], [25.92, 31.61], [26.6, 31.5], [27.24, 31.36], [27.9, 31.15], [28.45, 31.05], [28.95, 30.85], [29.5, 30.95], [29.75, 31.1], [29.92, 31.2], [30.07, 31.32], [30.4, 31.47],
  [30.98, 31.6], [31.08, 31.58], [31.5, 31.45], [31.84, 31.52], [32.31, 31.27], [32.8, 31.1], [33.1, 31.1], [33.8, 31.15], [34.1, 31.22], [34.25, 31.32],
  // the border down to Taba
  [34.4, 31.0], [34.53, 30.4], [34.9, 29.49],
  // the Gulf of Aqaba coast to Ras Muhammad
  [34.66, 28.97], [34.5, 28.5], [34.42, 28.05], [34.33, 27.86], [34.24, 27.73],
  // Sinai's west coast up the Gulf of Suez
  [34.05, 27.8], [33.62, 28.24], [33.18, 28.9], [33.1, 29.05], [32.7, 29.6], [32.58, 29.85], [32.55, 29.97],
  // the mainland Red Sea coast, north to south
  [32.52, 29.95], [32.35, 29.6], [32.65, 29.12], [33.1, 28.36], [33.4, 27.95], [33.7, 27.4], [33.82, 27.2], [33.94, 26.75], [34.28, 26.1], [34.6, 25.6], [34.9, 25.07], [35.2, 24.5],
  [35.47, 23.94], [35.6, 23.13], [36.63, 22.2], [36.9, 22.0],
  // the southern border
  [33.5, 22.0], [31.4, 22.0], [25.0, 22.0],
  // the western border back to the coast
  [25.0, 25.0], [25.0, 29.2], [24.7, 29.6], [24.8, 30.5], [24.9, 31.4]
];
export const NILE = [[32.9, 24.09], [32.93, 24.48], [32.87, 24.98], [32.55, 25.29], [32.64, 25.69], [32.72, 26.16], [32.24, 26.05], [31.69, 26.56], [31.18, 27.18], [30.84, 27.73], [30.75, 28.11], [31.1, 29.07], [31.3, 29.85], [31.23, 30.06]];
export const BRANCHES = [
  [[31.23, 30.06], [31.0, 30.5], [30.7, 30.9], [30.45, 31.3], [30.4, 31.47]],
  [[31.23, 30.06], [31.18, 30.47], [31.24, 30.71], [31.25, 30.97], [31.38, 31.04], [31.52, 31.19], [31.71, 31.33], [31.84, 31.52]]
];
export const CANAL = [[32.31, 31.27], [32.32, 30.6], [32.55, 29.97]];
// the main roads, for orientation
export const ROADS = [
  [[31.2, 30.05], [30.9, 30.4], [30.5, 30.8], [30.1, 31.0], [29.92, 31.2]],                       // Cairo to Alexandria, the desert road
  [[31.24, 30.1], [31.18, 30.47], [31.0, 30.79], [30.82, 30.82], [30.47, 31.03], [29.95, 31.18]],  // the agricultural road, through Banha and Tanta
  [[31.18, 30.47], [31.25, 30.7], [31.38, 31.04], [31.6, 31.25], [31.81, 31.42]],                  // Banha to Mansoura and Damietta
  [[31.3, 30.1], [31.74, 30.3], [32.27, 30.6], [32.3, 31.27]],                                     // Cairo to Ismailia and Port Said
  [[31.3, 30.05], [31.9, 30.0], [32.5, 29.97]],                                                    // Cairo to Suez
  [[32.27, 30.6], [32.55, 29.97]],                                                                 // Ismailia to Suez
  [[31.2, 30.0], [30.84, 29.31]],                                                                  // Cairo to Fayoum
  [[32.55, 29.95], [32.4, 29.62], [32.7, 29.12], [33.15, 28.36], [33.45, 27.95], [33.75, 27.4], [33.85, 27.2], [33.98, 26.75], [34.3, 26.1], [34.95, 25.07]]   // the Red Sea road
];
export const SEAS = [
  { name: 'Mediterranean Sea', lat: 31.95, lng: 29.6 },
  { name: 'Red Sea', lat: 25.9, lng: 35.4 },
  { name: 'Gulf of Suez', lat: 28.75, lng: 32.75 },
  { name: 'Gulf of Aqaba', lat: 28.55, lng: 34.95 }
];
export const BOUNDS = { lng0: 24.5, lng1: 37.0, lat0: 21.7, lat1: 31.9 };

// the cities a site can be matched to: the words that mean it, in English and Arabic, and where it is; town marks the ones drawn for orientation
export const CITIES = {
  'cairo': { name: 'Cairo', town: 1, lat: 30.05, lng: 31.24, keys: ['cairo', 'giza', 'nasr city', 'maadi', 'heliopolis', 'ramsis', 'ramses', 'shubra', 'zamalek', 'mohandessin', 'dokki', 'helwan', 'القاهرة', 'الجيزة', 'رمسيس', 'مدينة نصر', 'المعادي', 'mohandeseen', 'mohandiseen', 'abu rawash', 'masr el gedida', 'misr el gedida', 'مصر الجديدة'] },
  'cairo-east': { name: 'New Cairo', town: 2, lat: 30.03, lng: 31.47, keys: ['new cairo', 'fifth settlement', '5th settlement', 'tagamoa', 'madinaty', 'shorouk', 'east cairo', 'القاهرة الجديدة', 'التجمع', 'الشروق', 'katameya', 'kattameya', 'mostakbal city', 'مدينتي'], cityKeys: ['rehab', 'الرحاب'] },
  'cairo-west': { name: '6th of October', town: 2, lat: 30.0, lng: 30.98, keys: ['6th of october', '6 october', 'sixth of october', 'october city', 'sheikh zayed', 'west cairo', '6 أكتوبر', 'السادس من أكتوبر', 'الشيخ زايد', '6th october', 'october', 'hadayek october'] },
  'qalyub': { name: 'Qalyub', town: 2, lat: 30.18, lng: 31.21, keys: ['qalyub', 'qaliub', 'qalioub', 'kalyoub', 'qalyubia', 'القليوب', 'القليوبية'] },
  '10th-of-ramadan': { name: '10th of Ramadan', town: 2, lat: 30.3, lng: 31.74, keys: ['10th of ramadan', '10 ramadan', 'tenth of ramadan', 'العاشر من رمضان', '10th ramadan', '10 of ramadan', 'العاشر'] },
  'obour': { name: 'Obour', town: 0, lat: 30.23, lng: 31.47, keys: ['obour', 'العبور', 'obour city', 'مدينة العبور'] },
  'badr': { name: 'Badr', town: 0, lat: 30.14, lng: 31.72, keys: ['badr city', 'مدينة بدر'], cityKeys: ['badr', 'بدر'] },
  'alexandria': { name: 'Alexandria', town: 1, lat: 31.2, lng: 29.92, keys: ['alexandria', 'alex', 'iskandariya', 'الإسكندرية', 'اسكندرية', 'eskandaria'] },
  'borg-el-arab': { name: 'Borg El Arab', town: 2, lat: 30.92, lng: 29.58, keys: ['borg el arab', 'burg al arab', 'برج العرب', 'borg al arab', 'burg el arab', 'new borg el arab'] },
  'tanta': { name: 'Tanta', town: 1, lat: 30.79, lng: 31.0, keys: ['tanta', 'طنطا'] },
  'mansoura': { name: 'Mansoura', town: 1, lat: 31.04, lng: 31.38, keys: ['mansoura', 'mansura', 'المنصورة'] },
  'new-mansoura': { name: 'New Mansoura', town: 2, lat: 31.47, lng: 31.45, keys: ['new mansoura', 'المنصورة الجديدة'] },
  'damietta': { name: 'Damietta', town: 1, lat: 31.42, lng: 31.81, keys: ['damietta', 'dumyat', 'new damietta', 'دمياط'] },
  'port-said': { name: 'Port Said', town: 1, lat: 31.26, lng: 32.3, keys: ['port said', 'بورسعيد'] },
  'ismailia': { name: 'Ismailia', town: 1, lat: 30.6, lng: 32.27, keys: ['ismailia', 'الإسماعيلية', 'الاسماعيلية'] },
  'suez': { name: 'Suez', town: 1, lat: 29.97, lng: 32.55, keys: ['suez', 'السويس'] },
  'ain-sokhna': { name: 'Ain Sokhna', town: 2, lat: 29.6, lng: 32.35, keys: ['ain sokhna', 'sokhna', 'العين السخنة', 'ain sukhna', 'sukhna'] },
  'zagazig': { name: 'Zagazig', town: 1, lat: 30.59, lng: 31.5, keys: ['zagazig', 'الزقازيق'] },
  'banha': { name: 'Banha', town: 2, lat: 30.47, lng: 31.18, keys: ['banha', 'benha', 'بنها'] },
  'mahalla': { name: 'Mahalla', town: 2, lat: 30.97, lng: 31.17, keys: ['mahalla', 'المحلة'] },
  'kafr-el-sheikh': { name: 'Kafr El Sheikh', town: 2, lat: 31.11, lng: 30.94, keys: ['kafr el sheikh', 'kafr elsheikh', 'كفر الشيخ'] },
  'damanhur': { name: 'Damanhur', town: 2, lat: 31.03, lng: 30.47, keys: ['damanhur', 'damanhour', 'دمنهور'] },
  'shebin-el-kom': { name: 'Shebin El Kom', town: 2, lat: 30.56, lng: 31.01, keys: ['shebin el kom', 'shibin el kom', 'menoufia', 'شبين الكوم', 'المنوفية'], cityKeys: ['shibin'] },
  'sadat-city': { name: 'Sadat City', town: 2, lat: 30.37, lng: 30.53, keys: ['sadat city', 'مدينة السادات'], cityKeys: ['sadat', 'السادات'] },
  'fayoum': { name: 'Fayoum', town: 1, lat: 29.31, lng: 30.84, keys: ['fayoum', 'faiyum', 'الفيوم'] },
  'beni-suef': { name: 'Beni Suef', town: 1, lat: 29.07, lng: 31.1, keys: ['beni suef', 'بني سويف'] },
  'minya': { name: 'Minya', town: 1, lat: 28.1, lng: 30.75, keys: ['minya', 'minia', 'المنيا'] },
  'assiut': { name: 'Assiut', town: 1, lat: 27.18, lng: 31.18, keys: ['assiut', 'asyut', 'أسيوط', 'اسيوط'] },
  'sohag': { name: 'Sohag', town: 1, lat: 26.56, lng: 31.69, keys: ['sohag', 'سوهاج'] },
  'qena': { name: 'Qena', town: 1, lat: 26.16, lng: 32.72, keys: ['qena', 'قنا'] },
  'luxor': { name: 'Luxor', town: 1, lat: 25.69, lng: 32.64, keys: ['luxor', 'الأقصر', 'الاقصر'] },
  'aswan': { name: 'Aswan', town: 1, lat: 24.09, lng: 32.9, keys: ['aswan', 'أسوان', 'اسوان'] },
  'hurghada': { name: 'Hurghada', town: 1, lat: 27.26, lng: 33.81, keys: ['hurghada', 'الغردقة'] },
  'el-gouna': { name: 'El Gouna', town: 2, lat: 27.4, lng: 33.68, keys: ['el gouna', 'gouna', 'الجونة'] },
  'safaga': { name: 'Safaga', town: 2, lat: 26.75, lng: 33.94, keys: ['safaga', 'سفاجا'] },
  'marsa-alam': { name: 'Marsa Alam', town: 1, lat: 25.07, lng: 34.9, keys: ['marsa alam', 'مرسى علم'] },
  'sharm': { name: 'Sharm El Sheikh', town: 1, lat: 27.91, lng: 34.33, keys: ['sharm el sheikh', 'sharm', 'شرم الشيخ'] },
  'dahab': { name: 'Dahab', town: 2, lat: 28.5, lng: 34.5, keys: ['dahab', 'دهب'] },
  'el-arish': { name: 'El Arish', town: 1, lat: 31.13, lng: 33.8, keys: ['arish', 'العريش'] },
  'marsa-matruh': { name: 'Marsa Matruh', town: 1, lat: 31.35, lng: 27.24, keys: ['matruh', 'marsa matrouh', 'مرسى مطروح', 'مطروح'] },
  'ras-gharib': { name: 'Ras Gharib', town: 2, lat: 28.36, lng: 33.1, keys: ['ras gharib', 'رأس غارب'] }
};
export const AREAS = { central: 'cairo', east: 'cairo-east', west: 'cairo-west', alexandria: 'alexandria', mansoura: 'mansoura', 'new-mansoura': 'new-mansoura', damietta: 'damietta' };
// the towns drawn for orientation: 1 always, 2 only when the map is zoomed in enough (less than 5 degrees across)
export const TOWNS = Object.entries(CITIES).filter(([, c]) => c.town).map(([id, c]) => ({ id, name: c.name, lat: c.lat, lng: c.lng, rank: c.town }));

// one spelling of a word: no harakat, no tatweel, one alef, ta marbuta as ha, alef maqsura as ya, Arabic digits as Latin ones
const norm = s => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// the road a site gives as its address names two cities and means neither of them
const ROADS_RE = / (cairo|masr|misr|مصر|القاهره) (alexandria|alex|ismailia|suez|fayoum|sokhna|sukhna|اسكندريه|الاسكندريه|اسماعيليه|الاسماعيليه|السويس) (desert )?(road|الصحراوي) /g;
// the longest words first, so "new mansoura" wins over "mansoura" and "new cairo" over "cairo"
const keyList = pick => Object.entries(CITIES).flatMap(([id, c]) => (pick(c) || []).map(k => [norm(k), id])).sort((a, b) => b[0].length - a[0].length);
const KEYS = keyList(c => c.keys);
const CITY_KEYS = keyList(c => [...(c.keys || []), ...(c.cityKeys || [])]);   // words that mean the city only when they are typed in the city field
export function cityOf(text, fromCity = false) {
  const t = (' ' + norm(text) + ' ').replace(ROADS_RE, ' ');
  if (t.trim() === '') return null;
  for (const [k, id] of (fromCity ? CITY_KEYS : KEYS)) if (t.includes(' ' + k + ' ')) return id;
  return null;
}
const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
// a pin outside Egypt is a typo, not a place: the two numbers swapped, a placeholder of 0, a pin copied from somewhere else. It is ignored and the city places the site.
export const inEgypt = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= BOUNDS.lat0 - 0.5 && lat <= BOUNDS.lat1 + 0.5 && lng >= BOUNDS.lng0 - 0.5 && lng <= BOUNDS.lng1 + 0.5;
export function place(site) {
  const lat = num(site.lat), lng = num(site.lng);
  if (inEgypt(lat, lng)) return { lat, lng, by: 'pin' };
  let id = cityOf(site.city, true);
  if (id) return { lat: CITIES[id].lat, lng: CITIES[id].lng, by: 'city', city: id };
  id = cityOf(site.name);
  if (id) return { lat: CITIES[id].lat, lng: CITIES[id].lng, by: 'name', city: id };
  id = AREAS[site.area];
  if (id) return { lat: CITIES[id].lat, lng: CITIES[id].lng, by: 'area', city: id };
  return null;
}

// the window to draw: the box around the points with room, never narrower than the minimum, between 0.55 and maxRatio as tall as it is wide (a phone gets a taller map)
const K = Math.cos(27 * Math.PI / 180);
export function frame(pts, W, { minLng = 3.2, minLat = 2.6, pad = 0.2, maxRatio = 0.9 } = {}) {
  let lng0, lng1, lat0, lat1;
  if (!pts.length) ({ lng0, lng1, lat0, lat1 } = BOUNDS);
  else {
    lng0 = Math.min(...pts.map(p => p.lng)); lng1 = Math.max(...pts.map(p => p.lng));
    lat0 = Math.min(...pts.map(p => p.lat)); lat1 = Math.max(...pts.map(p => p.lat));
    const px = Math.max(0.5, (lng1 - lng0) * pad), py = Math.max(0.45, (lat1 - lat0) * pad);
    lng0 -= px; lng1 += px; lat0 -= py; lat1 += py;
    if (lng1 - lng0 < minLng) { const c = (lng0 + lng1) / 2; lng0 = c - minLng / 2; lng1 = c + minLng / 2; }
    if (lat1 - lat0 < minLat) { const c = (lat0 + lat1) / 2; lat0 = c - minLat / 2; lat1 = c + minLat / 2; }
  }
  let w = (lng1 - lng0) * K, h = lat1 - lat0;
  if (h / w > maxRatio) { const nw = h / maxRatio, c = (lng0 + lng1) / 2; lng0 = c - nw / K / 2; lng1 = c + nw / K / 2; w = nw; }
  else if (h / w < 0.55) { const nh = w * 0.55, c = (lat0 + lat1) / 2; lat0 = c - nh / 2; lat1 = c + nh / 2; h = nh; }
  const S = W / w;
  return { x: lng => (lng - lng0) * K * S, y: lat => (lat1 - lat) * S, w: W, h: Math.round(h * S), lng0, lng1, lat0, lat1, pxPerDeg: S };
}

export const pathOf = (pts, f, close = false) => pts.map(([lng, lat], i) => `${i ? 'L' : 'M'}${f.x(lng).toFixed(1)} ${f.y(lat).toFixed(1)}`).join('') + (close ? 'Z' : '');
