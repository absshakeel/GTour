import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { AccountStatus, BookingStatus, PaymentStatus, UserRole } from '@gtour/shared-types';
import { loadEnv } from '../config/env';
import { resolveMongoUri } from '../config/mongoUri';
import { currencyCode } from '../config/currency';
import User from '../models/User';
import Location from '../models/Location';
import Category from '../models/Category';
import Destination from '../models/Destination';
import Hotel from '../models/Hotel';
import Room from '../models/Room';
import RoomAvailability from '../models/RoomAvailability';
import Booking from '../models/Booking';
import Payment from '../models/Payment';
import Photographer from '../models/Photographer';
import PhotographyService from '../models/PhotographyService';
import Portfolio from '../models/Portfolio';
import VehicleProvider from '../models/VehicleProvider';
import Vehicle from '../models/Vehicle';
import VehicleAvailability from '../models/VehicleAvailability';
import { eachNight, startOfUtcDay } from '../utils/dates';

loadEnv();

/**
 * Demo dataset for the Bangladesh launch market.
 *
 * Idempotent by design: every record is matched on a natural key (email, name,
 * destination+owner, room type, booking reference, ...) and only inserted when
 * missing, so the script can be re-run against the same database without
 * duplicating data and without ever deleting anything.
 *
 * Money is in BDT and every price a guest could be quoted is computed the same
 * way `quoteStay` computes it (`price_override ?? price_per_night`, times nights,
 * times rooms) so the seeded `price_snapshot.total` always reconciles.
 */

const DEMO_PASSWORD = 'Demo1234!';
const IMAGE = (slug: string) => `/images/${slug}.jpg`;
/** Photographs of actual hotel buildings, rooms and grounds (see CREDITS.json). */
const HOTEL_PHOTOS = {
  beachfront: IMAGE('bd-hotel-beachfront'),
  heritage: IMAGE('bd-hotel-heritage'),
  lobby: IMAGE('service-hotel'),
  lodge: IMAGE('bd-hotel-lodge'),
  resort: IMAGE('stay-resort'),
  room: IMAGE('bd-hotel-room'),
  tea: IMAGE('bd-hotel-tea'),
};

