import type { Metadata } from 'next';
import { SectionHeading } from '@/components/home/Section';
import { ButtonLink, EmptyState, ErrorState, Reveal } from '@gtour/ui';
import { VehicleCard } from '@/components/vehicles/VehicleCard';
import DestinationFilter from '@/components/directory/DestinationFilter';
import { fetchDestinations, fetchVehicles } from '@/lib/server-api';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Vehicles & transfers',
  description:
    'Compare vehicles published on GTour by type, capacity and daily price, and see which provider offers them.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const destinationId = firstValue(params.destination_id);

  const [result, destinationsResult] = await Promise.all([
    fetchVehicles(destinationId || undefined),
    fetchDestinations({ limit: 100 }),
  ]);

  const vehicles = result.ok ? result.data : [];
  const destinations = destinationsResult.ok ? destinationsResult.data : [];

  return (
    <div className="gtour-section">
      <div className="gtour-container">
        <SectionHeading
          as="h1"
          eyebrow="Getting around"
          title="Vehicles for the road between stops"
          description="Vehicles are listed with their provider, seating capacity and daily price so you can compare before you decide. Availability is confirmed on the server at booking time."
          action={{ href: '/destinations', label: 'Browse destinations' }}
        />

        <div className="mt-10">
          <DestinationFilter
            destinations={destinations}
            value={destinationId}
            label="Vehicle's destination"
          />
        </div>

        <div className="mt-10">
          {!result.ok ? (
            <ErrorState title="Vehicles are unavailable" description={result.message} />
          ) : vehicles.length === 0 ? (
            <EmptyState
              title={destinationId ? 'No vehicles here yet' : 'No vehicles published yet'}
              description={
                destinationId
                  ? 'No provider has published a vehicle for this destination yet. Clear the filter to see every vehicle.'
                  : 'Our providers have not published vehicles yet. Explore destinations in the meantime.'
              }
              action={
                destinationId ? (
                  <ButtonLink href="/vehicles" variant="outline">
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
              {vehicles.map((vehicle, index) => (
                <li key={vehicle._id}>
                  <Reveal delayMs={Math.min(index, 5) * 70}>
                    <VehicleCard vehicle={vehicle} className="h-full" />
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
