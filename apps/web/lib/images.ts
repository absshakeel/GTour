export interface LicensedImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

const img = (src: string, alt: string, width = 1600, height = 1067): LicensedImage => ({
  src,
  alt,
  width,
  height,
});

/**
 * Curated local photography. Assets were downloaded from Wikimedia Commons with
 * verifiable free licences; per-file attribution lives in
 * `public/images/CREDITS.json` (see prompts/15 §9).
 */
export const images = {
  hero: img(
    '/images/hero.jpg',
    'Aerial view of a turquoise lagoon and beach at a tropical island resort',
    1920,
    1097
  ),
  inspiration: img(
    '/images/inspiration.jpg',
    'Northern lights glowing green over a snowy Icelandic landscape',
    1600,
    900
  ),
  auth: img('/images/auth.jpg', 'View over the clouds from an aeroplane window at sunset', 1600, 1067),
  destinations: {
    santorini: img(
      '/images/santorini.jpg',
      'Whitewashed houses and blue domes above the Santorini caldera, Greece'
    ),
    kyoto: img('/images/kyoto.jpg', 'Rows of vermilion torii gates along a wooded shrine path in Kyoto, Japan'),
    alps: img('/images/alps.jpg', 'Snow-capped Alpine peaks reflected in a still mountain lake'),
    bali: img('/images/bali.jpg', 'Terraced green rice fields in the Bali highlands, Indonesia'),
    marrakech: img(
      '/images/marrakech.jpg',
      'Rooftops and minarets of the Marrakech medina in warm afternoon light, Morocco'
    ),
  },
  styles: {
    mountains: img('/images/style-mountains.jpg', 'Jagged mountain ridgeline lit by sunrise in the Dolomites'),
    beaches: img('/images/style-beaches.jpg', 'Palm trees leaning over a white sand beach and clear turquoise water'),
    history: img('/images/style-history.jpg', 'Ancient stone amphitheatre arches in warm afternoon light'),
    adventure: img('/images/style-adventure.jpg', 'Hiker with a backpack walking a high mountain trail'),
    culture: img('/images/style-culture.jpg', 'Colourful stalls and crowds in a traditional market street'),
    city: img('/images/style-city.jpg', 'City skyline glowing at dusk seen from above the rooftops'),
  },
  stays: {
    resort: img('/images/stay-resort.jpg', 'Swimming pool and sun loungers at a resort looking out to sea'),
    room: img('/images/stay-room.jpg', 'Bright hotel suite with a large bed and soft natural light'),
    terrace: img('/images/stay-terrace.jpg', 'Hotel terrace with seating overlooking a calm bay'),
  },
  services: {
    hotel: img('/images/service-hotel.jpg', 'Warmly lit hotel lobby and reception desk'),
    photographer: img('/images/service-photographer.jpg', 'Photographer holding a camera while shooting outdoors'),
    vehicle: img('/images/service-vehicle.jpg', 'Camper van parked beside a scenic mountain road'),
  },
  /**
   * Bangladesh destination photography. These are the launch-market hero images:
   * seed data references them by path so the web app renders real local assets
   * instead of remote placeholders (see prompts/15 §9).
   */
  bangladesh: {
    coxsBazar: img(
      '/images/bd-coxs-bazar.jpg',
      'Long sandy beach and rolling waves at Cox\'s Bazar, Bangladesh'
    ),
    saintMartin: img(
      '/images/bd-saint-martin.jpg',
      'Clear turquoise water and coral reef shallows off Saint Martin\'s Island, Bangladesh'
    ),
    sundarbans: img(
      '/images/bd-sundarbans.jpg',
      'Mangrove creeks and dense forest in the Sundarbans, Bangladesh'
    ),
    srimangal: img(
      '/images/bd-srimangal.jpg',
      'Terraced tea garden slopes in Srimangal, Sylhet, Bangladesh'
    ),
    bandarban: img(
      '/images/bd-bandarban.jpg',
      'Fog rolling over forested hill ridges in Bandarban, Bangladesh'
    ),
    rangamati: img(
      '/images/bd-rangamati.jpg',
      'Kaptai Lake widening between green hills near Rangamati, Bangladesh'
    ),
    kuakata: img(
      '/images/bd-kuakata.jpg',
      'Fishing boats on the shoreline at Kuakata, Bangladesh'
    ),
    lalbaghFort: img(
      '/images/bd-lalbagh-fort.jpg',
      'Mughal-era gatehouse and gardens of Lalbagh Fort in Dhaka, Bangladesh'
    ),
    ahsanManzil: img(
      '/images/bd-ahsan-manzil.jpg',
      'Ahsan Manzil pink palace on the bank of the Buriganga river in Dhaka, Bangladesh'
    ),
    sonargaon: img(
      '/images/bd-sonargaon.jpg',
      'Colonial-era merchant mansion at Sonargaon, Bangladesh'
    ),
    dhakaCity: img(
      '/images/bd-dhaka-city.jpg',
      'Dhaka city skyline and street life, Bangladesh'
    ),
    shatGombuj: img(
      '/images/bd-shat-gombuj.jpg',
      'Rows of domes on the Sixty Dome Mosque in Bagerhat, Bangladesh'
    ),
    paharpur: img(
      '/images/bd-paharpur.jpg',
      'Brick monastery ruins at Paharpur in Bogra, Bangladesh'
    ),
    jaflong: img(
      '/images/bd-jaflong.jpg',
      'Clear river water and stone collectors beneath the hills at Jaflong, Bangladesh'
    ),
    tanguarHaor: img(
      '/images/bd-tanguar-haor.jpg',
      'Fishing boats moored on the open water of Tanguar Haor, Bangladesh'
    ),
    ratargul: img(
      '/images/bd-ratargul.jpg',
      'Trees standing in the fresh water swamp forest of Ratargul, Bangladesh'
    ),
  },
} as const;