/** Deterministic pseudo-random so re-runs produce the same schedule. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = makeRandom(20260226);
const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length) % items.length];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const roundTo = (value: number, step = 50) => Math.round(value / step) * step;

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return startOfUtcDay(next);
}

function bookingReference(index: number): string {
  return `BTG-DEMO${index.toString(36).toUpperCase().padStart(2, '0')}-${(index * 7919)
    .toString(36)
    .toUpperCase()
    .slice(-6)
    .padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

const LOCATIONS = [
  { name: "Cox's Bazar", region: 'Chittagong', latitude: 21.4272, longitude: 92.0058, description: 'Home of the longest natural sea beach in the world.' },
  { name: "Saint Martin's Island", region: 'Chittagong', latitude: 20.6262, longitude: 92.3222, description: "Bangladesh's only coral island, in the Bay of Bengal." },
  { name: 'Sundarbans', region: 'Khulna', latitude: 21.9497, longitude: 89.1833, description: 'The largest mangrove forest on earth and a UNESCO World Heritage Site.' },
  { name: 'Srimangal', region: 'Sylhet', latitude: 24.3065, longitude: 91.7296, description: 'The tea capital of Bangladesh, ringed by low green hills.' },
  { name: 'Jaflong', region: 'Sylhet', latitude: 25.1667, longitude: 92.0167, description: 'Riverine border village below the Khasi hills.' },
  { name: 'Ratargul', region: 'Sylhet', latitude: 25.0, longitude: 91.9, description: 'A freshwater swamp forest flooded for much of the year.' },
  { name: 'Tanguar Haor', region: 'Sylhet', latitude: 25.1544, longitude: 91.0869, description: 'A vast wetland of haors and beels in Sunamganj.' },
  { name: 'Bholaganj', region: 'Sylhet', latitude: 25.1833, longitude: 91.6833, description: 'White stone quarries beside the Piyain river.' },
  { name: 'Bandarban', region: 'Chittagong', latitude: 22.1953, longitude: 92.2183, description: 'The highest hills in Bangladesh, home to the Marma and Bawm communities.' },
  { name: 'Rangamati', region: 'Chittagong', latitude: 22.6533, longitude: 92.173, description: 'Hill town wrapped around the Kaptai Lake.' },
  { name: 'Kuakata', region: 'Barisal', latitude: 21.8167, longitude: 90.1167, description: 'A beach where both sunrise and sunset are visible over the sea.' },
  { name: 'Dhaka', region: 'Dhaka', latitude: 23.8103, longitude: 90.4125, description: 'The capital: Mughal gardens, rickshaws, and a river full of boats.' },
  { name: 'Sonargaon', region: 'Dhaka', latitude: 23.65, longitude: 90.6, description: 'The medieval capital of Bengal and its abandoned merchant quarter.' },
  { name: 'Bagerhat', region: 'Khulna', latitude: 22.66, longitude: 89.8, description: 'City of mosques, founded by Khan Jahan Ali in the fifteenth century.' },
  { name: 'Paharpur', region: 'Rajshahi', latitude: 25.0311, longitude: 88.9769, description: 'Ruins of the largest Buddhist monastery south of the Himalayas.' },
  { name: 'Patenga', region: 'Chittagong', latitude: 22.2333, longitude: 91.8, description: 'The sea beach where the Karnaphuli meets the Bay of Bengal.' },
];

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

const DESTINATIONS = [
  { name: `Cox's Bazar Beach`, location: "Cox's Bazar", category: 'Beach & Island', image: 'bd-coxs-bazar', budget: 12000, season: 'November to March', rating: 4.7, views: 4820, description: "One hundred and twenty kilometres of unbroken sand along the Bay of Bengal. Mornings belong to the fishermen and the beach ponies; evenings to the seafood stalls that set up along the shore." },
  { name: "Saint Martin's Island", location: "Saint Martin's Island", category: 'Beach & Island', image: 'bd-saint-martin', budget: 18000, season: 'November to February', rating: 4.6, views: 2140, description: 'A tiny coral island reachable by a three-hour cruise from Teknaf. The water is clear enough to watch reef fish from a wooden boat, and the island is small enough to walk end to end.' },
  { name: 'Sundarbans Mangrove Forest', location: 'Sundarbans', category: 'Wildlife & Safari', image: 'bd-sundarbans', budget: 22000, season: 'November to February', rating: 4.8, views: 3260, description: 'Tidal creeks threading through the largest mangrove forest in the world, and the last stronghold of the Royal Bengal tiger. Most visitors explore by boat, sleeping on board or in forest department rest houses.' },
  { name: 'Srimangal Tea Gardens', location: 'Srimangal', category: 'Wellness & Retreat', image: 'bd-srimangal', budget: 9500, season: 'October to March', rating: 4.5, views: 1890, description: 'Rolling tea estates, the Lawachara rainforest, and seven-layer tea served at a roadside stall. The air is cool and the pace is slow, which is exactly the point.' },
  { name: 'Bandarban Hill Tracts', location: 'Bandarban', category: 'Mountain & Nature', image: 'bd-bandarban', budget: 14000, season: 'November to February', rating: 4.7, views: 2760, description: 'Cloud-covered ridges, bamboo villages, and the trail to Nilgiri and Boga Lake. The highest peaks in Bangladesh are all here.' },
  { name: 'Rangamati and Kaptai Lake', location: 'Rangamati', category: 'Mountain & Nature', image: 'bd-rangamati', budget: 11000, season: 'October to March', rating: 4.4, views: 1620, description: 'A hill town built along the shores of a man-made lake, connected to the mainland by a long wooden bridge. Boats run to floating markets and riverside villages.' },
  { name: 'Kuakata Sea Beach', location: 'Kuakata', category: 'Beach & Island', image: 'bd-kuakata', budget: 10000, season: 'November to March', rating: 4.3, views: 1180, description: 'One of the few beaches where the sun can be seen rising and setting over the water. Fishing boats land here in the morning and the beach is quiet by dusk.' },
  { name: 'Lalbagh Fort', location: 'Dhaka', category: 'Cultural & Heritage', image: 'bd-lalbagh-fort', budget: 3000, season: 'All year', rating: 4.2, views: 2410, description: 'An unfinished Mughal fort begun in 1678 by Prince Muhammad Azam. The tomb of Pari Bibi, a hammam, and a mosque stand inside walled gardens in the middle of old Dhaka.' },
  { name: 'Ahsan Manzil Palace', location: 'Dhaka', category: 'Cultural & Heritage', image: 'bd-ahsan-manzil', budget: 3000, season: 'All year', rating: 4.4, views: 2070, description: 'The pink palace of the Nawabs of Dhaka, facing the Buriganga. Twenty-three rooms of period furniture, and a riverside terrace where boats still dock.' },
  { name: 'Sonargaon Folk Art Museum', location: 'Sonargaon', category: 'Cultural & Heritage', image: 'bd-sonargaon', budget: 4000, season: 'October to March', rating: 4.1, views: 940, description: 'The abandoned merchant city of Panam Nagar, a single street of crumbling nineteenth-century Hindu trading houses, paired with a folk art and craft museum.' },
  { name: 'Dhaka City Break', location: 'Dhaka', category: 'City Break', image: 'bd-dhaka-city', budget: 15000, season: 'November to February', rating: 4.3, views: 3980, description: 'Rickshaw rides through Old Dhaka, biryani at a century-old restaurant, the boat docks at Sadarghat, and the country\'s best museums and galleries.' },
  { name: 'Sixty Dome Mosque', location: 'Bagerhat', category: 'Cultural & Heritage', image: 'bd-shat-gombuj', budget: 6000, season: 'October to March', rating: 4.6, views: 1370, description: 'The Shat Gombuj Masjid, built in the fifteenth century by Khan Jahan Ali, is the most impressive Sultanate monument in Bangladesh and a UNESCO World Heritage Site.' },
  { name: 'Somapura Mahavihara', location: 'Paharpur', category: 'Cultural & Heritage', image: 'bd-paharpur', budget: 7000, season: 'October to March', rating: 4.5, views: 880, description: 'The excavated remains of an eighth-century Buddhist monastery, the largest such site in South Asia, with a stepped central temple and hundreds of monastic cells.' },
  { name: 'Jaflong and Bholaganj', location: 'Jaflong', category: 'Mountain & Nature', image: 'bd-jaflong', budget: 8500, season: 'September to March', rating: 4.2, views: 1450, description: 'Clear green water running down from the Khasi hills, stone collectors wading midstream, and the tea gardens of the Sylhet border country close by.' },
  { name: 'Tanguar Haor Wetlands', location: 'Tanguar Haor', category: 'Wildlife & Safari', image: 'bd-tanguar-haor', budget: 12000, season: 'August to March', rating: 4.7, views: 1660, description: 'A Ramsar wetland of open water and submerged villages in Sunamganj. In monsoon it becomes an inland sea; in winter it fills with migratory birds.' },
  { name: 'Ratargul Swamp Forest', location: 'Ratargul', category: 'Adventure', image: 'bd-ratargul', budget: 6500, season: 'June to October', rating: 4.4, views: 1740, description: 'Trees standing in knee-deep water and narrow channels navigated by wooden dinghy. The forest is at its best in monsoon, when the water is high enough to row between the trunks.' },
];

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const USERS = [
  // Tourists
  { email: 'rafiul.islam@demo.gtour.bd', name: 'Rafiul Islam', phone: '+8801711234567', role: UserRole.TOURIST },
  { email: 'nusrat.jahan@demo.gtour.bd', name: 'Nusrat Jahan', phone: '+8801811234568', role: UserRole.TOURIST },
  { email: 'tanvir.ahmed@demo.gtour.bd', name: 'Tanvir Ahmed', phone: '+8801911234569', role: UserRole.TOURIST },
  { email: 'sharmin.akter@demo.gtour.bd', name: 'Sharmin Akter', phone: '+8801611234570', role: UserRole.TOURIST },
  { email: 'mahmudul.hasan@demo.gtour.bd', name: 'Mahmudul Hasan', phone: '+8801511234571', role: UserRole.TOURIST },
  // Hotel owners
  { email: 'sabbir.hossain@demo.gtour.bd', name: 'Sabbir Hossain', phone: '+8801711234580', role: UserRole.HOTEL_OWNER },
  { email: 'farhana.rahman@demo.gtour.bd', name: 'Farhana Rahman', phone: '+8801811234581', role: UserRole.HOTEL_OWNER },
  { email: 'imran.kabir@demo.gtour.bd', name: 'Imran Kabir', phone: '+8801911234582', role: UserRole.HOTEL_OWNER },
  { email: 'sultana.zaman@demo.gtour.bd', name: 'Sultana Zaman', phone: '+8801611234583', role: UserRole.HOTEL_OWNER },
  // Photographer
  { email: 'arif.chowdhury@demo.gtour.bd', name: 'Arif Chowdhury', phone: '+8801711234590', role: UserRole.PHOTOGRAPHER },
  // Vehicle provider
  { email: 'jasim.uddin@demo.gtour.bd', name: 'Jasim Uddin', phone: '+8801811234595', role: UserRole.VEHICLE_PROVIDER },
  // Admin
  { email: 'admin@demo.gtour.bd', name: 'Shahidul Alam', phone: '+8801711000001', role: UserRole.ADMIN },
];

// ---------------------------------------------------------------------------
// Hotels and rooms
// ---------------------------------------------------------------------------

const HOTELS = [
  {
    name: 'Ocean Pearl Cox\'s Bazar',
    ownerEmail: 'sabbir.hossain@demo.gtour.bd',
    destination: `Cox's Bazar Beach`,
    address: 'Plot 12, Hotel Motel Zone, Kolatoli Road, Cox\'s Bazar 4700',
    phone: '+88034162701',
    email: 'reservations@oceanpearlcbr.demo.bd',
    rating: 4.6,
    images: [HOTEL_PHOTOS.beachfront, HOTEL_PHOTOS.resort, HOTEL_PHOTOS.room],
    description: 'A 42-room seafront hotel two minutes from Kolatoli beach. Rooms face either the Bay of Bengal or the swimming pool, and the rooftop restaurant serves fresh catch every evening.',
    rooms: [
      { room_type: 'Non-AC Standard Twin', bed_type: '2 Single Beds', capacity: 3, price_per_night: 3200, total_rooms: 10, amenities: ['Free WiFi', 'Breakfast included', 'Room service', 'Hot water', 'Cable TV'], images: [HOTEL_PHOTOS.room] },
      { room_type: 'AC Deluxe Sea View', bed_type: '1 King Bed', capacity: 3, price_per_night: 6500, total_rooms: 14, amenities: ['Air conditioning', 'Sea view balcony', 'Free WiFi', 'Breakfast included', 'Mini fridge', 'Room service'], images: [HOTEL_PHOTOS.room, HOTEL_PHOTOS.beachfront] },
      { room_type: 'Executive Family Suite', bed_type: '1 King + 2 Single Beds', capacity: 6, price_per_night: 11500, total_rooms: 6, amenities: ['Air conditioning', 'Sea view balcony', 'Living area', 'Free WiFi', 'Breakfast included', 'Mini bar'], images: [HOTEL_PHOTOS.resort, HOTEL_PHOTOS.room] },
    ],
  },
  {
    name: 'Nilgiri Hill Resort Bandarban',
    ownerEmail: 'farhana.rahman@demo.gtour.bd',
    destination: 'Bandarban Hill Tracts',
    address: 'Nilachal Road, Bandarban Sadar, Bandarban 4600',
    phone: '+88036162504',
    email: 'stay@nilgirihillresort.demo.bd',
    rating: 4.7,
    images: [HOTEL_PHOTOS.resort, HOTEL_PHOTOS.room],
    description: 'Cottages built into the hillside at Nilachal, with verandas facing the cloud line. Mornings are cool enough for tea on the deck; the walk down to town takes twenty minutes.',
    rooms: [
      { room_type: 'Hill View Cottage', bed_type: '1 Queen Bed', capacity: 3, price_per_night: 5500, total_rooms: 8, amenities: ['Air conditioning', 'Hill view veranda', 'Free WiFi', 'Breakfast included', 'Room heater'], images: [HOTEL_PHOTOS.room, HOTEL_PHOTOS.resort] },
      { room_type: 'Bamboo Family Cottage', bed_type: '2 Double Beds', capacity: 5, price_per_night: 8500, total_rooms: 5, amenities: ['Air conditioning', 'Balcony', 'Free WiFi', 'Breakfast included', 'Room service'], images: [HOTEL_PHOTOS.room] },
      { room_type: 'Cloudline Premium Suite', bed_type: '1 King Bed', capacity: 2, price_per_night: 12500, total_rooms: 3, amenities: ['Air conditioning', 'Panoramic hill view', 'Bathtub', 'Free WiFi', 'Breakfast and dinner', 'Mini bar'], images: [HOTEL_PHOTOS.resort, HOTEL_PHOTOS.room] },
    ],
  },
  {
    name: 'Tea Leaf Retreat Srimangal',
    ownerEmail: 'imran.kabir@demo.gtour.bd',
    destination: 'Srimangal Tea Gardens',
    address: 'Ramnagar Tea Estate Road, Srimangal, Moulvibazar 3210',
    phone: '+88086162508',
    email: 'bookings@tealeafretreat.demo.bd',
    rating: 4.5,
    images: [HOTEL_PHOTOS.tea, HOTEL_PHOTOS.room],
    description: 'A converted estate bungalow surrounded by tea on three sides. Guests get a guided walk through the picking rows and a tasting of the estate\'s own first flush.',
    rooms: [
      { room_type: 'Garden View Double', bed_type: '1 Double Bed', capacity: 2, price_per_night: 4200, total_rooms: 9, amenities: ['Free WiFi', 'Breakfast included', 'Tea estate walk', 'Room service', 'Hot water'], images: [HOTEL_PHOTOS.room, HOTEL_PHOTOS.tea] },
      { room_type: 'Planter\'s Suite', bed_type: '1 King Bed', capacity: 3, price_per_night: 7800, total_rooms: 4, amenities: ['Air conditioning', 'Garden view', 'Free WiFi', 'Breakfast included', 'Tea tasting', 'Mini bar'], images: [HOTEL_PHOTOS.tea, HOTEL_PHOTOS.room] },
    ],
  },
  {
    name: 'Buriganga Heritage Dhaka',
    ownerEmail: 'sultana.zaman@demo.gtour.bd',
    destination: 'Dhaka City Break',
    address: '26 Nawabpur Road, Old Dhaka, Dhaka 1100',
    phone: '+880255661290',
    email: 'front.desk@burigangaheritage.demo.bd',
    rating: 4.4,
    images: [HOTEL_PHOTOS.heritage, HOTEL_PHOTOS.lobby],
    description: 'A restored colonial townhouse in Old Dhaka with a courtyard restaurant. Lalbagh Fort and Ahsan Manzil are both within a fifteen-minute rickshaw ride.',
    rooms: [
      { room_type: 'Heritage Standard', bed_type: '1 Double Bed', capacity: 2, price_per_night: 4800, total_rooms: 12, amenities: ['Air conditioning', 'Free WiFi', 'Breakfast included', 'Hot water', 'Cable TV'], images: [HOTEL_PHOTOS.room] },
      { room_type: 'Courtyard Heritage Suite', bed_type: '1 King Bed', capacity: 3, price_per_night: 9200, total_rooms: 5, amenities: ['Air conditioning', 'Courtyard view', 'Free WiFi', 'Breakfast included', 'Airport pickup', 'Mini bar'], images: [HOTEL_PHOTOS.lobby, HOTEL_PHOTOS.room] },
    ],
  },
  {
    name: 'Sundarbans Riverside Lodge',
    ownerEmail: 'sabbir.hossain@demo.gtour.bd',
    destination: 'Sundarbans Mangrove Forest',
    address: 'Mongla Port Road, Mongla, Bagerhat 9350',
    phone: '+88041162513',
    email: 'info@sundarbanslodge.demo.bd',
    rating: 4.5,
    images: [HOTEL_PHOTOS.lodge, HOTEL_PHOTOS.room],
    description: 'The staging point for forest cruises: a riverside lodge at Mongla with moored boats, a dining hall serving river fish, and guided day trips into the mangrove creeks.',
    rooms: [
      { room_type: 'Riverside Double', bed_type: '1 Double Bed', capacity: 2, price_per_night: 3800, total_rooms: 10, amenities: ['Air conditioning', 'River view', 'Free WiFi', 'Breakfast included', 'Hot water'], images: [HOTEL_PHOTOS.room, HOTEL_PHOTOS.lodge] },
      { room_type: 'Forest Cruise Cabin Package', bed_type: '2 Single Beds', capacity: 2, price_per_night: 8500, total_rooms: 6, amenities: ['Air conditioning', 'Guided boat cruise', 'All meals included', 'Forest permit assistance', 'Life jackets'], images: [HOTEL_PHOTOS.room] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Photography and vehicles
// ---------------------------------------------------------------------------

const PHOTOGRAPHER = {
  name: 'Arif Chowdhury',
  email: 'arif.chowdhury@demo.gtour.bd',
  phone: '+8801711234590',
  destination: 'Sundarbans Mangrove Forest',
  rating: 4.8,
  bio: 'Documentary and travel photographer based in Dhaka, working across the coast and the hill tracts since 2016. Specialises in dawn and dusk shoots and in small-group travel documentation.',
  profile_image: IMAGE('bd-dhaka-city'),
};

const PHOTOGRAPHY_SERVICES = [
  {
    name: 'Cox\'s Bazar Sunrise Portrait Session',
    description: 'A two-hour golden-hour session on Kolatoli beach, including 40 edited photographs delivered within five days.',
    price_per_session: 12000,
    duration_hours: 2,
    images: [IMAGE('bd-coxs-bazar')],
    portfolio: [IMAGE('bd-coxs-bazar'), IMAGE('bd-saint-martin')],
  },
  {
    name: 'Sundarbans Boat Photography Expedition',
    description: 'A full-day guided photography cruise through the mangrove creeks with a forest permit and lunch aboard.',
    price_per_session: 24000,
    duration_hours: 9,
    images: [IMAGE('bd-sundarbans')],
    portfolio: [IMAGE('bd-sundarbans'), IMAGE('bd-tanguar-haor')],
  },
  {
    name: 'Bandarban Hill Trail Documentary Shoot',
    description: 'Three days of travel documentary coverage across Bandarban, with a short edited film and a photo set.',
    price_per_session: 45000,
    duration_hours: 24,
    images: [IMAGE('bd-bandarban')],
    portfolio: [IMAGE('bd-bandarban'), IMAGE('bd-rangamati')],
  },
];

const VEHICLE_PROVIDER = {
  name: 'Jasim Uddin Travels',
  email: 'jasim.uddin@demo.gtour.bd',
  phone: '+8801811234595',
  rating: 4.6,
  description: 'Dhaka-based transport operator running air-conditioned coaches, four-wheel drives for the hill districts, and multi-day haor launches with experienced local drivers.',
};

const VEHICLES = [
  { name: 'Toyota Hiace 11-Seater Coach', type: 'Microbus', capacity: 11, price_per_day: 9500, fleet: 3, features: ['Air conditioning', 'Experienced driver', 'Diesel and tolls included', 'Luggage space'], images: [IMAGE('bd-dhaka-city')] },
  { name: 'Toyota Land Cruiser 4WD', type: 'SUV', capacity: 7, price_per_day: 14000, fleet: 2, features: ['Air conditioning', 'All-terrain tyres', 'Hill road certified driver', 'First aid kit'], images: [IMAGE('bd-bandarban')] },
  { name: 'Sundarbans Tourist Launch (Shared)', type: 'Tourist Launch', capacity: 40, price_per_day: 32000, fleet: 2, features: ['On-board meals', 'Life jackets', 'Forest permit assistance', 'Guided commentary'], images: [IMAGE('bd-sundarbans')] },
  { name: '43-Seat AC Coach for City Tours', type: 'Large Coach', capacity: 43, price_per_day: 28000, fleet: 2, features: ['Air conditioning', 'Reclining seats', 'PA system', 'On-board guide'], images: [IMAGE('bd-sonargaon')] },
];

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

const SPECIAL_REQUESTS = [
  'Please arrange an extra bed for the child travelling with us.',
  'We would prefer a room on a higher floor with a sea-facing balcony.',
  'Arriving on the morning flight; a late check-in around midnight.',
  'Could you keep hilsa and plain rice for dinner? We will pay separately.',
  'Requesting a quiet room away from the road, we are travelling with an infant.',
  'Please arrange airport pickup from Cox\'s Bazar, flight arrives 10:40 am.',
  'We are a family of five, please confirm the extra mattress before arrival.',
  'Halal breakfast only, and no beef please.',
  undefined,
  undefined,
  undefined,
];

const CANCELLATION_REASONS = [
  'Family emergency, we had to cancel the trip to Cox\'s Bazar.',
  'Train schedule changed and we could not reach Bandarban in time.',
  'Weather warning issued for the coast; postponed to next month.',
];

const BOOKING_PLAN: {
  userIndex: number;
  hotelName: string;
  roomType: string;
  status: BookingStatus;
  startOffset: number;
  nights: number;
  rooms: number;
  guests: number;
}[] = [
  { userIndex: 0, hotelName: "Ocean Pearl Cox's Bazar", roomType: 'AC Deluxe Sea View', status: BookingStatus.PENDING, startOffset: 12, nights: 3, rooms: 1, guests: 2 },
  { userIndex: 1, hotelName: 'Nilgiri Hill Resort Bandarban', roomType: 'Hill View Cottage', status: BookingStatus.PENDING, startOffset: 21, nights: 2, rooms: 2, guests: 5 },
  { userIndex: 2, hotelName: 'Tea Leaf Retreat Srimangal', roomType: 'Garden View Double', status: BookingStatus.PENDING, startOffset: 8, nights: 2, rooms: 1, guests: 2 },
  { userIndex: 3, hotelName: 'Buriganga Heritage Dhaka', roomType: 'Courtyard Heritage Suite', status: BookingStatus.PENDING, startOffset: 30, nights: 4, rooms: 1, guests: 3 },
  { userIndex: 0, hotelName: 'Nilgiri Hill Resort Bandarban', roomType: 'Cloudline Premium Suite', status: BookingStatus.CONFIRMED, startOffset: 18, nights: 3, rooms: 1, guests: 2 },
  { userIndex: 1, hotelName: "Ocean Pearl Cox's Bazar", roomType: 'Executive Family Suite', status: BookingStatus.CONFIRMED, startOffset: 25, nights: 5, rooms: 1, guests: 6 },
  { userIndex: 4, hotelName: 'Sundarbans Riverside Lodge', roomType: 'Forest Cruise Cabin Package', status: BookingStatus.CONFIRMED, startOffset: 14, nights: 3, rooms: 2, guests: 4 },
  { userIndex: 2, hotelName: 'Buriganga Heritage Dhaka', roomType: 'Heritage Standard', status: BookingStatus.CONFIRMED, startOffset: 6, nights: 2, rooms: 3, guests: 6 },
  { userIndex: 3, hotelName: 'Tea Leaf Retreat Srimangal', roomType: "Planter's Suite", status: BookingStatus.CONFIRMED, startOffset: 40, nights: 3, rooms: 1, guests: 3 },
  { userIndex: 0, hotelName: "Ocean Pearl Cox's Bazar", roomType: 'Non-AC Standard Twin', status: BookingStatus.COMPLETED, startOffset: -34, nights: 3, rooms: 1, guests: 3 },
  { userIndex: 2, hotelName: 'Nilgiri Hill Resort Bandarban', roomType: 'Bamboo Family Cottage', status: BookingStatus.COMPLETED, startOffset: -26, nights: 4, rooms: 1, guests: 5 },
  { userIndex: 4, hotelName: 'Tea Leaf Retreat Srimangal', roomType: 'Garden View Double', status: BookingStatus.COMPLETED, startOffset: -18, nights: 2, rooms: 2, guests: 4 },
  { userIndex: 1, hotelName: 'Sundarbans Riverside Lodge', roomType: 'Riverside Double', status: BookingStatus.COMPLETED, startOffset: -12, nights: 2, rooms: 1, guests: 2 },
  { userIndex: 3, hotelName: 'Buriganga Heritage Dhaka', roomType: 'Heritage Standard', status: BookingStatus.COMPLETED, startOffset: -45, nights: 1, rooms: 2, guests: 4 },
  { userIndex: 1, hotelName: "Ocean Pearl Cox's Bazar", roomType: 'AC Deluxe Sea View', status: BookingStatus.CANCELLED, startOffset: 16, nights: 4, rooms: 2, guests: 4 },
  { userIndex: 2, hotelName: 'Nilgiri Hill Resort Bandarban', roomType: 'Hill View Cottage', status: BookingStatus.CANCELLED, startOffset: -6, nights: 3, rooms: 1, guests: 2 },
  { userIndex: 4, hotelName: 'Buriganga Heritage Dhaka', roomType: 'Courtyard Heritage Suite', status: BookingStatus.CANCELLED, startOffset: 34, nights: 2, rooms: 1, guests: 2 },
  { userIndex: 0, hotelName: 'Tea Leaf Retreat Srimangal', roomType: "Planter's Suite", status: BookingStatus.NO_SHOW, startOffset: -22, nights: 2, rooms: 1, guests: 2 },
  { userIndex: 3, hotelName: 'Sundarbans Riverside Lodge', roomType: 'Forest Cruise Cabin Package', status: BookingStatus.NO_SHOW, startOffset: -9, nights: 2, rooms: 1, guests: 3 },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function upsertUser(seed: (typeof USERS)[number], passwordHash: string) {
  const existing = await User.findOne({ email: seed.email });
  if (existing) return existing;

  return User.create({
    email: seed.email,
    password_hash: passwordHash,
    name: seed.name,
    phone: seed.phone,
    role: seed.role,
    account_status: AccountStatus.ACTIVE,
  });
}

async function upsertCategory(name: string, description: string, icon: string) {
  return Category.findOneAndUpdate(
    { name },
    { $setOnInsert: { name, description, icon } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertLocation(seed: (typeof LOCATIONS)[number]) {
  return Location.findOneAndUpdate(
    { name: seed.name, country: 'Bangladesh' },
    {
      $setOnInsert: {
        name: seed.name,
        country: 'Bangladesh',
        region: seed.region,
        description: seed.description,
        coordinates: { latitude: seed.latitude, longitude: seed.longitude },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertDestination(
  seed: (typeof DESTINATIONS)[number],
  categoryIds: Map<string, mongoose.Types.ObjectId>,
  locationIds: Map<string, mongoose.Types.ObjectId>
) {
  const existing = await Destination.findOne({ name: seed.name, archived_at: null });
  if (existing) return { destination: existing, created: false };

  const destination = await Destination.create({
    name: seed.name,
    description: seed.description,
    images: [IMAGE(seed.image)],
    estimated_budget: seed.budget,
    best_visit_season: seed.season,
    average_rating: seed.rating,
    views: seed.views,
    category_id: categoryIds.get(seed.category),
    location_id: locationIds.get(seed.location),
  });

  return { destination, created: true };
}

async function upsertHotel(
  seed: (typeof HOTELS)[number],
  ownerIds: Map<string, mongoose.Types.ObjectId>,
  destinationIds: Map<string, mongoose.Types.ObjectId>
) {
  const ownerId = ownerIds.get(seed.ownerEmail);
  const destinationId = destinationIds.get(seed.destination);
  const existing = await Hotel.findOne({ name: seed.name, owner_id: ownerId });

  if (existing) {
    // The demo hotels are owned by this seed, so keep their structural fields in
    // sync. This repairs references left dangling by an interrupted copy and
    // makes repeated runs converge on the same state.
    existing.set({
      description: seed.description,
      address: seed.address,
      phone: seed.phone,
      email: seed.email,
      images: seed.images,
      rating: seed.rating,
      destination_id: destinationId,
      owner_id: ownerId,
    });
    await existing.save();
    return existing;
  }

  return Hotel.create({
    name: seed.name,
    description: seed.description,
    address: seed.address,
    phone: seed.phone,
    email: seed.email,
    images: seed.images,
    rating: seed.rating,
    destination_id: destinationId,
    owner_id: ownerId,
  });
}

async function upsertRoom(hotelId: mongoose.Types.ObjectId, seed: (typeof HOTELS)[number]['rooms'][number]) {
  const existing = await Room.findOne({ hotel_id: hotelId, room_type: seed.room_type });
  if (existing) {
    existing.set({
      bed_type: seed.bed_type,
      capacity: seed.capacity,
      price_per_night: seed.price_per_night,
      total_rooms: seed.total_rooms,
      amenities: seed.amenities,
      images: seed.images,
    });
    await existing.save();
    return existing;
  }

  return Room.create({
    hotel_id: hotelId,
    room_type: seed.room_type,
    bed_type: seed.bed_type,
    capacity: seed.capacity,
    price_per_night: seed.price_per_night,
    total_rooms: seed.total_rooms,
    amenities: seed.amenities,
    images: seed.images,
  });
}

/** Mirrors `statusFor` in the availability service so the calendar looks real. */
function statusFor(availableRooms: number, totalRooms: number): 'available' | 'partial' | 'unavailable' {
  if (availableRooms <= 0) return 'unavailable';
  if (availableRooms < totalRooms) return 'partial';
  return 'available';
}

