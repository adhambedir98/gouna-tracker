// Egypt, drawn in code: the outline, the Nile, the canal, and where the cities are.
// A site sits on the map by its pin (lat, lng), else by its city, else by a place in its name, else by its hub area.
// Every coordinate is [lng, lat]. The projection is a flat one, with longitude squeezed to the cosine of 27 degrees, which is true enough for a country this size.

export const OUTLINE = [
  [25.15, 31.57], [26.0, 31.45], [27.24, 31.35], [28.2, 31.1], [28.95, 30.83], [29.5, 30.95], [29.92, 31.2], [30.4, 31.45], [31.08, 31.58], [31.81, 31.42], [32.3, 31.27], [32.9, 31.1], [33.8, 31.13], [34.24, 31.3],
  [34.4, 30.9], [34.55, 30.4], [34.9, 29.49],
  [34.66, 28.97], [34.5, 28.5], [34.4, 28.0], [34.33, 27.86], [34.24, 27.73],
  [34.0, 27.85], [33.75, 28.1], [33.62, 28.24], [33.18, 28.9], [33.1, 29.05], [32.7, 29.6], [32.55, 29.95],
  [32.35, 29.6], [32.65, 29.12], [33.1, 28.36], [33.5, 27.8], [33.81, 27.25], [33.94, 26.75], [34.28, 26.1], [34.9, 25.07], [35.47, 23.94], [35.6, 23.13], [36.63, 22.2], [36.9, 22.0],
  [25.0, 22.0],
  [25.0, 29.2], [24.7, 29.6], [24.9, 31.4]
];
export const NILE = [[32.9, 24.09], [32.93, 24.48], [32.87, 24.98], [32.55, 25.29], [32.64, 25.69], [32.72, 26.16], [32.24, 26.05], [31.69, 26.56], [31.18, 27.18], [30.84, 27.73], [30.75, 28.11], [31.1, 29.07], [31.3, 29.85], [31.23, 30.06]];
export const BRANCHES = [
  [[31.23, 30.06], [31.0, 30.5], [30.7, 30.9], [30.45, 31.3], [30.4, 31.45]],
  [[31.23, 30.06], [31.35, 30.55], [31.5, 30.95], [31.7, 31.2], [31.81, 31.42]]
];
export const CANAL = [[32.3, 31.27], [32.32, 30.6], [32.55, 29.95]];
export const BOUNDS = { lng0: 24.5, lng1: 37.0, lat0: 21.7, lat1: 31.9 };

