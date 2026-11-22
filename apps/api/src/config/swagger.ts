import swaggerJsdoc from 'swagger-jsdoc';
import { UserRole, BookingStatus, PaymentStatus, AccountStatus } from '@gtour/shared-types';

const PORT = process.env.PORT || '5051';

/** Reusable object schemas. Routes reference these with `$ref` instead of repeating shapes. */
const schemas = {
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Destination not found' },
          code: { type: 'string', example: 'DESTINATION_NOT_FOUND' },
          details: { type: 'object', nullable: true },
        },
      },
    },
  },
  Profile: {
    type: 'object',
    nullable: true,
    properties: {
      _id: { type: 'string' },
      user_id: { type: 'string' },
      bio: { type: 'string' },
      preferred_language: { type: 'string', example: 'en' },
      travel_preferences: { type: 'array', items: { type: 'string' } },
      profile_image: { type: 'string', format: 'uri', nullable: true },
      address: { type: 'string' },
      date_of_birth: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  Pagination: {
    type: 'object',
    properties: {
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 20 },
      total: { type: 'integer', example: 16 },
      pages: { type: 'integer', example: 1 },
    },
  },
  AuthUser: {
    type: 'object',
    properties: {
      id: { type: 'string', example: '6b01da3f3191d6dfb815a936' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      role: { type: 'string', enum: Object.values(UserRole) },
      account_status: { type: 'string', enum: Object.values(AccountStatus) },
    },
  },
  RegisterRequest: {
    type: 'object',
    required: ['email', 'password', 'name'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
      name: { type: 'string', minLength: 2 },
      phone: { type: 'string' },
      role: { type: 'string', enum: Object.values(UserRole), default: UserRole.TOURIST },
      account_status: { type: 'string', enum: Object.values(AccountStatus) },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
  AuthResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/AuthUser' },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
        },
      },
    },
  },
  UpdateProfileRequest: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2 },
      phone: { type: 'string' },
      bio: { type: 'string', maxLength: 500 },
      preferred_language: { type: 'string' },
      travel_preferences: { type: 'array', items: { type: 'string' } },
      profile_image: { type: 'string', format: 'uri' },
      date_of_birth: { type: 'string' },
      address: { type: 'string' },
    },
  },
  Category: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      name: { type: 'string', example: 'Beach' },
      description: { type: 'string' },
      icon: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CategoryInput: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2 },
      description: { type: 'string' },
      icon: { type: 'string' },
    },
  },
  Location: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      name: { type: 'string', example: 'Cox\u2019s Bazar' },
      country: { type: 'string', example: 'Bangladesh' },
      region: { type: 'string', example: 'Chattogram' },
    },
  },
  LocationInput: {
    type: 'object',
    required: ['name', 'country'],
    properties: {
      name: { type: 'string', minLength: 2 },
      country: { type: 'string', minLength: 2 },
      region: { type: 'string' },
    },
  },
  Destination: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      name: { type: 'string', example: 'Sundarbans Mangrove Forest' },
      description: { type: 'string' },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
      estimated_budget: { type: 'number', example: 18500 },
      best_visit_season: { type: 'string', example: 'November to February' },
      average_rating: { type: 'number', example: 4.7 },
      views: { type: 'integer', example: 320 },
      category_id: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Category' }] },
      location_id: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Location' }] },
      archived_at: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  DestinationInput: {
    type: 'object',
    required: ['name', 'description', 'images', 'category_id', 'location_id'],
    properties: {
      name: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 10 },
      images: { type: 'array', minItems: 1, items: { type: 'string', format: 'uri' } },
      estimated_budget: { type: 'number' },
      best_visit_season: { type: 'string' },
      category_id: { type: 'string' },
      location_id: { type: 'string' },
    },
  },
  Hotel: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      name: { type: 'string', example: 'Sundarbans Riverside Lodge' },
      description: { type: 'string' },
      address: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
      rating: { type: 'number', example: 4.5 },
      owner_id: { type: 'string' },
      destination_id: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Destination' }] },
      price_from: { type: 'number', description: 'Cheapest nightly rate, derived on the server.' },
      price_to: { type: 'number', description: 'Most expensive nightly rate, derived on the server.' },
    },
  },
  HotelInput: {
    type: 'object',
    required: ['name', 'description', 'address', 'images', 'destination_id'],
    properties: {
      name: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 10 },
      address: { type: 'string', minLength: 5 },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      images: { type: 'array', minItems: 1, items: { type: 'string', format: 'uri' } },
      rating: { type: 'number', minimum: 0, maximum: 5 },
      destination_id: { type: 'string' },
    },
  },
  Room: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      hotel_id: { type: 'string' },
      room_type: { type: 'string', example: 'Deluxe Twin' },
      bed_type: { type: 'string', example: 'Twin' },
      capacity: { type: 'integer', example: 2 },
      price_per_night: { type: 'number', example: 6500 },
      total_rooms: { type: 'integer', example: 6 },
      amenities: { type: 'array', items: { type: 'string' } },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
    },
  },
  RoomInput: {
    type: 'object',
    required: ['hotel_id', 'room_type', 'bed_type', 'capacity', 'price_per_night', 'amenities', 'images'],
    properties: {
      hotel_id: { type: 'string' },
      room_type: { type: 'string', minLength: 2 },
      bed_type: { type: 'string', minLength: 2 },
      capacity: { type: 'integer', minimum: 1 },
      price_per_night: { type: 'number', minimum: 1 },
      total_rooms: { type: 'integer', minimum: 1, default: 1 },
      amenities: { type: 'array', minItems: 1, items: { type: 'string' } },
      images: { type: 'array', minItems: 1, items: { type: 'string', format: 'uri' } },
    },
  },
  RoomAvailability: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      room_id: { type: 'string' },
      date: { type: 'string', format: 'date-time' },
      available_rooms: { type: 'integer', example: 4 },
      price_override: { type: 'number', nullable: true },
      status: { type: 'string', enum: ['available', 'unavailable', 'partial'] },
    },
  },
  NightlyRate: {
    type: 'object',
    properties: {
      date: { type: 'string', example: '2026-01-12' },
      available_rooms: { type: 'integer', example: 4 },
      price_per_night: { type: 'number', example: 6500 },
      status: { type: 'string', enum: ['available', 'unavailable', 'partial'] },
    },
  },
  RoomAvailabilityInput: {
    type: 'object',
    required: ['date', 'available_rooms'],
    properties: {
      room_id: { type: 'string', description: 'Optional; the path segment wins.' },
      date: { type: 'string', example: '2026-01-12' },
      available_rooms: { type: 'integer', minimum: 0, example: 4 },
      price_override: { type: 'number', minimum: 1, nullable: true },
      status: { type: 'string', enum: ['available', 'unavailable', 'partial'] },
    },
  },
  RoomAvailabilityBulkInput: {
    type: 'object',
    required: ['start_date', 'end_date', 'available_rooms'],
    description: 'Publishes one inventory row per night in an inclusive date range.',
    properties: {
      room_id: { type: 'string', description: 'Optional; the path segment wins.' },
      start_date: { type: 'string', example: '2026-01-12' },
      end_date: { type: 'string', example: '2026-01-20' },
      available_rooms: { type: 'integer', minimum: 0, example: 4 },
      price_override: { type: 'number', minimum: 1, nullable: true },
      status: { type: 'string', enum: ['available', 'unavailable', 'partial'] },
    },
  },
  RoomCalendar: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      room_id: { type: 'string' },
      from: { type: 'string', example: '2026-01-12' },
      to: { type: 'string', example: '2026-02-11' },
      nights: { type: 'array', items: { $ref: '#/components/schemas/NightlyRate' } },
    },
  },
  RoomQuote: {
    type: 'object',
    description:
      'Authoritative stay price. `nights` is the number of billable nights and `max_rooms` is bounded by the scarcest night.',
    properties: {
      currency: { type: 'string', example: 'BDT' },
      check_in: { type: 'string', example: '2026-01-12' },
      check_out: { type: 'string', example: '2026-01-15' },
      nights: { type: 'integer', example: 3 },
      rooms: { type: 'integer', example: 1 },
      nightly: { type: 'array', items: { $ref: '#/components/schemas/NightlyRate' } },
      price_per_night: { type: 'number', example: 6500 },
      subtotal: { type: 'number', example: 19500 },
      total: { type: 'number', example: 19500 },
      available: { type: 'boolean', example: true },
      max_rooms: { type: 'integer', example: 6 },
    },
  },
  Booking: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      booking_reference: { type: 'string', example: 'GT-7F3A19' },
      user_id: { type: 'string' },
      booking_type: { type: 'string', enum: ['hotel', 'photography', 'vehicle'] },
      status: { type: 'string', enum: Object.values(BookingStatus) },
      start_date: { type: 'string', format: 'date-time' },
      end_date: { type: 'string', format: 'date-time' },
      guest_count: { type: 'integer', example: 2 },
      room_count: { type: 'integer', example: 1 },
      total_amount: { type: 'number', example: 19500 },
      price_snapshot: {
        type: 'object',
        description: 'Authoritative price captured by the server at booking time.',
        properties: {
          currency: { type: 'string', example: 'BDT' },
          nights: { type: 'integer', example: 3 },
          rooms: { type: 'integer', example: 1 },
          price_per_night: { type: 'number', example: 6500 },
          subtotal: { type: 'number', example: 19500 },
          total: { type: 'number', example: 19500 },
          captured_at: { type: 'string', format: 'date-time' },
        },
      },
      special_requests: { type: 'string' },
      cancellation_reason: { type: 'string' },
      hotel_id: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Hotel' }] },
      hotel_room_id: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Room' }] },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  BookingInput: {
    type: 'object',
    required: ['booking_type', 'start_date', 'end_date', 'guest_count'],
    description:
      'Exactly one of `hotel_room_id`, `photography_service_id` or `vehicle_id` must be supplied. `total_amount` is only a cross-check: the server recomputes the authoritative price and rejects a mismatch.',
    properties: {
      booking_type: { type: 'string', enum: ['hotel', 'photography', 'vehicle'] },
      start_date: { type: 'string', example: '2026-01-12' },
      end_date: { type: 'string', example: '2026-01-15' },
      guest_count: { type: 'integer', minimum: 1 },
      room_count: { type: 'integer', minimum: 1, maximum: 20 },
      total_amount: { type: 'number', minimum: 1 },
      special_requests: { type: 'string', maxLength: 500 },
      hotel_room_id: { type: 'string' },
      photography_service_id: { type: 'string' },
      vehicle_id: { type: 'string' },
    },
  },
  BookingStatusInput: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: Object.values(BookingStatus) },
      reason: { type: 'string', maxLength: 300 },
    },
  },
  Payment: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      booking_id: { type: 'string' },
      amount: { type: 'number', example: 19500 },
      currency: { type: 'string', example: 'BDT' },
      payment_method: { type: 'string', example: 'bkash' },
      payment_status: { type: 'string', enum: Object.values(PaymentStatus) },
      transaction_reference: { type: 'string' },
      payment_date: { type: 'string', format: 'date-time' },
    },
  },
  PaymentInput: {
    type: 'object',
    required: ['booking_id', 'amount', 'payment_method'],
    properties: {
      booking_id: { type: 'string' },
      amount: { type: 'number', minimum: 1 },
      currency: { type: 'string', minLength: 3, maxLength: 3, default: 'BDT' },
      payment_method: { type: 'string' },
      transaction_reference: { type: 'string' },
    },
  },
  PaymentStatusInput: {
    type: 'object',
    properties: {
      payment_status: { type: 'string', enum: Object.values(PaymentStatus) },
      transaction_reference: { type: 'string' },
    },
  },
  Photographer: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      user_id: { type: 'string', nullable: true },
      name: { type: 'string', example: 'Arif Chowdhury' },
      bio: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      profile_image: { type: 'string', format: 'uri' },
      rating: { type: 'number', example: 4.8 },
      destination_id: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Destination' }] },
    },
  },
  PhotographerInput: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2 },
      bio: { type: 'string', maxLength: 500 },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      profile_image: { type: 'string', format: 'uri' },
      destination_id: { type: 'string' },
      rating: { type: 'number', minimum: 0, maximum: 5 },
    },
  },
  PhotographyService: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      photographer_id: { type: 'string' },
      name: { type: 'string', example: 'Cox\u2019s Bazar Sunrise Portrait' },
      description: { type: 'string' },
      price_per_session: { type: 'number', example: 12000 },
      duration_hours: { type: 'number', example: 3 },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
    },
  },
  PhotographyServiceInput: {
    type: 'object',
    required: ['photographer_id', 'name', 'description', 'price_per_session', 'duration_hours', 'images'],
    properties: {
      photographer_id: { type: 'string' },
      name: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 10 },
      price_per_session: { type: 'number', minimum: 1 },
      duration_hours: { type: 'number', minimum: 0.5 },
      images: { type: 'array', minItems: 1, items: { type: 'string', format: 'uri' } },
    },
  },
  VehicleProvider: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      user_id: { type: 'string', nullable: true },
      name: { type: 'string', example: 'Jasim Uddin Travels' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      description: { type: 'string' },
      rating: { type: 'number', example: 4.6 },
    },
  },
  VehicleProviderInput: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2 },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      description: { type: 'string', maxLength: 500 },
      rating: { type: 'number', minimum: 0, maximum: 5 },
    },
  },
  Vehicle: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      name: { type: 'string', example: 'Toyota Noah' },
      type: { type: 'string', example: 'Microbus' },
      capacity: { type: 'integer', example: 8 },
      price_per_day: { type: 'number', example: 7000 },
      features: { type: 'array', items: { type: 'string' } },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
      provider_id: {
        oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/VehicleProvider' }],
      },
    },
  },
  VehicleInput: {
    type: 'object',
    required: ['name', 'type', 'capacity', 'price_per_day', 'features', 'images', 'provider_id'],
    properties: {
      name: { type: 'string', minLength: 2 },
      type: { type: 'string', minLength: 2 },
      capacity: { type: 'integer', minimum: 1 },
      price_per_day: { type: 'number', minimum: 1 },
      features: { type: 'array', minItems: 1, items: { type: 'string' } },
      images: { type: 'array', minItems: 1, items: { type: 'string', format: 'uri' } },
      provider_id: { type: 'string' },
    },
  },
  VehicleAvailability: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      vehicle_id: { type: 'string' },
      date: { type: 'string', format: 'date-time' },
      available_units: { type: 'integer', example: 2 },
      status: { type: 'string', enum: ['available', 'unavailable', 'partial'] },
    },
  },
  VehicleAvailabilityInput: {
    type: 'object',
    required: ['vehicle_id', 'date', 'available_units'],
    properties: {
      vehicle_id: { type: 'string' },
      date: { type: 'string', format: 'date-time', example: '2026-01-12T00:00:00.000Z' },
      available_units: { type: 'integer', minimum: 0, example: 2 },
      status: { type: 'string', enum: ['available', 'unavailable', 'partial'] },
    },
  },
  Portfolio: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      photographer_id: { type: 'string' },
      service_id: { type: 'string' },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
      description: { type: 'string' },
    },
  },
  UserStatusInput: {
    type: 'object',
    required: ['account_status'],
    properties: {
      account_status: { type: 'string', enum: Object.values(AccountStatus) },
    },
  },
  BookingUpdateInput: {
    type: 'object',
    description: 'Guests may only edit `special_requests`, and only while the booking is pending.',
    properties: {
      special_requests: { type: 'string', maxLength: 500 },
    },
  },
  User: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      phone: { type: 'string' },
      role: { type: 'string', enum: Object.values(UserRole) },
      account_status: { type: 'string', enum: Object.values(AccountStatus) },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  UploadResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      url: { type: 'string', format: 'uri' },
      key: { type: 'string', example: 'uploads/1730000000000-lodge.jpg' },
    },
  },
} as const;

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Global Tourism Platform API',
      version: '1.0.0',
      description: [
        'REST API for destination discovery, hotels and rooms, photography, vehicles and bookings.',
        '',
        '**Authentication.** Send `Authorization: Bearer <token>` using the JWT returned by',
        '`POST /auth/login`. Roles are `tourist`, `hotel_owner`, `photographer`,',
        '`vehicle_provider` and `admin`; a provider route also enforces ownership of the record.',
        '',
        '**Prices.** Every booking total is recalculated on the server from room inventory and',
        'availability. A `price_snapshot` is stored with the confirmed booking.',
      ].join('\n'),
    },
    servers: [
      {
        url: `http://localhost:${PORT}/api/v1`,
        description: 'Local development server',
      },
      {
        url: '/api/v1',
        description: 'Relative (same-origin)',
      },
    ],
    tags: [
      { name: 'Auth', description: 'Registration, login and the caller\u2019s own profile' },
      { name: 'Destinations', description: 'Destination discovery and admin management' },
      { name: 'Categories', description: 'Destination categories' },
      { name: 'Locations', description: 'Destination locations' },
      { name: 'Hotels', description: 'Hotel discovery and owner management' },
      { name: 'Rooms', description: 'Room inventory, quotes and availability' },
      { name: 'Bookings', description: 'Guest bookings and provider queues' },
      { name: 'Payments', description: 'Payment records for a booking' },
      { name: 'Photographers', description: 'Photographer directory and provider workspace' },
      { name: 'Photography Services', description: 'Photography packages offered by a photographer' },
      { name: 'Vehicles', description: 'Rental vehicles and availability' },
      { name: 'Vehicle Providers', description: 'Vehicle provider directory and workspace' },
      { name: 'Users', description: 'Admin user management' },
      { name: 'Uploads', description: 'Direct image upload to object storage' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      responses: {
        ValidationError: {
          description: 'The request body or query failed validation.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
        Unauthorized: {
          description: 'Missing, expired or invalid bearer token.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
        Forbidden: {
          description: 'The token is valid but the role or ownership check failed.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
        NotFound: {
          description: 'The requested record does not exist.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
        Conflict: {
          description: 'The request conflicts with the current state of the record.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
      },
      schemas,
      parameters: {
        Page: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        Limit: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        MongoId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', example: '6b01dca96e0c404fb11f3909' },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