async function seedAvailability(
  roomId: mongoose.Types.ObjectId,
  totalRooms: number,
  basePrice: number,
  days: number
) {
  const today = startOfUtcDay(new Date());
  const operations: Parameters<typeof RoomAvailability.bulkWrite>[0] = [];

  for (let offset = 0; offset < days; offset++) {
    const date = addDays(today, offset);
    const roll = random();

    // A realistic mix: most nights sell down gradually, a few are blocked for
    // maintenance, and weekend/holiday nights carry a small seasonal premium.
    let available: number;
    let overridePrice: number | undefined;

    if (roll < 0.06) {
      available = 0;
    } else if (roll < 0.32) {
      available = between(1, Math.max(1, totalRooms - 1));
    } else {
      available = totalRooms;
    }

    const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
    const festive = (date.getUTCMonth() === 11 && date.getUTCDate() > 20) || (date.getUTCMonth() === 3 && date.getUTCDate() < 15);
    if (weekend || festive) {
      overridePrice = roundTo(basePrice * (festive ? 1.25 : 1.1), 50);
    } else if (roll > 0.9) {
      overridePrice = roundTo(basePrice * 0.9, 50);
    }

    operations.push({
      updateOne: {
        filter: { room_id: roomId, date },
        update: {
          $set: {
            available_rooms: available,
            status: statusFor(available, totalRooms),
            ...(overridePrice === undefined ? {} : { price_override: overridePrice }),
          },
          $setOnInsert: { room_id: roomId, date },
        },
        upsert: true,
      },
    });
  }

  if (operations.length) {
    await RoomAvailability.bulkWrite(operations, { ordered: false });
  }

  return operations.length;
}