// the cities a site can be matched to: the words that mean it, in English and Arabic, and where it is
export const CITIES = {
  'cairo': { lat: 30.05, lng: 31.24, keys: ['cairo', 'giza', 'nasr city', 'maadi', 'heliopolis', 'ramsis', 'ramses', 'shubra', 'zamalek', 'mohandessin', 'dokki', 'helwan', 'القاهرة', 'الجيزة', 'رمسيس', 'مدينة نصر', 'المعادي'] },
  'cairo-east': { lat: 30.03, lng: 31.47, keys: ['new cairo', 'fifth settlement', '5th settlement', 'tagamoa', 'madinaty', 'rehab', 'shorouk', 'east cairo', 'القاهرة الجديدة', 'التجمع', 'الشروق'] },
  'cairo-west': { lat: 30.0, lng: 30.98, keys: ['6th of october', '6 october', 'sixth of october', 'october city', 'sheikh zayed', 'west cairo', '6 أكتوبر', 'السادس من أكتوبر', 'الشيخ زايد'] },
  '10th-of-ramadan': { lat: 30.3, lng: 31.74, keys: ['10th of ramadan', '10 ramadan', 'tenth of ramadan', 'العاشر من رمضان'] },
  'obour': { lat: 30.23, lng: 31.47, keys: ['obour', 'العبور'] },
  'badr': { lat: 30.14, lng: 31.72, keys: ['badr', 'بدر'] },
  'alexandria': { lat: 31.2, lng: 29.92, keys: ['alexandria', 'alex', 'iskandariya', 'الإسكندرية', 'الاسكندرية'] },
  'borg-el-arab': { lat: 30.92, lng: 29.58, keys: ['borg el arab', 'burg al arab', 'برج العرب'] },
  'tanta': { lat: 30.79, lng: 31.0, keys: ['tanta', 'طنطا'] },
  'mansoura': { lat: 31.04, lng: 31.38, keys: ['mansoura', 'mansura', 'المنصورة'] },
  'new-mansoura': { lat: 31.42, lng: 31.55, keys: ['new mansoura', 'المنصورة الجديدة'] },
  'damietta': { lat: 31.42, lng: 31.81, keys: ['damietta', 'dumyat', 'new damietta', 'دمياط'] },
  'port-said': { lat: 31.26, lng: 32.3, keys: ['port said', 'بورسعيد'] },
  'ismailia': { lat: 30.6, lng: 32.27, keys: ['ismailia', 'الإسماعيلية', 'الاسماعيلية'] },
  'suez': { lat: 29.97, lng: 32.55, keys: ['suez', 'السويس'] },
  'ain-sokhna': { lat: 29.6, lng: 32.35, keys: ['ain sokhna', 'sokhna', 'العين السخنة'] },
  'zagazig': { lat: 30.59, lng: 31.5, keys: ['zagazig', 'الزقازيق'] },
  'banha': { lat: 30.47, lng: 31.18, keys: ['banha', 'benha', 'بنها'] },
  'mahalla': { lat: 30.97, lng: 31.17, keys: ['mahalla', 'المحلة'] },
  'kafr-el-sheikh': { lat: 31.11, lng: 30.94, keys: ['kafr el sheikh', 'kafr elsheikh', 'كفر الشيخ'] },
  'damanhur': { lat: 31.03, lng: 30.47, keys: ['damanhur', 'damanhour', 'دمنهور'] },
  'shebin-el-kom': { lat: 30.56, lng: 31.01, keys: ['shebin el kom', 'shibin', 'menoufia', 'شبين الكوم', 'المنوفية'] },
  'sadat-city': { lat: 30.37, lng: 30.53, keys: ['sadat city', 'sadat', 'مدينة السادات'] },
  'fayoum': { lat: 29.31, lng: 30.84, keys: ['fayoum', 'faiyum', 'الفيوم'] },
  'beni-suef': { lat: 29.07, lng: 31.1, keys: ['beni suef', 'بني سويف'] },
  'minya': { lat: 28.1, lng: 30.75, keys: ['minya', 'minia', 'المنيا'] },
  'assiut': { lat: 27.18, lng: 31.18, keys: ['assiut', 'asyut', 'أسيوط', 'اسيوط'] },
  'sohag': { lat: 26.56, lng: 31.69, keys: ['sohag', 'سوهاج'] },
  'qena': { lat: 26.16, lng: 32.72, keys: ['qena', 'قنا'] },
  'luxor': { lat: 25.69, lng: 32.64, keys: ['luxor', 'الأقصر', 'الاقصر'] },
  'aswan': { lat: 24.09, lng: 32.9, keys: ['aswan', 'أسوان', 'اسوان'] },
  'hurghada': { lat: 27.26, lng: 33.81, keys: ['hurghada', 'الغردقة'] },
  'el-gouna': { lat: 27.4, lng: 33.68, keys: ['el gouna', 'gouna', 'الجونة'] },
  'safaga': { lat: 26.75, lng: 33.94, keys: ['safaga', 'سفاجا'] },
  'marsa-alam': { lat: 25.07, lng: 34.9, keys: ['marsa alam', 'مرسى علم'] },
  'sharm': { lat: 27.91, lng: 34.33, keys: ['sharm el sheikh', 'sharm', 'شرم الشيخ'] },
  'dahab': { lat: 28.5, lng: 34.5, keys: ['dahab', 'دهب'] },
  'el-arish': { lat: 31.13, lng: 33.8, keys: ['arish', 'العريش'] },
  'marsa-matruh': { lat: 31.35, lng: 27.24, keys: ['matruh', 'marsa matrouh', 'مرسى مطروح', 'مطروح'] },
  'ras-gharib': { lat: 28.36, lng: 33.1, keys: ['ras gharib', 'رأس غارب'] }
};
export const AREAS = { central: 'cairo', east: 'cairo-east', west: 'cairo-west', alexandria: 'alexandria', mansoura: 'mansoura', 'new-mansoura': 'new-mansoura', damietta: 'damietta' };

// the longest words first, so "new mansoura" wins over "mansoura" and "new cairo" over "cairo"
const KEYS = Object.entries(CITIES).flatMap(([id, c]) => c.keys.map(k => [k, id])).sort((a, b) => b[0].length - a[0].length);
const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function cityOf(text) {
  const t = ' ' + norm(text) + ' ';
  if (t.trim() === '') return null;
  for (const [k, id] of KEYS) if (t.includes(' ' + k + ' ')) return id;
  return null;
}
const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
export function place(site) {
  const lat = num(site.lat), lng = num(site.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng, by: 'pin' };
  let id = cityOf(site.city);
  if (id) return { ...CITIES[id], keys: undefined, by: 'city', city: id };
  id = cityOf(site.name);
  if (id) return { ...CITIES[id], keys: undefined, by: 'name', city: id };
  id = AREAS[site.area];
  if (id) return { ...CITIES[id], keys: undefined, by: 'area', city: id };
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
  return { x: lng => (lng - lng0) * K * S, y: lat => (lat1 - lat) * S, w: W, h: Math.round(h * S), lng0, lng1, lat0, lat1 };
}

export const pathOf = (pts, f, close = false) => pts.map(([lng, lat], i) => `${i ? 'L' : 'M'}${f.x(lng).toFixed(1)} ${f.y(lat).toFixed(1)}`).join('') + (close ? 'Z' : '');
