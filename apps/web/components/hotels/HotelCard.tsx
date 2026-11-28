import Image from 'next/image';
import Link from 'next/link';
import { RatingBadge } from '@gtour/ui';
import { formatCurrency } from '@gtour/utils';
import { images } from '@/lib/images';
import { refName, type HotelDto } from '@gtour/utils';

const STAY_FALLBACKS = [images.stays.resort, images.stays.room, images.stays.terrace];

function stayImage(hotel: HotelDto) {
  const candidate = hotel.images?.find((image) => typeof image === 'string' && image.trim());
  if (candidate) return { src: candidate, alt: `${hotel.name} — accommodation photography` };

  const fallback = STAY_FALLBACKS[hotel.name.length % STAY_FALLBACKS.length];
  return { src: fallback.src, alt: `${hotel.name} — accommodation photography` };
}

/**
 * Stay card. The "from" price is the cheapest nightly rate across this hotel's
 * rooms, derived by the API — never estimated on the client.
 */
export function HotelCard({ hotel, className }: { hotel: HotelDto; className?: string }) {
  const image = stayImage(hotel);
  const destination = refName(hotel.destination_id);
  const from = formatCurrency(hotel.price_from);

  return (
    <Link
      href={`/hotels/${hotel._id}`}
      className={`group block overflow-hidden rounded-card bg-white shadow-soft transition-shadow duration-300 ease-premium hover:shadow-lift focus:outline-none ${className ?? ''}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-[900ms] ease-premium group-hover:scale-105"
        />
        <div className="absolute right-3 top-3">
          <RatingBadge value={hotel.rating} />
        </div>
      </div>
      <div className="space-y-1.5 p-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sea-600">
          {destination ?? hotel.address}
        </p>
        <h3 className="font-display text-xl font-semibold text-ink-900">{hotel.name}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-ink-500">{hotel.description}</p>

        <div className="flex items-end justify-between gap-3 pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ink-800">
            View details
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 stroke-current transition-transform duration-300 ease-premium group-hover:translate-x-1"
              fill="none"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>

          {from ? (
            <span className="text-right">
              <span className="block font-display text-lg font-semibold text-ink-900">{from}</span>
              <span className="block text-[0.68rem] uppercase tracking-[0.16em] text-ink-400">
                per night
              </span>
            </span>
          ) : (
            <span className="text-xs text-ink-400">Rate on request</span>
          )}
        </div>
      </div>
    </Link>
  );
}