/**
 * Cost of a stay exactly as `quoteStay` computes it: each night priced at its
 * override when one exists, otherwise the room's base rate.
 */
function priceStay(
  start: Date,
  end: Date,
  rooms: number,
  basePrice: number,
  overrides: Map<string, number>
) {
  const nightly = eachNight(start, end).map((night) => {
    const key = night.toISOString().slice(0, 10);
    const price_per_night = overrides.get(key) ?? basePrice;
    return { date: key, price_per_night };
  });

  const subtotal = nightly.reduce((sum, night) => sum + night.price_per_night * rooms, 0);

  return {
    nights: nightly.length,
    nightly,
    price_per_night: nightly[0]?.price_per_night ?? basePrice,
    subtotal,
    total: subtotal,
  };
}

/**
 * Canonical destination categories. The catalogue is Bangladesh-only, so any
 * category outside this set is a leftover from the retired global seeds.
 */
const CATEGORY_META: Record<string, { description: string; icon: string }> = {
  'Beach & Island': { description: 'Coastlines, islands and reef shallows.', icon: 'beach' },
  'Cultural & Heritage': { description: 'Monuments, palaces and archaeological sites.', icon: 'heritage' },
  'Mountain & Nature': { description: 'Hills, forests and scenic viewpoints.', icon: 'mountain' },
  Adventure: { description: 'Active trips: trekking, boating and exploring.', icon: 'adventure' },
  'City Break': { description: 'Urban stays, food and nightlife.', icon: 'city' },
  'Wildlife & Safari': { description: 'National parks and wildlife watching.', icon: 'wildlife' },
  'Wellness & Retreat': { description: 'Slow travel, spas and quiet stays.', icon: 'wellness' },
};

