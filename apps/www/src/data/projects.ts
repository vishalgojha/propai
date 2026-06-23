export interface ProjectFloorPlan {
  bhk: string;
  area: number;
  image?: string;
}

export interface Project {
  slug: string;
  name: string;
  developer: string;
  city: string;
  locality: string;
  status: "ready-possession" | "delivered" | "ongoing";
  possessionYear: number;
  towers: number;
  floors: number;
  totalUnits: number;
  startingPrice: number;
  configurations: string[];
  latitude: number;
  longitude: number;
  description: string;
  amenities: string[];
  gallery: string[];
  floorPlans: ProjectFloorPlan[];
  nearby: { label: string; type: string; distance: string }[];
}

export interface ProjectInventory {
  id: string;
  projectSlug: string;
  price: number;
  bhk: string;
  carpetArea: number;
  furnishing: string;
  floor: string;
  parking: number;
  updatedAt: string;
  listingRef?: string;
}

export const PROJECTS: Project[] = [
  {
    slug: "lodha-marquise-worli-mumbai",
    name: "Lodha Marquise",
    developer: "Lodha Group",
    city: "Mumbai",
    locality: "Worli",
    status: "ready-possession",
    possessionYear: 2019,
    towers: 2,
    floors: 52,
    totalUnits: 388,
    startingPrice: 450_000_00,
    configurations: ["2 BHK", "3 BHK", "4 BHK"],
    latitude: 19.009,
    longitude: 72.820,
    description:
      "Lodha Marquise is a premium residential tower overlooking the Mahalaxmi Racecourse. One of Worli's most coveted addresses, it offers expansive sea-view apartments with world-class amenities and Lodha's signature craftsmanship.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Landscaped Garden", "24/7 Security", "Power Backup", "Tennis Court",
      "Spa & Steam Room", "Jogging Track", "Indoor Games Room", "Party Hall",
      "Yoga Deck", "Cafeteria", "Valet Parking",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200",
    ],
    floorPlans: [
      { bhk: "2 BHK", area: 1150 },
      { bhk: "3 BHK", area: 1620 },
      { bhk: "4 BHK", area: 2350 },
    ],
    nearby: [
      { label: "Mahalaxmi Railway Station", type: "station", distance: "1.2 km" },
      { label: "Worli Sea Face", type: "landmark", distance: "1.5 km" },
      { label: "Atria Mall", type: "mall", distance: "2.0 km" },
      { label: "Hinduja Hospital", type: "hospital", distance: "2.3 km" },
    ],
  },
  {
    slug: "hiranandani-olivia-powai-mumbai",
    name: "Hiranandani Olivia",
    developer: "Hiranandani Group",
    city: "Mumbai",
    locality: "Powai",
    status: "delivered",
    possessionYear: 2017,
    towers: 4,
    floors: 22,
    totalUnits: 320,
    startingPrice: 280_000_00,
    configurations: ["2 BHK", "3 BHK", "4 BHK"],
    latitude: 19.120,
    longitude: 72.900,
    description:
      "Hiranandani Olivia is a landmark residential complex in the heart of Powai. Surrounded by lush greenery and overlooking the Powai Lake, it offers spacious apartments with modern design and Hiranandani's trusted quality.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Landscaped Garden", "24/7 Security", "Power Backup", "Basketball Court",
      "Jogging Track", "Indoor Games", "Party Hall", "Library",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
      "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1200",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200",
    ],
    floorPlans: [
      { bhk: "2 BHK", area: 1050 },
      { bhk: "3 BHK", area: 1480 },
      { bhk: "4 BHK", area: 2100 },
    ],
    nearby: [
      { label: "Powai Lake", type: "landmark", distance: "0.8 km" },
      { label: "Hiranandani Business Park", type: "business", distance: "1.0 km" },
      { label: "R City Mall", type: "mall", distance: "2.5 km" },
      { label: "Kanjurmarg Railway Station", type: "station", distance: "3.0 km" },
    ],
  },
  {
    slug: "runwal-bliss-kanjurmarg-mumbai",
    name: "Runwal Bliss",
    developer: "Runwal Group",
    city: "Mumbai",
    locality: "Kanjurmarg",
    status: "ready-possession",
    possessionYear: 2020,
    towers: 3,
    floors: 18,
    totalUnits: 240,
    startingPrice: 150_000_00,
    configurations: ["1 BHK", "2 BHK", "3 BHK"],
    latitude: 19.130,
    longitude: 72.930,
    description:
      "Runwal Bliss offers thoughtfully designed homes in Kanjurmarg East. With excellent connectivity to Eastern Express Highway and Powai, it provides value-for-money luxury with ample open spaces.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Garden", "24/7 Security", "Power Backup", "Badminton Court",
      "Yoga Room", "Party Hall",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
      "https://images.unsplash.com/photo-1600566753086-00f18f6b1252?w=1200",
    ],
    floorPlans: [
      { bhk: "1 BHK", area: 520 },
      { bhk: "2 BHK", area: 820 },
      { bhk: "3 BHK", area: 1180 },
    ],
    nearby: [
      { label: "Kanjurmarg Railway Station", type: "station", distance: "1.0 km" },
      { label: "Powai", type: "locality", distance: "3.5 km" },
      { label: "Hiranandani Hospital", type: "hospital", distance: "4.0 km" },
    ],
  },
  {
    slug: "lodha-bellissimo-mahalaxmi-mumbai",
    name: "Lodha Bellissimo",
    developer: "Lodha Group",
    city: "Mumbai",
    locality: "Mahalaxmi",
    status: "delivered",
    possessionYear: 2016,
    towers: 1,
    floors: 58,
    totalUnits: 180,
    startingPrice: 750_000_00,
    configurations: ["3 BHK", "4 BHK", "5 BHK"],
    latitude: 18.990,
    longitude: 72.825,
    description:
      "Lodha Bellissimo is an iconic super-luxury residential tower on Pedder Road. Designed by world-renowned architects, it offers unparalleled views of the Arabian Sea and the Mahalaxmi Racecourse. Among Mumbai's most prestigious addresses.",
    amenities: [
      "Infinity Pool", "Gymnasium", "Private Clubhouse", "Spa",
      "Concierge Service", "24/7 Security", "Power Backup", "Valet Parking",
      "Wine Cellar", "Private Theatre", "Sky Lounge",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200",
    ],
    floorPlans: [
      { bhk: "3 BHK", area: 1850 },
      { bhk: "4 BHK", area: 2750 },
      { bhk: "5 BHK", area: 3800 },
    ],
    nearby: [
      { label: "Mahalaxmi Racecourse", type: "landmark", distance: "0.5 km" },
      { label: "Mahalaxmi Railway Station", type: "station", distance: "0.8 km" },
      { label: "Haji Ali", type: "landmark", distance: "2.0 km" },
    ],
  },
  {
    slug: "piramal-mahalaxmi-mumbai",
    name: "Piramal Mahalaxmi",
    developer: "Piramal Realty",
    city: "Mumbai",
    locality: "Mahalaxmi",
    status: "ready-possession",
    possessionYear: 2021,
    towers: 2,
    floors: 48,
    totalUnits: 280,
    startingPrice: 580_000_00,
    configurations: ["2 BHK", "3 BHK", "4 BHK"],
    latitude: 18.995,
    longitude: 72.822,
    description:
      "Piramal Mahalaxmi redefines luxury living with its striking architecture by NBBJ and interiors by Hirsch Bedner Associates. Located in the heart of South Mumbai, the development offers expansive homes with panoramic city and sea views.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Garden", "24/7 Security", "Power Backup", "Squash Court",
      "Spa", "Jogging Track", "Party Hall", "Business Centre",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1200",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200",
    ],
    floorPlans: [
      { bhk: "2 BHK", area: 1250 },
      { bhk: "3 BHK", area: 1720 },
      { bhk: "4 BHK", area: 2450 },
    ],
    nearby: [
      { label: "Mahalaxmi Railway Station", type: "station", distance: "0.6 km" },
      { label: "Worli Sea Link", type: "landmark", distance: "2.0 km" },
      { label: "Atria Mall", type: "mall", distance: "1.5 km" },
    ],
  },
  {
    slug: "omkar-alta-monte-malad-west-mumbai",
    name: "Omkar Alta Monte",
    developer: "Omkar Realtors",
    city: "Mumbai",
    locality: "Malad West",
    status: "ready-possession",
    possessionYear: 2020,
    towers: 3,
    floors: 42,
    totalUnits: 450,
    startingPrice: 120_000_00,
    configurations: ["1 BHK", "2 BHK", "3 BHK"],
    latitude: 19.170,
    longitude: 72.835,
    description:
      "Omkar Alta Monte is a premium high-rise complex in Malad West offering spacious apartments with modern amenities. Located along the Western Express Highway, it provides excellent connectivity to Bandra, Andheri, and the airport.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Landscaped Garden", "24/7 Security", "Power Backup", "Tennis Court",
      "Jogging Track", "Indoor Games", "Party Hall", "Cafeteria",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200",
    ],
    floorPlans: [
      { bhk: "1 BHK", area: 480 },
      { bhk: "2 BHK", area: 760 },
      { bhk: "3 BHK", area: 1120 },
    ],
    nearby: [
      { label: "Malad Railway Station", type: "station", distance: "1.5 km" },
      { label: "Inorbit Mall", type: "mall", distance: "3.0 km" },
      { label: "Mindspace Business Park", type: "business", distance: "4.0 km" },
    ],
  },
  {
    slug: "rustomjee-evershine-global-dahisar-mumbai",
    name: "Rustomjee Evershine Global",
    developer: "Rustomjee Group",
    city: "Mumbai",
    locality: "Dahisar",
    status: "delivered",
    possessionYear: 2018,
    towers: 5,
    floors: 18,
    totalUnits: 600,
    startingPrice: 95_000_00,
    configurations: ["1 BHK", "2 BHK", "3 BHK"],
    latitude: 19.240,
    longitude: 72.850,
    description:
      "Rustomjee Evershine Global is a sprawling township in Dahisar West offering spacious 1, 2, and 3 BHK homes. With extensive green cover, multiple amenities, and proximity to the Western Express Highway, it's a complete lifestyle destination.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Landscaped Garden", "24/7 Security", "Power Backup", "Basketball Court",
      "Tennis Court", "Jogging Track", "Party Hall", "Library",
      "Indoor Games Room", "Cafeteria", "Yoga Room",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200",
      "https://images.unsplash.com/photo-1600566753086-00f18f6b1252?w=1200",
    ],
    floorPlans: [
      { bhk: "1 BHK", area: 450 },
      { bhk: "2 BHK", area: 720 },
      { bhk: "3 BHK", area: 1050 },
    ],
    nearby: [
      { label: "Dahisar Railway Station", type: "station", distance: "1.8 km" },
      { label: "Western Express Highway", type: "road", distance: "1.0 km" },
      { label: "Sanjay Gandhi National Park", type: "landmark", distance: "4.0 km" },
    ],
  },
  {
    slug: "kanakia-silicon-valley-andheri-east-mumbai",
    name: "Kanakia Silicon Valley",
    developer: "Kanakia Group",
    city: "Mumbai",
    locality: "Andheri East",
    status: "ready-possession",
    possessionYear: 2020,
    towers: 4,
    floors: 32,
    totalUnits: 500,
    startingPrice: 85_000_00,
    configurations: ["1 BHK", "2 BHK", "3 BHK"],
    latitude: 19.110,
    longitude: 72.870,
    description:
      "Kanakia Silicon Valley is a modern residential complex in Andheri East near the International Airport. Designed for young professionals and families, it offers well-ventilated homes with excellent city connectivity.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Garden", "24/7 Security", "Power Backup", "Badminton Court",
      "Jogging Track", "Party Hall", "Yoga Deck",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1200",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
    ],
    floorPlans: [
      { bhk: "1 BHK", area: 430 },
      { bhk: "2 BHK", area: 700 },
      { bhk: "3 BHK", area: 980 },
    ],
    nearby: [
      { label: "Andheri Railway Station", type: "station", distance: "3.0 km" },
      { label: "Chhatrapati Shivaji International Airport", type: "airport", distance: "3.5 km" },
      { label: "Infinity Mall", type: "mall", distance: "4.0 km" },
    ],
  },
  {
    slug: "oberoi-eucalyptus-goregaon-east-mumbai",
    name: "Oberoi Eucalyptus",
    developer: "Oberoi Realty",
    city: "Mumbai",
    locality: "Goregaon East",
    status: "ready-possession",
    possessionYear: 2021,
    towers: 2,
    floors: 28,
    totalUnits: 200,
    startingPrice: 175_000_00,
    configurations: ["2 BHK", "3 BHK", "4 BHK"],
    latitude: 19.155,
    longitude: 72.870,
    description:
      "Oberoi Eucalyptus is a premium residential project in Goregaon East's upcoming ODC locality. Surrounded by green zones and with excellent Western Express Highway connectivity, it offers Oberoi's signature quality and design.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Landscaped Garden", "24/7 Security", "Power Backup", "Squash Court",
      "Spa", "Jogging Track", "Party Hall",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
    ],
    floorPlans: [
      { bhk: "2 BHK", area: 950 },
      { bhk: "3 BHK", area: 1350 },
      { bhk: "4 BHK", area: 1850 },
    ],
    nearby: [
      { label: "Goregaon Railway Station", type: "station", distance: "2.5 km" },
      { label: "Western Express Highway", type: "road", distance: "1.0 km" },
      { label: "Oberoi Mall", type: "mall", distance: "3.0 km" },
    ],
  },
  {
    slug: "adani-esperanza-kandivali-west-mumbai",
    name: "Adani Esperanza",
    developer: "Adani Realty",
    city: "Mumbai",
    locality: "Kandivali West",
    status: "ready-possession",
    possessionYear: 2022,
    towers: 4,
    floors: 25,
    totalUnits: 380,
    startingPrice: 70_000_00,
    configurations: ["1 BHK", "2 BHK", "3 BHK"],
    latitude: 19.195,
    longitude: 72.840,
    description:
      "Adani Esperanza is a well-planned residential complex in Kandivali West offering spacious and affordable luxury homes. Close to national park green zones and with direct access to the Western Express Highway.",
    amenities: [
      "Swimming Pool", "Gymnasium", "Clubhouse", "Children's Play Area",
      "Garden", "24/7 Security", "Power Backup", "Jogging Track",
      "Party Hall", "Yoga Room", "Indoor Games",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1600566753086-00f18f6b1252?w=1200",
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200",
    ],
    floorPlans: [
      { bhk: "1 BHK", area: 410 },
      { bhk: "2 BHK", area: 660 },
      { bhk: "3 BHK", area: 920 },
    ],
    nearby: [
      { label: "Kandivali Railway Station", type: "station", distance: "1.5 km" },
      { label: "Sanjay Gandhi National Park", type: "landmark", distance: "3.0 km" },
      { label: "Thakur Village", type: "locality", distance: "2.0 km" },
    ],
  },
];

