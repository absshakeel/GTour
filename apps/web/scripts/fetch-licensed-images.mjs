import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('public/images');
const WIDTH = 1600;
const USER_AGENT =
  'GTourDemoAssets/1.0 (educational project; contact: support@gtour.local)';

const SLOTS = [
  { slug: 'hero', queries: ['Aerial view tropical island turquoise sea', 'Coastal cliffs turquoise water aerial'], minRatio: 1.5, maxRatio: 3.2 },
  { slug: 'santorini', queries: ['Santorini Oia caldera', 'Oia Santorini white houses'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'kyoto', queries: ['Fushimi Inari torii gates', 'Kiyomizu-dera Kyoto'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'alps', queries: ['Matterhorn Zermatt', 'Swiss Alps mountain lake'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'bali', queries: ['Tegalalang rice terrace Bali', 'Bali rice terraces'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'marrakech', queries: ['Jemaa el-Fnaa Marrakech', 'Marrakech medina Morocco'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'style-mountains', queries: ['Dolomites mountain landscape', 'Alps mountain range sunrise'], minRatio: 1.1, maxRatio: 2.4 },
  { slug: 'style-beaches', queries: ['Maldives beach turquoise', 'Tropical beach palm trees'], minRatio: 1.1, maxRatio: 2.4 },
  { slug: 'style-history', queries: ['Colosseum Rome', 'Ancient temple ruins historic'], minRatio: 1.1, maxRatio: 2.4 },
  { slug: 'style-adventure', queries: ['Hiker backpack mountain trail', 'Trekking mountain path'], minRatio: 1.1, maxRatio: 2.4 },
  { slug: 'style-culture', queries: ['Traditional market culture street', 'Local cultural festival'], minRatio: 1.1, maxRatio: 2.4 },
  { slug: 'style-city', queries: ['City skyline at dusk', 'Modern city skyline'], minRatio: 1.1, maxRatio: 2.4 },
  { slug: 'stay-resort', queries: ['Luxury resort swimming pool', 'Hotel pool terrace sea view'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'stay-room', queries: ['Hotel room interior bed', 'Boutique hotel suite interior'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'stay-terrace', queries: ['Hotel terrace sea view balcony', 'Beachfront hotel terrace'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'service-photographer', queries: ['Photographer camera outdoors shooting', 'Travel photographer taking photo'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'service-vehicle', queries: ['Camper van scenic road trip', 'Car on mountain road travel'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'service-hotel', queries: ['Hotel reception lobby interior', 'Hotel lobby interior'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'inspiration', queries: ['Northern lights Iceland landscape', 'Aurora borealis landscape'], minRatio: 1.4, maxRatio: 3.0 },
  { slug: 'auth', queries: ['Airplane wing above clouds sunset', 'Airplane window clouds view'], minRatio: 1.2, maxRatio: 2.6 },

  // ---- Bangladesh (Module 2 dummy dataset) ----
  { slug: 'bd-coxs-bazar', queries: ["Cox's Bazar beach Bangladesh", "Cox's Bazar sea beach"], minRatio: 1.2, maxRatio: 3.0 },
  { slug: 'bd-saint-martin', queries: ["Saint Martin's Island Bangladesh", 'St Martin Island Bangladesh beach'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-sundarbans', queries: ['Sundarbans mangrove Bangladesh', 'Sundarbans forest river'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-srimangal', queries: ['Srimangal tea garden Bangladesh', 'Sylhet tea garden'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-bandarban', queries: ['Bandarban hill Bangladesh', 'Bandarban Nilgiri Bangladesh'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-rangamati', queries: ['Rangamati lake Bangladesh', 'Kaptai Lake Rangamati'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-kuakata', queries: ['Kuakata beach Bangladesh', 'Kuakata sea beach sunset'], minRatio: 1.2, maxRatio: 3.0 },
  { slug: 'bd-lalbagh-fort', queries: ['Lalbagh Fort Dhaka', 'Lalbagh Kella Dhaka'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'bd-ahsan-manzil', queries: ['Ahsan Manzil Dhaka', 'Ahsan Manzil pink palace'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'bd-sonargaon', queries: ['Sonargaon Panam City Bangladesh', 'Sonargaon folk art museum'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'bd-dhaka-city', queries: ['Dhaka city Bangladesh skyline', 'Dhaka Bangladesh street'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-shat-gombuj', queries: ['Sixty Dome Mosque Bagerhat', 'Shat Gombuj Mosque Bangladesh'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'bd-paharpur', queries: ['Somapura Mahavihara Paharpur', 'Paharpur Buddhist monastery Bangladesh'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'bd-jaflong', queries: ['Jaflong Sylhet Bangladesh', 'Jaflong river stones Sylhet'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-tanguar-haor', queries: ['Tanguar Haor Sunamganj', 'Haor wetland Bangladesh boat'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-ratargul', queries: ['Ratargul swamp forest Sylhet', 'Ratargul swamp forest Bangladesh'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-bholaganj', queries: ['Bholaganj Sylhet Bangladesh', 'Bholaganj white stone Sylhet'], minRatio: 1.2, maxRatio: 2.8 },
  { slug: 'bd-patenga', queries: ['Patenga beach Chittagong', 'Patenga sea beach Bangladesh'], minRatio: 1.2, maxRatio: 3.0 },
  { slug: 'bd-ramna', queries: ['Ramna Park Dhaka', 'Curzon Hall Dhaka University'], minRatio: 1.2, maxRatio: 2.6 },
  { slug: 'bd-heritage-building', queries: ['Panam Nagar historic building Bangladesh', 'Bangladesh colonial heritage building'], minRatio: 1.1, maxRatio: 2.4 },
  { slug: 'bd-hotel-room', queries: ['Hotel room twin beds interior', 'Hotel room bed interior wooden'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'bd-hotel-lodge', queries: ['Riverside wooden lodge', 'Jungle lodge wooden cabin river'], minRatio: 1.2, maxRatio: 2.4 },
  { slug: 'bd-hotel-beachfront', queries: ['Beach hotel resort exterior palm', 'Seaside resort building beach', 'Beachfront hotel swimming pool'], minRatio: 1.0, maxRatio: 3.0 },
  { slug: 'bd-hotel-heritage', queries: ['Colonial hotel building facade', 'Heritage building hotel entrance', 'Hotel courtyard building exterior'], minRatio: 1.0, maxRatio: 3.0 },
  { slug: 'bd-hotel-tea', queries: ['Tea plantation bungalow Assam', 'Planter bungalow tea estate house', 'Tea estate manager bungalow'], minRatio: 1.0, maxRatio: 3.0 },
  { slug: 'bd-food', queries: ['Biryani Bangladesh kacchi', 'Biryani rice dish'], minRatio: 1.1, maxRatio: 2.0 },
  { slug: 'bd-photographer', queries: ['Photographer beach sunset camera', 'Photographer taking photo travel'], minRatio: 1.1, maxRatio: 2.2 },
  { slug: 'bd-boat', queries: ['Wooden boat river Bangladesh', 'River boat Bangladesh traditional'], minRatio: 1.1, maxRatio: 2.6 },
  { slug: 'bd-van', queries: ['Minivan van travel road', 'Passenger van road countryside'], minRatio: 1.1, maxRatio: 2.2 },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const creditsOnly = process.argv.includes('--credits-only');
const selected = only.length ? SLOTS.filter((s) => only.includes(s.slug)) : SLOTS;
if (only.length && selected.length === 0) {
  console.error(`No slots matched: ${only.join(', ')}`);
  process.exit(1);
}

/** Records a credit entry, replacing any earlier entry for the same slug. */
async function saveCredit(creditsPath, entry) {
  let current = [];
  try {
    current = JSON.parse(await readFile(creditsPath, 'utf8'));
    if (!Array.isArray(current)) current = [];
  } catch {
    current = [];
  }
  const merged = [...current.filter((c) => c.slug !== entry.slug), entry];
  merged.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeFile(creditsPath, `${JSON.stringify(merged, null, 2)}\n`);
  return merged.length;
}

async function api(params) {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    ...params,
    format: 'json',
    origin: '*',
  })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function search(query, limit = 20) {
  return api({
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(WIDTH),
  });
}

function plain(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pick(slot) {
  for (const query of slot.queries) {
    let data;
    try {
      data = await search(query);
    } catch {
      continue;
    }

    const pages = Object.values(data?.query?.pages ?? {});
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;

      const ratio = info.width / info.height;
      if (ratio < slot.minRatio || ratio > slot.maxRatio) continue;
      if (info.width < 1200) continue;
      if (/\.(svg|gif|tif|webp)$/i.test(info.url ?? '')) continue;

      const meta = info.extmetadata ?? {};
      const license = plain(meta.LicenseShortName?.value) || 'See source page';
      if (/fair use|non-free/i.test(license)) continue;

      return {
        slug: slot.slug,
        sourcePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(
          page.title.replace(/ /g, '_')
        )}`,
        fileUrl: info.thumburl,
        title: plain(page.title),
        author: plain(meta.Artist?.value) || 'Wikimedia Commons contributor',
        license,
        licenseUrl: plain(meta.LicenseUrl?.value) || undefined,
        width: info.thumbwidth ?? info.width,
        height: info.thumbheight ?? info.height,
      };
    }
  }
  return null;
}

await mkdir(OUT_DIR, { recursive: true });

const creditsPath = path.join(OUT_DIR, 'CREDITS.json');
let existing = [];
try {
  existing = JSON.parse(await readFile(creditsPath, 'utf8'));
  if (!Array.isArray(existing)) existing = [];
} catch {
  existing = [];
}

const credits = [];
for (const slot of selected) {
  const target = path.join(OUT_DIR, `${slot.slug}.jpg`);

  if (creditsOnly) {
    // Metadata backfill: the asset already exists, so only resolve its licence
    // and attribution without re-downloading it.
    const stored = existing.find((c) => c.slug === slot.slug);
    if (stored) {
      console.log(`SKIP  ${slot.slug.padEnd(22)} already credited`);
      continue;
    }
    const meta = await pick(slot);
    if (!meta) {
      console.log(`MISS  ${slot.slug}`);
      continue;
    }
    const size = await stat(target).catch(() => null);
    if (!size) {
      console.log(`MISS  ${slot.slug} (no local file)`);
      continue;
    }
    const total = await saveCredit(creditsPath, meta);
    console.log(`CREDIT ${slot.slug.padEnd(21)} ${meta.license}  (credits: ${total})`);
    await new Promise((r) => setTimeout(r, 300));
    continue;
  }

  const found = await pick(slot);
  if (!found) {
    console.log(`MISS  ${slot.slug}`);
    continue;
  }

  const res = await fetch(found.fileUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    console.log(`FAIL  ${slot.slug} (${res.status})`);
    continue;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buffer);
  credits.push(found);
  const total = await saveCredit(creditsPath, found);
  console.log(
    `OK    ${slot.slug.padEnd(22)} ${(buffer.length / 1024).toFixed(0)}KB  ${found.license}  (credits: ${total})`
  );
  await new Promise((r) => setTimeout(r, 300));
}

if (!creditsOnly) {
  console.log(`\n${credits.length}/${selected.length} images saved.`);
}
