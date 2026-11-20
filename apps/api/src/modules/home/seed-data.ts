/**
 * Launch catalogue for Durgapur. Prices are in rupees incl. GST and pitched for a tier-2 city:
 * roughly 20-35% below Kolkata/metro rates on Urban Company, close to what local technicians quote.
 * They are a starting point to validate with 10-20 local pros before launch, not market research.
 */

export const cities = [
  {
    id: "durgapur", name: "Durgapur", state: "West Bengal", active: true, sort: 1,
    // Durgapur Municipal Corporation area + Steel Township. Verify against India Post before launch.
    pincodes: ["713201", "713202", "713203", "713204", "713205", "713206", "713207", "713208", "713209", "713210", "713211", "713212", "713213", "713214", "713215", "713216"],
  },
  {
    id: "asansol", name: "Asansol", state: "West Bengal", active: false, sort: 2,
    pincodes: ["713301", "713302", "713303", "713304", "713305", "713325", "713326", "713340", "713357"],
  },
  { id: "kolkata", name: "Kolkata", state: "West Bengal", active: false, sort: 3, pincodes: [] as string[] },
];

interface SeedService { slug: string; name: string; description: string; price: number; minutes: number; inclusions: string[] }
interface SeedCategory { slug: string; name: string; icon: string; description: string; services: SeedService[] }