export const PROJECT_INVENTORY: ProjectInventory[] = [
  // Lodha Marquise
  { id: "lm-001", projectSlug: "lodha-marquise-worli-mumbai", price: 480_000_00, bhk: "2 BHK", carpetArea: 1150, furnishing: "Semi Furnished", floor: "22", parking: 1, updatedAt: "2026-06-23", listingRef: "L-1024" },
  { id: "lm-002", projectSlug: "lodha-marquise-worli-mumbai", price: 510_000_00, bhk: "3 BHK", carpetArea: 1620, furnishing: "Full Furnished", floor: "35", parking: 2, updatedAt: "2026-06-22", listingRef: "L-1031" },
  { id: "lm-003", projectSlug: "lodha-marquise-worli-mumbai", price: 455_000_00, bhk: "2 BHK", carpetArea: 1150, furnishing: "Unfurnished", floor: "12", parking: 1, updatedAt: "2026-06-20", listingRef: "L-0987" },
  { id: "lm-004", projectSlug: "lodha-marquise-worli-mumbai", price: 620_000_00, bhk: "3 BHK", carpetArea: 1620, furnishing: "Semi Furnished", floor: "45", parking: 2, updatedAt: "2026-06-24", listingRef: "L-1102" },
  { id: "lm-005", projectSlug: "lodha-marquise-worli-mumbai", price: 890_000_00, bhk: "4 BHK", carpetArea: 2350, furnishing: "Full Furnished", floor: "40", parking: 3, updatedAt: "2026-06-21" },
  // Hiranandani Olivia
  { id: "ho-001", projectSlug: "hiranandani-olivia-powai-mumbai", price: 295_000_00, bhk: "2 BHK", carpetArea: 1050, furnishing: "Semi Furnished", floor: "8", parking: 1, updatedAt: "2026-06-23", listingRef: "L-0876" },
  { id: "ho-002", projectSlug: "hiranandani-olivia-powai-mumbai", price: 350_000_00, bhk: "3 BHK", carpetArea: 1480, furnishing: "Full Furnished", floor: "15", parking: 2, updatedAt: "2026-06-22", listingRef: "L-0912" },
  { id: "ho-003", projectSlug: "hiranandani-olivia-powai-mumbai", price: 275_000_00, bhk: "2 BHK", carpetArea: 1050, furnishing: "Unfurnished", floor: "3", parking: 1, updatedAt: "2026-06-19" },
  // Runwal Bliss
  { id: "rb-001", projectSlug: "runwal-bliss-kanjurmarg-mumbai", price: 155_000_00, bhk: "2 BHK", carpetArea: 820, furnishing: "Semi Furnished", floor: "7", parking: 1, updatedAt: "2026-06-24", listingRef: "L-0765" },
  { id: "rb-002", projectSlug: "runwal-bliss-kanjurmarg-mumbai", price: 185_000_00, bhk: "3 BHK", carpetArea: 1180, furnishing: "Unfurnished", floor: "12", parking: 2, updatedAt: "2026-06-23", listingRef: "L-0788" },
  { id: "rb-003", projectSlug: "runwal-bliss-kanjurmarg-mumbai", price: 95_000_00, bhk: "1 BHK", carpetArea: 520, furnishing: "Semi Furnished", floor: "5", parking: 1, updatedAt: "2026-06-20" },
  { id: "rb-004", projectSlug: "runwal-bliss-kanjurmarg-mumbai", price: 165_000_00, bhk: "2 BHK", carpetArea: 820, furnishing: "Full Furnished", floor: "14", parking: 1, updatedAt: "2026-06-24" },
  // Lodha Bellissimo
  { id: "lb-001", projectSlug: "lodha-bellissimo-mahalaxmi-mumbai", price: 780_000_00, bhk: "3 BHK", carpetArea: 1850, furnishing: "Full Furnished", floor: "25", parking: 2, updatedAt: "2026-06-22", listingRef: "L-0654" },
  { id: "lb-002", projectSlug: "lodha-bellissimo-mahalaxmi-mumbai", price: 1_250_000_00, bhk: "4 BHK", carpetArea: 2750, furnishing: "Full Furnished", floor: "38", parking: 3, updatedAt: "2026-06-21" },
  // Piramal Mahalaxmi
  { id: "pm-001", projectSlug: "piramal-mahalaxmi-mumbai", price: 590_000_00, bhk: "2 BHK", carpetArea: 1250, furnishing: "Semi Furnished", floor: "18", parking: 2, updatedAt: "2026-06-24", listingRef: "L-0543" },
  { id: "pm-002", projectSlug: "piramal-mahalaxmi-mumbai", price: 650_000_00, bhk: "3 BHK", carpetArea: 1720, furnishing: "Full Furnished", floor: "30", parking: 2, updatedAt: "2026-06-23", listingRef: "L-0587" },
  { id: "pm-003", projectSlug: "piramal-mahalaxmi-mumbai", price: 580_000_00, bhk: "2 BHK", carpetArea: 1250, furnishing: "Unfurnished", floor: "10", parking: 1, updatedAt: "2026-06-19" },
  // Omkar Alta Monte
  { id: "oa-001", projectSlug: "omkar-alta-monte-malad-west-mumbai", price: 125_000_00, bhk: "2 BHK", carpetArea: 760, furnishing: "Semi Furnished", floor: "15", parking: 1, updatedAt: "2026-06-24", listingRef: "L-0432" },
  { id: "oa-002", projectSlug: "omkar-alta-monte-malad-west-mumbai", price: 155_000_00, bhk: "3 BHK", carpetArea: 1120, furnishing: "Unfurnished", floor: "25", parking: 2, updatedAt: "2026-06-22" },
  { id: "oa-003", projectSlug: "omkar-alta-monte-malad-west-mumbai", price: 80_000_00, bhk: "1 BHK", carpetArea: 480, furnishing: "Semi Furnished", floor: "8", parking: 1, updatedAt: "2026-06-23" },
  // Rustomjee Evershine Global
  { id: "reg-001", projectSlug: "rustomjee-evershine-global-dahisar-mumbai", price: 98_000_00, bhk: "2 BHK", carpetArea: 720, furnishing: "Semi Furnished", floor: "6", parking: 1, updatedAt: "2026-06-23", listingRef: "L-0321" },
  { id: "reg-002", projectSlug: "rustomjee-evershine-global-dahisar-mumbai", price: 125_000_00, bhk: "3 BHK", carpetArea: 1050, furnishing: "Full Furnished", floor: "12", parking: 2, updatedAt: "2026-06-21" },
  // Kanakia Silicon Valley
  { id: "ksv-001", projectSlug: "kanakia-silicon-valley-andheri-east-mumbai", price: 88_000_00, bhk: "2 BHK", carpetArea: 700, furnishing: "Semi Furnished", floor: "10", parking: 1, updatedAt: "2026-06-24", listingRef: "L-0210" },
  { id: "ksv-002", projectSlug: "kanakia-silicon-valley-andheri-east-mumbai", price: 110_000_00, bhk: "3 BHK", carpetArea: 980, furnishing: "Unfurnished", floor: "18", parking: 2, updatedAt: "2026-06-22" },
  // Oberoi Eucalyptus
  { id: "oe-001", projectSlug: "oberoi-eucalyptus-goregaon-east-mumbai", price: 180_000_00, bhk: "2 BHK", carpetArea: 950, furnishing: "Semi Furnished", floor: "14", parking: 1, updatedAt: "2026-06-24", listingRef: "L-0154" },
  { id: "oe-002", projectSlug: "oberoi-eucalyptus-goregaon-east-mumbai", price: 210_000_00, bhk: "3 BHK", carpetArea: 1350, furnishing: "Full Furnished", floor: "22", parking: 2, updatedAt: "2026-06-23" },
  // Adani Esperanza
  { id: "ae-001", projectSlug: "adani-esperanza-kandivali-west-mumbai", price: 72_000_00, bhk: "2 BHK", carpetArea: 660, furnishing: "Semi Furnished", floor: "9", parking: 1, updatedAt: "2026-06-24" },
  { id: "ae-002", projectSlug: "adani-esperanza-kandivali-west-mumbai", price: 95_000_00, bhk: "3 BHK", carpetArea: 920, furnishing: "Unfurnished", floor: "16", parking: 2, updatedAt: "2026-06-23", listingRef: "L-0087" },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export function getProjectInventory(slug: string): ProjectInventory[] {
  return PROJECT_INVENTORY.filter((i) => i.projectSlug === slug);
}

export function getSimilarProjects(slug: string, limit = 4): Project[] {
  const project = getProjectBySlug(slug);
  if (!project) return [];
  return PROJECTS
    .filter((p) => p.slug !== slug && p.locality === project.locality)
    .slice(0, limit);
}
