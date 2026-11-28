import { IVehicle } from '../models/Vehicle';
import VehicleAvailability from '../models/VehicleAvailability';
import { ApiError } from '../utils/ApiError';
import { eachNight, normaliseStayRange, startOfUtcDay } from '../utils/dates';
import { currencyCode } from '../config/currency';

export interface VehicleNightlyRate {
  date: string;
  available_units: number;
  price_per_day: number;
  status: 'available' | 'partial' | 'unavailable';
}

export interface VehicleRentalQuote {
  currency: string;
  start_date: string;
  end_date: string;
  days: number;
  units: number;
  nightly: VehicleNightlyRate[];
  price_per_day: number;
  subtotal: number;
  total: number;
  available: boolean;
  max_units: number;
}

/** Fleet size used when a vehicle has not declared one. */
function fleetSize(vehicle: IVehicle): number {
  return Math.max(1, vehicle.default_units ?? 1);
}

function statusFor(availableUnits: number, totalUnits: number): VehicleNightlyRate['status'] {
  if (availableUnits <= 0) return 'unavailable';
  if (availableUnits < totalUnits) return 'partial';
  return 'available';
}

/**
 * Rental days are whole calendar days, so a vehicle booked from the 1st to the
 * 3rd is unavailable for the 1st and 2nd and can be rented again on the 3rd.
 * That matches `eachNight`, which treats the end date as exclusive.
 */
export async function loadVehicleNightly(
  vehicle: IVehicle,
  start: Date,
  end: Date,
): Promise<VehicleNightlyRate[]> {
  const days = eachNight(start, end);
  const overrides = await VehicleAvailability.find({
    vehicle_id: vehicle._id,
    date: { $in: days },
  });
  const byDate = new Map(
    overrides.map((entry) => [startOfUtcDay(entry.date).toISOString(), entry]),
  );
  const total = fleetSize(vehicle);

  return days.map((day) => {
    const key = day.toISOString();
    const override = byDate.get(key);
    const availableUnits = override
      ? override.status === 'unavailable'
        ? 0
        : override.available_units
      : total;

    return {
      date: key.slice(0, 10),
      available_units: Math.max(0, availableUnits),
      price_per_day: vehicle.price_per_day,
      status: statusFor(availableUnits, total),
    };
  });
}

/** Authoritative rental total. The client figure is only ever a cross-check. */
export async function quoteRental(
  vehicle: IVehicle,
  startValue: Date | string,
  endValue: Date | string,
  units = 1,
): Promise<VehicleRentalQuote> {
  const { start, end, nights } = normaliseStayRange(startValue, endValue);
  const nightly = await loadVehicleNightly(vehicle, start, end);
  const available = nightly.every((day) => day.available_units >= units);
  const subtotal = nightly.reduce((sum, day) => sum + day.price_per_day * units, 0);
  const maxUnits = nightly.reduce(
    (lowest, day) => Math.min(lowest, day.available_units),
    fleetSize(vehicle),
  );

  return {
    currency: currencyCode(),
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    days: nights,
    units,
    nightly,
    price_per_day: vehicle.price_per_day,
    subtotal,
    total: subtotal,
    available,
    max_units: maxUnits,
  };
}

/**
 * Holds `units` vehicles for every day of the rental. Same conditional-`$inc`
 * strategy as room reservations: the guard lives in the query, so two
 * concurrent requests for the last vehicle cannot both succeed.
 */
export async function reserveVehicleUnits(
  vehicle: IVehicle,
  start: Date,
  end: Date,
  units: number,
): Promise<void> {
  const days = eachNight(start, end);
  const reserved: Date[] = [];

  try {
    for (const day of days) {
      await VehicleAvailability.updateOne(
        { vehicle_id: vehicle._id, date: day },
        {
          $setOnInsert: {
            vehicle_id: vehicle._id,
            date: day,
            available_units: fleetSize(vehicle),
            status: 'available',
          },
        },
        { upsert: true },
      );

      const updated = await VehicleAvailability.findOneAndUpdate(
        {
          vehicle_id: vehicle._id,
          date: day,
          status: { $ne: 'unavailable' },
          available_units: { $gte: units },
        },
        { $inc: { available_units: -units } },
        { new: true },
      );

      if (!updated) {
        throw new ApiError(
          `No vehicle availability for ${day.toISOString().slice(0, 10)}`,
          409,
          'NO_AVAILABILITY',
          { date: day.toISOString().slice(0, 10) },
        );
      }

      reserved.push(day);
    }

    await syncVehicleStatuses(vehicle, days);
  } catch (error) {
    await releaseVehicleUnits(vehicle, reserved, units);
    throw error;
  }
}

export async function releaseVehicleUnits(
  vehicle: IVehicle,
  days: Date[],
  units: number,
): Promise<void> {
  if (days.length === 0) return;

  for (const day of days) {
    await VehicleAvailability.updateOne(
      { vehicle_id: vehicle._id, date: startOfUtcDay(day) },
      { $inc: { available_units: units } },
    );
  }

  await syncVehicleStatuses(vehicle, days);
}

async function syncVehicleStatuses(vehicle: IVehicle, days: Date[]): Promise<void> {
  const total = fleetSize(vehicle);
  await VehicleAvailability.updateMany(
    { vehicle_id: vehicle._id, date: { $in: days.map((day) => startOfUtcDay(day)) } },
    [
      {
        $set: {
          status: {
            $cond: [
              { $lte: ['$available_units', 0] },
              'unavailable',
              { $cond: [{ $gte: ['$available_units', total] }, 'available', 'partial'] },
            ],
          },
        },
      },
    ],
  );
}

/** Convenience for the detail page: the next `days` rental days for a vehicle. */
export async function upcomingVehicleAvailability(vehicleId: unknown, days = 30) {
  const start = startOfUtcDay(new Date());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  const rows = await VehicleAvailability.find({
    vehicle_id: vehicleId,
    date: { $gte: start, $lt: end },
  }).sort({ date: 1 });
  return rows;
}
