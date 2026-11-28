import type { Metadata } from 'next';
import { SectionHeading } from '@/components/home/Section';
import { PhotographerCard } from '@/components/photographers/PhotographerCard';
import DestinationFilter from '@/components/directory/DestinationFilter';
import { ButtonLink, EmptyState, ErrorState, Reveal } from '@gtour/ui';
import { fetchDestinations, fetchPhotographers } from '@/lib/server-api';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Photographers',
  description:
    'Find travel photographers published on GTour and see the destinations and services they cover.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function PhotographersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const destinationId = firstValue(params.destination_id);

  const [result, destinationsResult] = await Promise.all([
    fetchPhotographers(destinationId || undefined),
    fetchDestinations({ limit: 100 }),
  ]);

  const photographers = result.ok ? result.data : [];
  const destinations = destinationsResult.ok ? destinationsResult.data : [];

  return (
    <div className="gtour-section">
      <div className="gtour-container">
        <SectionHeading
          as="h1"
          eyebrow="Photography"
          title="Photographers who travel with you"
          description="Browse the photographers our partners publish on GTour. Service packages, pricing and availability are recorded against each photographer on the server."
          action={{ href: '/destinations', label: 'Browse destinations' }}
        />

        <div className="mt-10">
          <DestinationFilter
            destinations={destinations}
            value={destinationId}
            label="Photographer's destination"
          />
        </div>
        <div className="mt-10">
          {!result.ok ? (
            <ErrorState title="Photographers are unavailable" description={result.message} />
          ) : photographers.length === 0 ? (
            <EmptyState
              title={
                destinationId ? 'No photographers here yet' : 'No photographers published yet'
              }
              description={
                destinationId
                  ? 'Nobody has published a photography service for this destination yet. Clear the filter to see everyone.'
                  : 'Our partners have not published photography services yet. Explore destinations in the meantime.'
              }
              action={
                destinationId ? (
                  <ButtonLink href="/photographers" variant="outline">
                    Clear filter
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/destinations" variant="outline">
                    Explore destinations
                  </ButtonLink>
                )
              }
            />
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {photographers.map((photographer, index) => (
                <li key={photographer._id}>
                  <Reveal delayMs={Math.min(index, 5) * 70}>
                    <PhotographerCard photographer={photographer} className="h-full" />
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