/**
 * Removes anything in the catalogue that is not part of the Bangladesh dataset.
 *
 * The retired `seedDestinations` / `seedHotels` scripts inserted global
 * locations, foreign destinations and foreign hotels. They are gone from the
 * repo, but a database that ever ran them still carries the leftovers, so this
 * authoritative seed converges the catalogue back to Bangladesh-only on every
 * run. Deletes go children-first and each statement is reference-guarded: a
 * document is only removed once nothing points at it.
 */
async function purgeNonBangladesh() {
  const purged = {
    hotels: 0,
    rooms: 0,
    availability: 0,
    destinations: 0,
    locations: 0,
    categories: 0,
  };

  // Foreign locations are the root of the other leftovers: a destination is
  // "not in Bangladesh" when the country of its location says so.
  const foreignLocations = await Location.find({ country: { $ne: 'Bangladesh' } })
    .select('_id')
    .lean();
  const foreignLocationIds = foreignLocations.map((location) => location._id);

  if (foreignLocationIds.length > 0) {
    const foreignDestinations = await Destination.find({ location_id: { $in: foreignLocationIds } })
      .select('_id')
      .lean();
    const foreignDestinationIds = foreignDestinations.map((destination) => destination._id);

    if (foreignDestinationIds.length > 0) {
      const foreignHotels = await Hotel.find({ destination_id: { $in: foreignDestinationIds } })
        .select('_id')
        .lean();
      const foreignHotelIds = foreignHotels.map((hotel) => hotel._id);

      if (foreignHotelIds.length > 0) {
        const bookedHotels = await Booking.countDocuments({ hotel_id: { $in: foreignHotelIds } });
        if (bookedHotels > 0) {
          throw new Error(
            `Refusing to purge ${foreignHotelIds.length} non-Bangladesh hotel(s): ${bookedHotels} booking(s) still reference them.`
          );
        }

        const foreignRooms = await Room.find({ hotel_id: { $in: foreignHotelIds } }).select('_id').lean();
        const foreignRoomIds = foreignRooms.map((room) => room._id);

        if (foreignRoomIds.length > 0) {
          const bookedRooms = await Booking.countDocuments({ hotel_room_id: { $in: foreignRoomIds } });
          if (bookedRooms > 0) {
            throw new Error(
              `Refusing to purge ${foreignRoomIds.length} room(s) in non-Bangladesh hotels: ${bookedRooms} booking(s) still reference them.`
            );
          }
          purged.availability = (
            await RoomAvailability.deleteMany({ room_id: { $in: foreignRoomIds } })
          ).deletedCount;
          purged.rooms = (await Room.deleteMany({ _id: { $in: foreignRoomIds } })).deletedCount;
        }

        purged.hotels = (await Hotel.deleteMany({ _id: { $in: foreignHotelIds } })).deletedCount;
      }

      const hotelsOnDestination = await Hotel.countDocuments({
        destination_id: { $in: foreignDestinationIds },
      });
      if (hotelsOnDestination > 0) {
        throw new Error(
          `Refusing to purge ${foreignDestinationIds.length} non-Bangladesh destination(s): ${hotelsOnDestination} hotel(s) still reference them.`
        );
      }
      purged.destinations = (
        await Destination.deleteMany({ _id: { $in: foreignDestinationIds } })
      ).deletedCount;
    }

    const destinationsOnLocation = await Destination.countDocuments({
      location_id: { $in: foreignLocationIds },
    });
    if (destinationsOnLocation > 0) {
      throw new Error(
        `Refusing to purge ${foreignLocationIds.length} non-Bangladesh location(s): ${destinationsOnLocation} destination(s) still reference them.`
      );
    }
    purged.locations = (await Location.deleteMany({ _id: { $in: foreignLocationIds } })).deletedCount;
  }

  // Categories are only meaningful against the names this seed owns. A stale
  // category is deleted only when no destination still points at it.
  const staleCategories = await Category.find({ name: { $nin: Object.keys(CATEGORY_META) } })
    .select('_id')
    .lean();
  if (staleCategories.length > 0) {
    const staleCategoryIds = staleCategories.map((category) => category._id);
    const usedByDestinations = await Destination.countDocuments({
      category_id: { $in: staleCategoryIds },
    });
    if (usedByDestinations > 0) {
      console.warn(
        `  Purged .................. skipped ${staleCategories.length} non-canonical category(ies): ${usedByDestinations} destination(s) still reference them`
      );
    } else {
      purged.categories = (await Category.deleteMany({ _id: { $in: staleCategoryIds } })).deletedCount;
    }
  }

  const total = Object.values(purged).reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    console.log('  Purged .................. 0 (catalogue already Bangladesh-only)');
    return purged;
  }

  console.log(`  Purged .................. ${total} non-Bangladesh record(s)`);
  for (const [label, count] of [
    ['Hotels', purged.hotels],
    ['Rooms', purged.rooms],
    ['Availability', purged.availability],
    ['Destinations', purged.destinations],
    ['Locations', purged.locations],
    ['Categories', purged.categories],
  ] as const) {
    if (count > 0) console.log(`    - ${label.padEnd(18, '.')} ${count}`);
  }
  return purged;
}