export const categories: SeedCategory[] = [
  {
    slug: "electrician", name: "Electrician", icon: "⚡", description: "Fans, lights, switches, wiring and inverters",
    services: [
      { slug: "switch-socket-repair", name: "Switch / socket repair", description: "Repair or replace one switch or socket", price: 99, minutes: 30, inclusions: ["Up to 2 switches or sockets", "Spare parts billed at MRP"] },
      { slug: "fan-installation", name: "Ceiling fan installation", description: "Install one ceiling fan with existing hook and wiring", price: 149, minutes: 45, inclusions: ["Fitting and balancing", "Regulator connection"] },
      { slug: "fan-repair", name: "Fan repair", description: "Diagnose and fix a ceiling, wall or exhaust fan", price: 199, minutes: 45, inclusions: ["Capacitor / bearing check", "Spare parts extra"] },
      { slug: "light-installation", name: "Tube light / LED installation", description: "Fit one tube light, LED batten or ceiling light", price: 99, minutes: 30, inclusions: ["Mounting and connection"] },
      { slug: "mcb-replacement", name: "MCB / fuse replacement", description: "Replace a tripped or burnt MCB or fuse", price: 149, minutes: 30, inclusions: ["Load check", "MCB billed at MRP"] },
      { slug: "inverter-installation", name: "Inverter installation", description: "Install inverter and battery with house wiring", price: 449, minutes: 90, inclusions: ["Connection to up to 4 points", "Earthing check"] },
      { slug: "wiring-inspection", name: "Wiring inspection", description: "Find faults, short circuits or earthing issues", price: 199, minutes: 60, inclusions: ["Full-home check", "Written quote for repairs"] },
    ],
  },
  {
    slug: "plumber", name: "Plumber", icon: "🚰", description: "Taps, leaks, blockages, toilets and tanks",
    services: [
      { slug: "tap-repair", name: "Tap repair", description: "Fix a leaking or stuck tap", price: 99, minutes: 30, inclusions: ["Washer / spindle replacement", "Parts extra"] },
      { slug: "tap-installation", name: "Tap / mixer installation", description: "Install a new tap or mixer you provide", price: 149, minutes: 30, inclusions: ["Teflon and fitting"] },
      { slug: "blockage-removal", name: "Drain blockage removal", description: "Clear a blocked sink, basin or floor drain", price: 249, minutes: 45, inclusions: ["Manual and machine clearing"] },
      { slug: "toilet-repair", name: "Toilet / flush repair", description: "Fix a running flush, leak or loose seat", price: 299, minutes: 60, inclusions: ["Flush tank parts extra"] },
      { slug: "geyser-installation", name: "Geyser installation", description: "Mount and connect a storage or instant geyser", price: 399, minutes: 60, inclusions: ["Inlet / outlet connection", "Pressure valve check"] },
      { slug: "water-tank-cleaning", name: "Water tank cleaning", description: "Clean one overhead tank up to 1000 litres", price: 599, minutes: 90, inclusions: ["Drain, scrub, disinfect", "Sludge removal"] },
    ],
  },
  {
    slug: "ac-appliance", name: "AC & appliance repair", icon: "❄️", description: "AC service, washing machine, fridge, RO",
    services: [
      { slug: "ac-service", name: "AC service (split / window)", description: "Jet-pump cleaning of indoor and outdoor unit", price: 499, minutes: 60, inclusions: ["Filter and coil cleaning", "Drain pipe flush", "Cooling check"] },
      { slug: "ac-gas-refill", name: "AC gas refill", description: "Leak check and full gas top-up", price: 2199, minutes: 90, inclusions: ["Leak test", "Full refill (R32 / R410)", "30-day warranty"] },
      { slug: "ac-installation", name: "AC installation (split)", description: "Install a split AC with up to 3 m copper pipe", price: 1299, minutes: 120, inclusions: ["Indoor + outdoor mounting", "Extra pipe billed per metre"] },
      { slug: "washing-machine-repair", name: "Washing machine repair", description: "Diagnosis visit for any brand", price: 249, minutes: 60, inclusions: ["Visit charge adjusted in repair bill"] },
      { slug: "fridge-repair", name: "Refrigerator repair", description: "Diagnosis visit for single or double door", price: 249, minutes: 60, inclusions: ["Visit charge adjusted in repair bill"] },
      { slug: "ro-service", name: "RO water purifier service", description: "Filter check and cleaning", price: 349, minutes: 45, inclusions: ["Pre-filter cleaning", "TDS check", "Cartridges extra"] },
    ],
  },
  {
    slug: "cleaning", name: "Home cleaning", icon: "🧽", description: "Bathroom, kitchen, sofa and full home",
    services: [
      { slug: "bathroom-deep-clean", name: "Bathroom deep cleaning", description: "One bathroom: tiles, fittings, toilet, mirror", price: 449, minutes: 75, inclusions: ["Hard-water stain removal", "Machine scrubbing"] },
      { slug: "kitchen-deep-clean", name: "Kitchen deep cleaning", description: "Slab, tiles, sink, chimney exterior, cabinets outside", price: 1199, minutes: 150, inclusions: ["Degreasing", "Cabinet exterior wipe"] },
      { slug: "sofa-cleaning", name: "Sofa cleaning (5 seats)", description: "Shampoo and vacuum fabric sofa", price: 699, minutes: 90, inclusions: ["Stain treatment", "Quick-dry"] },
      { slug: "full-home-2bhk", name: "Full home deep cleaning (2 BHK)", description: "All rooms, kitchen and 2 bathrooms", price: 3499, minutes: 300, inclusions: ["Team of 2-3", "Floor scrubbing", "Fan and window cleaning"] },
      { slug: "full-home-3bhk", name: "Full home deep cleaning (3 BHK)", description: "All rooms, kitchen and 3 bathrooms", price: 4499, minutes: 360, inclusions: ["Team of 3", "Floor scrubbing", "Fan and window cleaning"] },
    ],
  },
  {
    slug: "salon-women", name: "Salon at home (women)", icon: "💅", description: "Waxing, facials, threading, mani-pedi",
    services: [
      { slug: "threading", name: "Eyebrow + upper lip threading", description: "Threading by a trained beautician", price: 79, minutes: 15, inclusions: ["Disposable thread"] },
      { slug: "waxing-arms-legs", name: "Full arms + legs waxing (Rica)", description: "Rica liposoluble wax", price: 599, minutes: 60, inclusions: ["Single-use spatula", "Post-wax lotion"] },
      { slug: "fruit-facial", name: "Fruit facial", description: "Cleanup, scrub, massage and pack", price: 699, minutes: 60, inclusions: ["Branded products", "Single-use kit"] },
      { slug: "manicure", name: "Manicure", description: "Classic manicure with polish", price: 399, minutes: 45, inclusions: ["Sterilised tools"] },
      { slug: "pedicure", name: "Pedicure", description: "Classic pedicure with foot soak", price: 499, minutes: 50, inclusions: ["Sterilised tools", "Foot scrub"] },
      { slug: "hair-spa", name: "Hair spa", description: "Deep conditioning and head massage", price: 799, minutes: 60, inclusions: ["Branded products"] },
    ],
  },
  {
    slug: "grooming-men", name: "Men's grooming", icon: "💈", description: "Haircut, beard, massage and facial at home",
    services: [
      { slug: "mens-haircut", name: "Haircut", description: "Haircut at home by a trained barber", price: 199, minutes: 30, inclusions: ["Single-use cape and blade"] },
      { slug: "beard-trim", name: "Beard trim / shave", description: "Shape-up or clean shave", price: 99, minutes: 20, inclusions: ["Single-use blade"] },
      { slug: "haircut-beard", name: "Haircut + beard", description: "Combo at a lower price", price: 249, minutes: 45, inclusions: ["Single-use cape and blade"] },
      { slug: "head-massage", name: "Head massage (20 min)", description: "Oil head massage", price: 199, minutes: 20, inclusions: ["Oil of your choice"] },
      { slug: "mens-facial", name: "Facial", description: "Cleanup, scrub and pack", price: 499, minutes: 45, inclusions: ["Branded products"] },
    ],
  },
  {
    slug: "pest-control", name: "Pest control", icon: "🪳", description: "Cockroach, termite and bed bug treatment",
    services: [
      { slug: "cockroach-2bhk", name: "Cockroach control (2 BHK)", description: "Gel + spray treatment, odourless", price: 899, minutes: 60, inclusions: ["Kitchen and bathrooms", "90-day warranty"] },
      { slug: "termite-inspection", name: "Termite inspection", description: "Inspection and written quote", price: 299, minutes: 45, inclusions: ["Visit charge adjusted in treatment bill"] },
      { slug: "bed-bug-2bhk", name: "Bed bug treatment (2 BHK)", description: "Two-visit treatment", price: 1499, minutes: 90, inclusions: ["2 visits, 15 days apart"] },
    ],
  },
  {
    slug: "carpenter", name: "Carpenter", icon: "🪚", description: "Furniture repair, hinges, locks and assembly",
    services: [
      { slug: "hinge-handle-repair", name: "Hinge / handle / channel repair", description: "Fix up to 2 doors or drawers", price: 149, minutes: 30, inclusions: ["Parts extra"] },
      { slug: "door-lock-installation", name: "Door lock installation", description: "Fit a lock you provide", price: 249, minutes: 45, inclusions: ["Mortise or rim lock"] },
      { slug: "furniture-assembly", name: "Furniture assembly", description: "Assemble one bed, wardrobe or table", price: 499, minutes: 90, inclusions: ["Flat-pack furniture"] },
    ],
  },
];

/** Demo professionals for local testing only. Never run the demo seed against production. */
export const demoPros = [
  { phone: "9000000001", name: "Subrata Mondal", locality: "Benachity", categories: ["electrician", "plumber"] },
  { phone: "9000000002", name: "Arup Ghosh", locality: "City Centre", categories: ["electrician"] },
  { phone: "9000000003", name: "Md. Rafiq Ansari", locality: "A-Zone", categories: ["ac-appliance"] },
  { phone: "9000000004", name: "Bapi Bauri", locality: "Bidhannagar", categories: ["plumber", "carpenter"] },
  { phone: "9000000005", name: "Tanushree Pal", locality: "Steel Township", categories: ["salon-women"] },
  { phone: "9000000006", name: "Rimpa Das", locality: "Muchipara", categories: ["salon-women"] },
  { phone: "9000000007", name: "Sanjay Thakur", locality: "B-Zone", categories: ["grooming-men"] },
  { phone: "9000000008", name: "Durgapur Shine Team", locality: "Benachity", categories: ["cleaning", "pest-control"] },
];