async function main() {
  // The Atlas connection string in this project does not carry a database name,
  // so resolve it explicitly rather than letting Mongoose default to "test".
  const resolved = resolveMongoUri();
  if (!resolved.hadDbName) {
    console.log(`MONGODB_URI does not name a database; using "${resolved.dbName}".`);
  }
  await mongoose.connect(resolved.uri, { serverSelectionTimeoutMS: 15000 });

  const dbName = mongoose.connection.name;
  console.log(`Connected to database "${dbName}". Seeding Bangladesh demo data...`);

  // Converge the catalogue to Bangladesh-only before upserting the demo data.
  await purgeNonBangladesh();

  const counts = {
    users: 0,
    locations: 0,
    categories: 0,
    destinations: 0,
    hotels: 0,
    rooms: 0,
    availability: 0,
    bookings: 0,
    payments: 0,
    photographers: 0,
    photographyServices: 0,
    vehicleProviders: 0,
    vehicles: 0,
    vehicleAvailability: 0,
  };

  // 1. Users — every role, so each dashboard has a working demo login.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds = new Map<string, mongoose.Types.ObjectId>();
  for (const seed of USERS) {
    const before = await User.countDocuments({ email: seed.email });
    const user = await upsertUser(seed, passwordHash);
    if (before === 0) counts.users++;
    userIds.set(seed.email, user._id as mongoose.Types.ObjectId);
  }

  // 2. Categories and locations.

  const categoryIds = new Map<string, mongoose.Types.ObjectId>();
  for (const [name, meta] of Object.entries(CATEGORY_META)) {
    const before = await Category.countDocuments({ name });
    const category = await upsertCategory(name, meta.description, meta.icon);
    if (before === 0) counts.categories++;
    categoryIds.set(name, category!._id as mongoose.Types.ObjectId);
  }

  const locationIds = new Map<string, mongoose.Types.ObjectId>();
  for (const seed of LOCATIONS) {
    const before = await Location.countDocuments({ name: seed.name, country: 'Bangladesh' });
    const location = await upsertLocation(seed);
    if (before === 0) counts.locations++;
    locationIds.set(seed.name, location!._id as mongoose.Types.ObjectId);
  }

  // 3. Destinations, each backed by one of the bundled licensed photographs.
  const destinationIds = new Map<string, mongoose.Types.ObjectId>();
  for (const seed of DESTINATIONS) {
    const { destination, created } = await upsertDestination(seed, categoryIds, locationIds);
    if (created) counts.destinations++;
    destinationIds.set(seed.name, destination._id as mongoose.Types.ObjectId);
  }

  // 4. Hotels and rooms.
  const hotelIds = new Map<string, mongoose.Types.ObjectId>();
  const roomIds = new Map<string, mongoose.Types.ObjectId>();
  for (const seed of HOTELS) {
    const before = await Hotel.countDocuments({
      name: seed.name,
      owner_id: userIds.get(seed.ownerEmail),
    });
    const hotel = await upsertHotel(seed, userIds, destinationIds);
    if (before === 0) counts.hotels++;
    hotelIds.set(seed.name, hotel._id as mongoose.Types.ObjectId);

    for (const roomSeed of seed.rooms) {
      const existed = await Room.countDocuments({ hotel_id: hotel._id, room_type: roomSeed.room_type });
      const room = await upsertRoom(hotel._id as mongoose.Types.ObjectId, roomSeed);
      if (existed === 0) counts.rooms++;
      roomIds.set(`${seed.name}|${roomSeed.room_type}`, room._id as mongoose.Types.ObjectId);
    }
  }

  // 5. Availability for the next 90 nights, on top of the room inventory.
  const overridesByRoom = new Map<string, Map<string, number>>();
  for (const seed of HOTELS) {
    for (const roomSeed of seed.rooms) {
      const key = `${seed.name}|${roomSeed.room_type}`;
      const roomId = roomIds.get(key);
      if (!roomId) continue;

      counts.availability += await seedAvailability(
        roomId,
        roomSeed.total_rooms,
        roomSeed.price_per_night,
        90
      );

      const rows = await RoomAvailability.find({ room_id: roomId }).select('date price_override');
      overridesByRoom.set(
        key,
        new Map(
          rows
            .filter((row) => typeof row.price_override === 'number')
            .map((row) => [startOfUtcDay(row.date).toISOString().slice(0, 10), row.price_override as number])
        )
      );
    }
  }

  // 6. Photographers and services.
  const existingPhotographer = await Photographer.findOne({ email: PHOTOGRAPHER.email });
  const photographer =
    existingPhotographer ??
    (await Photographer.create({
      user_id: userIds.get(PHOTOGRAPHER.email),
      name: PHOTOGRAPHER.name,
      bio: PHOTOGRAPHER.bio,
      email: PHOTOGRAPHER.email,
      phone: PHOTOGRAPHER.phone,
      profile_image: PHOTOGRAPHER.profile_image,
      rating: PHOTOGRAPHER.rating,
      destination_id: destinationIds.get(PHOTOGRAPHER.destination),
    }));
  if (!existingPhotographer) counts.photographers++;
  if (existingPhotographer && !existingPhotographer.user_id) {
    await Photographer.updateOne(
      { _id: existingPhotographer._id },
      { $set: { user_id: userIds.get(PHOTOGRAPHER.email) } }
    );
  }

  for (const serviceSeed of PHOTOGRAPHY_SERVICES) {
    const existing = await PhotographyService.findOne({
      photographer_id: photographer._id,
      name: serviceSeed.name,
    });
    const service =
      existing ??
      (await PhotographyService.create({
        photographer_id: photographer._id,
        name: serviceSeed.name,
        description: serviceSeed.description,
        price_per_session: serviceSeed.price_per_session,
        duration_hours: serviceSeed.duration_hours,
        images: serviceSeed.images,
      }));
    if (!existing) counts.photographyServices++;

    const existingPortfolio = await Portfolio.findOne({
      photographer_id: photographer._id,
      service_id: service._id,
    });
    if (!existingPortfolio) {
      await Portfolio.create({
        photographer_id: photographer._id,
        service_id: service._id,
        images: serviceSeed.portfolio,
        description: `${serviceSeed.name} — sample frames from recent shoots.`,
      });
    }
  }

  // 7. Vehicle provider, fleet and availability.
  const existingProvider = await VehicleProvider.findOne({ name: VEHICLE_PROVIDER.name });
  const provider =
    existingProvider ??
    (await VehicleProvider.create({
      user_id: userIds.get(VEHICLE_PROVIDER.email),
      name: VEHICLE_PROVIDER.name,
      email: VEHICLE_PROVIDER.email,
      phone: VEHICLE_PROVIDER.phone,
      description: VEHICLE_PROVIDER.description,
      rating: VEHICLE_PROVIDER.rating,
    }));
  if (!existingProvider) counts.vehicleProviders++;
  if (existingProvider && !existingProvider.user_id) {
    await VehicleProvider.updateOne(
      { _id: existingProvider._id },
      { $set: { user_id: userIds.get(VEHICLE_PROVIDER.email) } }
    );
  }

  for (const vehicleSeed of VEHICLES) {
    const existing = await Vehicle.findOne({ provider_id: provider._id, name: vehicleSeed.name });
    const vehicle =
      existing ??
      (await Vehicle.create({
        provider_id: provider._id,
        name: vehicleSeed.name,
        type: vehicleSeed.type,
        capacity: vehicleSeed.capacity,
        price_per_day: vehicleSeed.price_per_day,
        features: vehicleSeed.features,
        images: vehicleSeed.images,
      }));    if (!existing) counts.vehicles++;

    const today = startOfUtcDay(new Date());
    const operations: Parameters<typeof VehicleAvailability.bulkWrite>[0] = [];
    for (let offset = 0; offset < 60; offset++) {
      const date = addDays(today, offset);
      const available = random() < 0.12 ? 0 : between(1, vehicleSeed.fleet);
      const status: 'available' | 'partial' | 'unavailable' =
        available <= 0 ? 'unavailable' : available < vehicleSeed.fleet ? 'partial' : 'available';
      operations.push({
        updateOne: {
          filter: { vehicle_id: vehicle._id, date },
          update: {
            $set: { available_units: available, status },
            $setOnInsert: { vehicle_id: vehicle._id, date },
          },
          upsert: true,
        },
      });
    }
    await VehicleAvailability.bulkWrite(operations, { ordered: false });
    counts.vehicleAvailability += operations.length;
  }

  // 8. Bookings and their payments.
  //
  // Nights held by an in-progress booking (pending or confirmed) are deducted
  // from the published availability afterwards, replicating what `reserveNights`
  // does at request time. Bookings that were cancelled or marked no-show have
  // already released their inventory, so they are excluded.
  const today = startOfUtcDay(new Date());
  const roomMeta = new Map(
    HOTELS.flatMap((hotel) =>
      hotel.rooms.map((room) => [
        `${hotel.name}|${room.room_type}`,
        { hotelName: hotel.name, room },
      ])
    )
  );

  const seededBookings: { reference: string; status: BookingStatus; total: number; userId: mongoose.Types.ObjectId }[] = [];

  for (const [index, plan] of BOOKING_PLAN.entries()) {
    const reference = bookingReference(index + 1);
    const existing = await Booking.findOne({ booking_reference: reference });
    if (existing) {
      seededBookings.push({
        reference,
        status: existing.status,
        total: existing.total_amount,
        userId: existing.user_id._id ?? existing.user_id,
      });
      continue;
    }

    const key = `${plan.hotelName}|${plan.roomType}`;
    const meta = roomMeta.get(key);
    const hotelId = hotelIds.get(plan.hotelName);
    const roomId = roomIds.get(key);
    if (!meta || !hotelId || !roomId) continue;

    const start = addDays(today, plan.startOffset);
    const end = addDays(today, plan.startOffset + plan.nights);
    const overrides = overridesByRoom.get(key) ?? new Map<string, number>();
    const priced = priceStay(start, end, plan.rooms, meta.room.price_per_night, overrides);

    const status = plan.status;
    const cancelled = status === BookingStatus.CANCELLED;
    const userId = userIds.get(USERS[plan.userIndex].email)!;

    const booking = await Booking.create({
      booking_reference: reference,
      booking_type: 'hotel',
      start_date: start,
      end_date: end,
      guest_count: plan.guests,
      room_count: plan.rooms,
      total_amount: priced.total,
      price_snapshot: {
        currency: currencyCode(),
        nights: priced.nights,
        rooms: plan.rooms,
        price_per_night: priced.price_per_night,
        subtotal: priced.subtotal,
        total: priced.total,
        nightly: priced.nightly,
        captured_at: addDays(today, Math.min(0, plan.startOffset - 7)),
      },
      status,
      special_requests: SPECIAL_REQUESTS[index % SPECIAL_REQUESTS.length],
      cancellation_reason: cancelled ? CANCELLATION_REASONS[index % CANCELLATION_REASONS.length] : undefined,
      cancelled_at: cancelled ? addDays(today, Math.min(0, plan.startOffset - 3)) : undefined,
      user_id: userId,
      hotel_id: hotelId,
      hotel_room_id: roomId,
    });

    counts.bookings++;
    seededBookings.push({ reference, status, total: priced.total, userId });

    // A payment per booking: booking_id is uniquely indexed, so exactly one.
    const paymentStatus =
      status === BookingStatus.COMPLETED
        ? PaymentStatus.COMPLETED
        : status === BookingStatus.CANCELLED
          ? PaymentStatus.REFUNDED
          : status === BookingStatus.NO_SHOW
            ? PaymentStatus.COMPLETED
            : status === BookingStatus.CONFIRMED
              ? PaymentStatus.COMPLETED
              : PaymentStatus.PENDING;

    const methods = ['bKash', 'Nagad', 'Card', 'Bank Transfer'];
    const settled = paymentStatus !== PaymentStatus.PENDING;

    await Payment.create({
      booking_id: booking._id,
      amount: priced.total,
      currency: currencyCode(),
      payment_method: settled ? methods[index % methods.length] : 'pending',
      transaction_reference: settled
        ? `${methods[index % methods.length].replace(/\s+/g, '').toUpperCase()}-${(index * 104729)
            .toString(36)
            .toUpperCase()
            .slice(-8)
            .padStart(8, '0')}`
        : undefined,
      payment_status: paymentStatus,
      payment_date: settled ? addDays(today, Math.min(0, plan.startOffset - 2)) : undefined,
      refund_status: paymentStatus === PaymentStatus.REFUNDED ? PaymentStatus.REFUNDED : undefined,
    });

    counts.payments++;
  }

  // 9. Hold the nights that pending and confirmed bookings are occupying, so the
  // published calendar and the booking list tell the same story.
  //
  // `seedAvailability` resets every night to a deterministic baseline, so the
  // holds are re-applied unconditionally here. Planning a booking twice is
  // therefore safe, and the guarded `$inc` never over-commits a room.
  let heldNights = 0;
  let skippedHoldNights = 0;

  // Apply holds in date order to mirror how a real booking funnel would consume
  // inventory, so the resulting counts are stable across runs.
  const chronological = [...BOOKING_PLAN].sort((a, b) => a.startOffset - b.startOffset);

  for (const plan of chronological) {
    if (plan.status !== BookingStatus.PENDING && plan.status !== BookingStatus.CONFIRMED) continue;

    const key = `${plan.hotelName}|${plan.roomType}`;
    const roomId = roomIds.get(key);
    if (!roomId) continue;

    const held = [];
    for (let offset = 0; offset < plan.nights; offset++) {
      held.push(addDays(today, plan.startOffset + offset));
    }

    const result = await RoomAvailability.updateMany(
      {
        room_id: roomId,
        date: { $in: held },
        status: { $ne: 'unavailable' },
        available_rooms: { $gte: plan.rooms },
      },
      { $inc: { available_rooms: -plan.rooms } }
    );
    heldNights += result.modifiedCount;
    skippedHoldNights += held.length - result.modifiedCount;
  }

  // Re-derive the status label from the post-reservation counts, mirroring the
  // `statusFor` rule the availability service applies when it reads a night.
  for (const [key, roomId] of roomIds) {
    const roomSeed = HOTELS.flatMap((hotel) =>
      hotel.rooms.map((room) => ({ key: `${hotel.name}|${room.room_type}`, total: room.total_rooms }))
    ).find((entry) => entry.key === key);
    if (!roomSeed) continue;

    const rows = await RoomAvailability.find({ room_id: roomId }).select('available_rooms');
    const updates = rows
      .filter((row) => row.status !== statusFor(row.available_rooms, roomSeed.total))
      .map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { status: statusFor(row.available_rooms, roomSeed.total) } },
        },
      }));
    if (updates.length) await RoomAvailability.bulkWrite(updates, { ordered: false });
  }

  // 10. Admin-owned extras: a couple of photography and vehicle bookings so the
  // booking queue is not exclusively hotel traffic.
  const photographyServices = await PhotographyService.find({ photographer_id: photographer._id }).sort({ name: 1 });
  const vehicles = await Vehicle.find({ provider_id: provider._id }).sort({ name: 1 });

  const EXTRA_BOOKINGS: {
    userIndex: number;
    type: 'photography' | 'vehicle';
    service?: InstanceType<typeof PhotographyService>;
    vehicle?: InstanceType<typeof Vehicle>;
    startOffset: number;
    nights: number;
    guests: number;
    status: BookingStatus;
  }[] = [
    { userIndex: 1, type: 'photography' as const, service: photographyServices[0], startOffset: 9, nights: 1, guests: 2, status: BookingStatus.PENDING },
    { userIndex: 3, type: 'photography' as const, service: photographyServices[1], startOffset: -14, nights: 1, guests: 4, status: BookingStatus.COMPLETED },
    { userIndex: 0, type: 'vehicle' as const, vehicle: vehicles[0], startOffset: 11, nights: 3, guests: 8, status: BookingStatus.CONFIRMED },
    { userIndex: 4, type: 'vehicle' as const, vehicle: vehicles[1], startOffset: -20, nights: 2, guests: 4, status: BookingStatus.COMPLETED },
  ];

  for (const [index, extra] of EXTRA_BOOKINGS.entries()) {
    if (!extra.service && !extra.vehicle) continue;

    const reference = bookingReference(100 + index);
    if (await Booking.findOne({ booking_reference: reference })) continue;

    const start = addDays(today, extra.startOffset);
    const end = addDays(today, extra.startOffset + extra.nights);
    const nights = extra.nights;
    const unitPrice = extra.service
      ? extra.service.price_per_session
      : (extra.vehicle!.price_per_day as number);
    // Photography is quoted per session (a single day), vehicles per day.
    const total = unitPrice * nights;

    const booking = await Booking.create({
      booking_reference: reference,
      booking_type: extra.type,
      start_date: start,
      end_date: end,
      guest_count: extra.guests,
      room_count: 1,
      total_amount: total,
      price_snapshot: {
        currency: currencyCode(),
        nights: Math.max(1, nights),
        rooms: 1,
        price_per_night: unitPrice,
        subtotal: total,
        total,
        nightly: eachNight(start, end).map((night) => ({
          date: night.toISOString().slice(0, 10),
          price_per_night: unitPrice,
        })),
        captured_at: start,
      },
      status: extra.status,
      special_requests: index === 0 ? 'Please confirm the shoot location two days before the session.' : undefined,
      user_id: userIds.get(USERS[extra.userIndex].email)!,
      photography_service_id: extra.service?._id,
      vehicle_id: extra.vehicle?._id,
    });

    counts.bookings++;

    await Payment.create({
      booking_id: booking._id,
      amount: total,
      currency: currencyCode(),
      payment_method: extra.status === BookingStatus.PENDING ? 'pending' : 'bKash',
      payment_status: extra.status === BookingStatus.PENDING ? PaymentStatus.PENDING : PaymentStatus.COMPLETED,
      transaction_reference: extra.status === BookingStatus.PENDING ? undefined : `BKASH-${reference.replace(/-/g, '').slice(0, 10)}`,
      payment_date: extra.status === BookingStatus.PENDING ? undefined : start,
    });

    counts.payments++;
  }

  console.log('\nBangladesh demo seed complete.');
  console.log(`  Users .................. ${counts.users} created (${USERS.length} total demo accounts)`);
  console.log(`  Locations .............. ${counts.locations} created (${LOCATIONS.length} total)`);
  console.log(`  Categories ............. ${counts.categories} created (${Object.keys(CATEGORY_META).length} total)`);
  console.log(`  Destinations ........... ${counts.destinations} created (${DESTINATIONS.length} total)`);
  console.log(`  Hotels ................. ${counts.hotels} created (${HOTELS.length} total)`);
  console.log(`  Rooms .................. ${counts.rooms} created`);
  console.log(`  Room availability ...... ${counts.availability} nights upserted (${heldNights} night-slots held by active bookings${skippedHoldNights ? `, ${skippedHoldNights} already fully booked` : ''})`);
  console.log(`  Bookings ............... ${counts.bookings} created`);
  console.log(`  Payments ............... ${counts.payments} created`);
  console.log(`  Photographers .......... ${counts.photographers} created, ${counts.photographyServices} services`);
  console.log(`  Vehicle providers ...... ${counts.vehicleProviders} created, ${counts.vehicles} vehicles`);
  console.log(`  Vehicle availability ... ${counts.vehicleAvailability} nights upserted`);
  console.log(`  Currency ............... ${currencyCode()}`);

  console.log('\nDemo sign-in credentials — password for every account is ' + DEMO_PASSWORD);
  for (const seed of USERS) {
    console.log(`  ${seed.role.padEnd(17)} ${seed.email.padEnd(34)} ${seed.name}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
