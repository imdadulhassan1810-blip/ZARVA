import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type SeedListing = Omit<Prisma.ListingCreateInput, "meta"> & { meta?: Record<string, unknown> };

const listings: SeedListing[] = [
  // --- Cabs --- (price = base fare; the actual charge is computed live from real pickup/drop
  // distance + time + surge — see lib/pricing.ts. perKmRate/perMinRate/avgSpeedKmh drive that.)
  { categorySlug: "cab", title: "OneApp Mini", subtitle: "Compact, 4 seats", imageEmoji: "🚗", price: 40, priceUnit: "base fare + ₹/km", rating: 4.6, location: "City centre", tags: ["mini", "budget"], meta: { eta: "3 min", capacity: 4, perKmRate: 11, perMinRate: 1.2, avgSpeedKmh: 26 } },
  { categorySlug: "cab", title: "OneApp Sedan", subtitle: "Comfort, 4 seats", imageEmoji: "🚘", price: 55, priceUnit: "base fare + ₹/km", rating: 4.7, location: "City centre", tags: ["sedan", "comfort"], meta: { eta: "5 min", capacity: 4, perKmRate: 14, perMinRate: 1.5, avgSpeedKmh: 28 } },
  { categorySlug: "cab", title: "OneApp SUV", subtitle: "Spacious, 6 seats", imageEmoji: "🚙", price: 80, priceUnit: "base fare + ₹/km", rating: 4.8, location: "City centre", tags: ["suv", "family"], meta: { eta: "7 min", capacity: 6, perKmRate: 19, perMinRate: 2, avgSpeedKmh: 27 } },
  { categorySlug: "cab", title: "OneApp Auto", subtitle: "Auto-rickshaw, 3 seats", imageEmoji: "🛺", price: 25, priceUnit: "base fare + ₹/km", rating: 4.4, location: "City centre", tags: ["auto", "budget"], meta: { eta: "2 min", capacity: 3, perKmRate: 8, perMinRate: 0.8, avgSpeedKmh: 22 } },
  { categorySlug: "cab", title: "OneApp Bike", subtitle: "Bike taxi, 1 seat", imageEmoji: "🏍️", price: 15, priceUnit: "base fare + ₹/km", rating: 4.5, location: "City centre", tags: ["bike", "quick"], meta: { eta: "2 min", capacity: 1, perKmRate: 6, perMinRate: 0.6, avgSpeedKmh: 32 } },

  // --- Hotels ---
  { categorySlug: "hotel", title: "Grand Palace Hotel", subtitle: "5-star luxury", imageEmoji: "🏨", price: 8500, priceUnit: "per night", rating: 4.7, location: "Mumbai", tags: ["luxury", "pool", "spa"], meta: { roomType: "Deluxe King", freeCancellation: true } },
  { categorySlug: "hotel", title: "Sunrise Business Inn", subtitle: "4-star, near airport", imageEmoji: "🏢", price: 4200, priceUnit: "per night", rating: 4.3, location: "Bengaluru", tags: ["business", "wifi"], meta: { roomType: "Executive Room", freeCancellation: true } },
  { categorySlug: "hotel", title: "Coastal Breeze Resort", subtitle: "Beachfront resort", imageEmoji: "🏖️", price: 6800, priceUnit: "per night", rating: 4.6, location: "Goa", tags: ["beach", "resort"], meta: { roomType: "Sea View Suite", freeCancellation: false } },
  { categorySlug: "hotel", title: "Heritage Haveli", subtitle: "Boutique heritage stay", imageEmoji: "🏯", price: 5200, priceUnit: "per night", rating: 4.8, location: "Jaipur", tags: ["heritage", "boutique"], meta: { roomType: "Heritage Room", freeCancellation: true } },
  { categorySlug: "hotel", title: "Budget Stay Lodge", subtitle: "Clean & simple", imageEmoji: "🛏️", price: 1500, priceUnit: "per night", rating: 3.9, location: "Delhi", tags: ["budget"], meta: { roomType: "Standard Room", freeCancellation: false } },
  { categorySlug: "hotel", title: "Hilltop Retreat", subtitle: "Mountain view rooms", imageEmoji: "⛰️", price: 5600, priceUnit: "per night", rating: 4.5, location: "Manali", tags: ["mountain", "quiet"], meta: { roomType: "Valley View Room", freeCancellation: true } },

  // --- Flights ---
  { categorySlug: "flight", title: "IndiGo 6E-204", subtitle: "Non-stop · 2h 05m", imageEmoji: "✈️", price: 4599, priceUnit: "per traveller", rating: 4.2, location: "Delhi → Mumbai", tags: ["nonstop", "morning"], meta: { departs: "06:15", arrives: "08:20", airline: "IndiGo" } },
  { categorySlug: "flight", title: "Air India AI-887", subtitle: "Non-stop · 2h 10m", imageEmoji: "✈️", price: 5299, priceUnit: "per traveller", rating: 4.0, location: "Delhi → Mumbai", tags: ["nonstop"], meta: { departs: "11:40", arrives: "13:50", airline: "Air India" } },
  { categorySlug: "flight", title: "Vistara UK-995", subtitle: "Non-stop · 2h 00m", imageEmoji: "✈️", price: 6199, priceUnit: "per traveller", rating: 4.5, location: "Bengaluru → Delhi", tags: ["nonstop", "premium"], meta: { departs: "18:30", arrives: "21:15", airline: "Vistara" } },
  { categorySlug: "flight", title: "SpiceJet SG-108", subtitle: "1 stop · 4h 30m", imageEmoji: "✈️", price: 3899, priceUnit: "per traveller", rating: 3.8, location: "Chennai → Kolkata", tags: ["1-stop", "budget"], meta: { departs: "09:05", arrives: "13:35", airline: "SpiceJet" } },
  { categorySlug: "flight", title: "IndiGo 6E-556", subtitle: "Non-stop · 1h 45m", imageEmoji: "✈️", price: 4099, priceUnit: "per traveller", rating: 4.3, location: "Mumbai → Goa", tags: ["nonstop", "evening"], meta: { departs: "19:20", arrives: "21:05", airline: "IndiGo" } },
  { categorySlug: "flight", title: "Akasa Air QP-1332", subtitle: "Non-stop · 2h 20m", imageEmoji: "✈️", price: 4799, priceUnit: "per traveller", rating: 4.4, location: "Hyderabad → Delhi", tags: ["nonstop"], meta: { departs: "14:10", arrives: "16:30", airline: "Akasa Air" } },

  // --- Trains ---
  { categorySlug: "train", title: "Rajdhani Express 12951", subtitle: "AC 2-Tier", imageEmoji: "🚆", price: 2150, priceUnit: "per seat", rating: 4.4, location: "Delhi → Mumbai", tags: ["ac", "overnight"], meta: { departs: "16:25", arrives: "08:15+1", class: "2A" } },
  { categorySlug: "train", title: "Shatabdi Express 12002", subtitle: "AC Chair Car", imageEmoji: "🚄", price: 1450, priceUnit: "per seat", rating: 4.5, location: "Delhi → Bhopal", tags: ["ac", "day"], meta: { departs: "06:00", arrives: "12:40", class: "CC" } },
  { categorySlug: "train", title: "Duronto Express 12213", subtitle: "AC 3-Tier", imageEmoji: "🚆", price: 1680, priceUnit: "per seat", rating: 4.2, location: "Bengaluru → Chennai", tags: ["ac", "nonstop"], meta: { departs: "23:00", arrives: "05:30+1", class: "3A" } },
  { categorySlug: "train", title: "Garib Rath 12203", subtitle: "AC 3-Tier, budget", imageEmoji: "🚆", price: 980, priceUnit: "per seat", rating: 3.9, location: "Kolkata → Delhi", tags: ["budget", "ac"], meta: { departs: "20:10", arrives: "18:45+1", class: "3A" } },
  { categorySlug: "train", title: "Vande Bharat Express 22439", subtitle: "Executive Chair Car", imageEmoji: "🚅", price: 2600, priceUnit: "per seat", rating: 4.7, location: "Delhi → Varanasi", tags: ["premium", "fast"], meta: { departs: "06:00", arrives: "14:00", class: "EC" } },

  // --- Buses ---
  { categorySlug: "bus", title: "OneApp Volvo AC Sleeper", subtitle: "40 seats · AC", imageEmoji: "🚌", price: 899, priceUnit: "per seat", rating: 4.3, location: "Pune → Mumbai", tags: ["ac", "sleeper", "night"], meta: { departs: "22:30", arrives: "05:00+1" } },
  { categorySlug: "bus", title: "OneApp Scania Multi-Axle", subtitle: "36 seats · AC Semi-Sleeper", imageEmoji: "🚍", price: 1099, priceUnit: "per seat", rating: 4.5, location: "Bengaluru → Hyderabad", tags: ["ac", "semi-sleeper"], meta: { departs: "21:00", arrives: "07:00+1" } },
  { categorySlug: "bus", title: "OneApp Non-AC Seater", subtitle: "50 seats", imageEmoji: "🚐", price: 399, priceUnit: "per seat", rating: 3.8, location: "Jaipur → Delhi", tags: ["budget", "day"], meta: { departs: "08:00", arrives: "13:30" } },
  { categorySlug: "bus", title: "OneApp Luxury Sleeper", subtitle: "30 seats · AC Sleeper", imageEmoji: "🚌", price: 1450, priceUnit: "per seat", rating: 4.6, location: "Chennai → Bengaluru", tags: ["ac", "sleeper", "luxury"], meta: { departs: "23:15", arrives: "06:00+1" } },
  { categorySlug: "bus", title: "OneApp Express Seater", subtitle: "45 seats · AC", imageEmoji: "🚌", price: 599, priceUnit: "per seat", rating: 4.1, location: "Ahmedabad → Surat", tags: ["ac", "day"], meta: { departs: "10:00", arrives: "13:30" } },

  // --- Gas ---
  { categorySlug: "gas", title: "14.2 kg LPG Cylinder", subtitle: "Standard domestic refill", imageEmoji: "🛢️", price: 1103, priceUnit: "per refill", rating: 4.5, location: "Home delivery", tags: ["domestic"], meta: { weightKg: 14.2, deliveryEta: "Within 24 hrs" } },
  { categorySlug: "gas", title: "5 kg LPG Cylinder", subtitle: "Small/portable refill", imageEmoji: "🛢️", price: 449, priceUnit: "per refill", rating: 4.4, location: "Home delivery", tags: ["portable"], meta: { weightKg: 5, deliveryEta: "Within 24 hrs" } },
  { categorySlug: "gas", title: "19 kg LPG Cylinder", subtitle: "Commercial refill", imageEmoji: "🛢️", price: 1899, priceUnit: "per refill", rating: 4.3, location: "Home / business delivery", tags: ["commercial"], meta: { weightKg: 19, deliveryEta: "Within 48 hrs" } },

  // --- Grocery ---
  { categorySlug: "grocery", title: "Basmati Rice", subtitle: "5 kg pack", imageEmoji: "🍚", price: 549, priceUnit: "per pack", rating: 4.5, location: "In stock", tags: ["staples", "rice"], meta: { brand: "OneApp Farms" } },
  { categorySlug: "grocery", title: "Toor Dal", subtitle: "1 kg pack", imageEmoji: "🫘", price: 165, priceUnit: "per pack", rating: 4.4, location: "In stock", tags: ["staples", "lentils"], meta: { brand: "OneApp Farms" } },
  { categorySlug: "grocery", title: "Fresh Tomatoes", subtitle: "1 kg", imageEmoji: "🍅", price: 42, priceUnit: "per kg", rating: 4.2, location: "In stock", tags: ["vegetables", "fresh"], meta: {} },
  { categorySlug: "grocery", title: "Bananas", subtitle: "1 dozen", imageEmoji: "🍌", price: 59, priceUnit: "per dozen", rating: 4.3, location: "In stock", tags: ["fruits", "fresh"], meta: {} },
  { categorySlug: "grocery", title: "Full Cream Milk", subtitle: "1 litre", imageEmoji: "🥛", price: 68, priceUnit: "per litre", rating: 4.6, location: "In stock", tags: ["dairy"], meta: { brand: "Amul" } },
  { categorySlug: "grocery", title: "Sunflower Oil", subtitle: "1 litre bottle", imageEmoji: "🧴", price: 189, priceUnit: "per bottle", rating: 4.3, location: "In stock", tags: ["staples", "oil"], meta: { brand: "Fortune" } },
  { categorySlug: "grocery", title: "Brown Eggs", subtitle: "Tray of 12", imageEmoji: "🥚", price: 89, priceUnit: "per tray", rating: 4.5, location: "In stock", tags: ["protein"], meta: {} },
  { categorySlug: "grocery", title: "Whole Wheat Atta", subtitle: "5 kg pack", imageEmoji: "🌾", price: 259, priceUnit: "per pack", rating: 4.4, location: "In stock", tags: ["staples", "flour"], meta: { brand: "Aashirvaad" } },
  { categorySlug: "grocery", title: "Green Tea Bags", subtitle: "Box of 25", imageEmoji: "🍵", price: 149, priceUnit: "per box", rating: 4.2, location: "In stock", tags: ["beverages"], meta: { brand: "Lipton" } },
  { categorySlug: "grocery", title: "Potato Chips", subtitle: "150g pack", imageEmoji: "🥔", price: 45, priceUnit: "per pack", rating: 4.1, location: "In stock", tags: ["snacks"], meta: { brand: "Lay's" } },

  // --- Stationary ---
  { categorySlug: "stationary", title: "Ruled Notebooks", subtitle: "Pack of 6, 200 pages", imageEmoji: "📓", price: 299, priceUnit: "per pack", rating: 4.4, location: "In stock", tags: ["notebooks"], meta: { brand: "Classmate" } },
  { categorySlug: "stationary", title: "Ballpoint Pens", subtitle: "Pack of 10", imageEmoji: "🖊️", price: 90, priceUnit: "per pack", rating: 4.3, location: "In stock", tags: ["pens"], meta: { brand: "Cello" } },
  { categorySlug: "stationary", title: "A4 Copier Paper", subtitle: "500 sheets", imageEmoji: "📄", price: 320, priceUnit: "per ream", rating: 4.5, location: "In stock", tags: ["paper", "office"], meta: { brand: "JK" } },
  { categorySlug: "stationary", title: "Sketch Pens Set", subtitle: "24 colours", imageEmoji: "🖍️", price: 175, priceUnit: "per set", rating: 4.2, location: "In stock", tags: ["art", "kids"], meta: { brand: "Camlin" } },
  { categorySlug: "stationary", title: "Geometry Box", subtitle: "Full set", imageEmoji: "📐", price: 120, priceUnit: "each", rating: 4.1, location: "In stock", tags: ["school"], meta: { brand: "Camlin" } },
  { categorySlug: "stationary", title: "Sticky Notes", subtitle: "5 pads, assorted colours", imageEmoji: "📝", price: 99, priceUnit: "per pack", rating: 4.3, location: "In stock", tags: ["office"], meta: { brand: "Post-it" } },
  { categorySlug: "stationary", title: "Stapler with Pins", subtitle: "Standard, incl. 1000 pins", imageEmoji: "🗂️", price: 149, priceUnit: "each", rating: 4.4, location: "In stock", tags: ["office"], meta: { brand: "Kangaro" } },
  { categorySlug: "stationary", title: "Highlighters", subtitle: "Set of 5", imageEmoji: "🖊️", price: 130, priceUnit: "per set", rating: 4.2, location: "In stock", tags: ["office", "school"], meta: { brand: "Stabilo" } },

  // --- Electronics ---
  { categorySlug: "electronics", title: "Wireless Earbuds", subtitle: "ANC, 30h battery", imageEmoji: "🎧", price: 2999, priceUnit: "each", rating: 4.4, location: "In stock", tags: ["audio"], meta: { brand: "OneApp Audio" } },
  { categorySlug: "electronics", title: "Smartphone 128GB", subtitle: "6.5\" display, 5000mAh", imageEmoji: "📱", price: 15999, priceUnit: "each", rating: 4.3, location: "In stock", tags: ["mobile"], meta: { brand: "Nova" } },
  { categorySlug: "electronics", title: "27\" LED Monitor", subtitle: "Full HD, IPS panel", imageEmoji: "🖥️", price: 10999, priceUnit: "each", rating: 4.5, location: "In stock", tags: ["computers"], meta: { brand: "ViewTech" } },
  { categorySlug: "electronics", title: "Smart LED TV 43\"", subtitle: "4K UHD, Android TV", imageEmoji: "📺", price: 24999, priceUnit: "each", rating: 4.4, location: "In stock", tags: ["tv"], meta: { brand: "Cristal" } },
  { categorySlug: "electronics", title: "Bluetooth Speaker", subtitle: "Portable, waterproof", imageEmoji: "🔊", price: 1899, priceUnit: "each", rating: 4.2, location: "In stock", tags: ["audio"], meta: { brand: "BoomBox" } },
  { categorySlug: "electronics", title: "Laptop 15.6\" i5", subtitle: "16GB RAM, 512GB SSD", imageEmoji: "💻", price: 52999, priceUnit: "each", rating: 4.6, location: "In stock", tags: ["computers"], meta: { brand: "NexBook" } },
  { categorySlug: "electronics", title: "Smartwatch", subtitle: "AMOLED, heart-rate & SpO2", imageEmoji: "⌚", price: 3499, priceUnit: "each", rating: 4.3, location: "In stock", tags: ["wearables"], meta: { brand: "PulseFit" } },
  { categorySlug: "electronics", title: "Power Bank 20000mAh", subtitle: "Fast charging", imageEmoji: "🔋", price: 1499, priceUnit: "each", rating: 4.4, location: "In stock", tags: ["accessories"], meta: { brand: "ChargeUp" } },

  // --- Clothing ---
  { categorySlug: "clothing", title: "Men's Cotton T-Shirt", subtitle: "Regular fit, crew neck", imageEmoji: "👕", price: 399, priceUnit: "each", rating: 4.2, location: "In stock", tags: ["men", "casual"], meta: { sizes: ["S", "M", "L", "XL"] } },
  { categorySlug: "clothing", title: "Women's Kurti", subtitle: "Printed, A-line", imageEmoji: "👗", price: 799, priceUnit: "each", rating: 4.4, location: "In stock", tags: ["women", "ethnic"], meta: { sizes: ["S", "M", "L", "XL"] } },
  { categorySlug: "clothing", title: "Men's Denim Jeans", subtitle: "Slim fit", imageEmoji: "👖", price: 1299, priceUnit: "each", rating: 4.3, location: "In stock", tags: ["men", "casual"], meta: { sizes: ["30", "32", "34", "36"] } },
  { categorySlug: "clothing", title: "Kids Hoodie", subtitle: "Fleece lined", imageEmoji: "🧥", price: 649, priceUnit: "each", rating: 4.5, location: "In stock", tags: ["kids", "winter"], meta: { sizes: ["4-5Y", "6-7Y", "8-9Y"] } },
  { categorySlug: "clothing", title: "Women's Formal Blazer", subtitle: "Office wear", imageEmoji: "🧥", price: 1899, priceUnit: "each", rating: 4.4, location: "In stock", tags: ["women", "formal"], meta: { sizes: ["S", "M", "L"] } },
  { categorySlug: "clothing", title: "Running Shoes", subtitle: "Lightweight mesh", imageEmoji: "👟", price: 2199, priceUnit: "per pair", rating: 4.6, location: "In stock", tags: ["footwear", "sports"], meta: { sizes: ["7", "8", "9", "10"] } },
  { categorySlug: "clothing", title: "Cotton Saree", subtitle: "Handloom, festive", imageEmoji: "🥻", price: 2499, priceUnit: "each", rating: 4.7, location: "In stock", tags: ["women", "ethnic"], meta: { sizes: ["Free size"] } },
  { categorySlug: "clothing", title: "Men's Formal Shirt", subtitle: "Slim fit, cotton", imageEmoji: "👔", price: 899, priceUnit: "each", rating: 4.3, location: "In stock", tags: ["men", "formal"], meta: { sizes: ["S", "M", "L", "XL"] } },

  // --- Food Delivery --- (restaurantLocation drives the live delivery-tracking simulation)
  { categorySlug: "food", title: "Butter Chicken", subtitle: "Punjab Grill", imageEmoji: "🍛", price: 349, priceUnit: "per order", rating: 4.6, location: "Connaught Place, Delhi", tags: ["north-indian", "curry"], meta: { restaurant: "Punjab Grill", restaurantLocation: { lat: 28.6315, lng: 77.2167 }, prepTimeMin: 20 } },
  { categorySlug: "food", title: "Margherita Pizza", subtitle: "Pizza Republic", imageEmoji: "🍕", price: 399, priceUnit: "per order", rating: 4.4, location: "Bandra, Mumbai", tags: ["pizza", "italian"], meta: { restaurant: "Pizza Republic", restaurantLocation: { lat: 19.0596, lng: 72.8295 }, prepTimeMin: 18 } },
  { categorySlug: "food", title: "Chicken Biryani", subtitle: "Paradise Biryani", imageEmoji: "🍚", price: 279, priceUnit: "per order", rating: 4.7, location: "Koramangala, Bengaluru", tags: ["biryani", "hyderabadi"], meta: { restaurant: "Paradise Biryani", restaurantLocation: { lat: 12.9352, lng: 77.6146 }, prepTimeMin: 25 } },
  { categorySlug: "food", title: "Masala Dosa", subtitle: "South Spice Express", imageEmoji: "🥞", price: 129, priceUnit: "per order", rating: 4.5, location: "Koramangala, Bengaluru", tags: ["south-indian", "breakfast"], meta: { restaurant: "South Spice Express", restaurantLocation: { lat: 12.9345, lng: 77.6267 }, prepTimeMin: 12 } },
  { categorySlug: "food", title: "Veg Momos", subtitle: "Dumpling House", imageEmoji: "🥟", price: 149, priceUnit: "per order", rating: 4.3, location: "Connaught Place, Delhi", tags: ["chinese", "snacks"], meta: { restaurant: "Dumpling House", restaurantLocation: { lat: 28.6280, lng: 77.2200 }, prepTimeMin: 15 } },
  { categorySlug: "food", title: "Classic Burger Combo", subtitle: "Burger Barn", imageEmoji: "🍔", price: 249, priceUnit: "per order", rating: 4.2, location: "Bandra, Mumbai", tags: ["burger", "fast-food"], meta: { restaurant: "Burger Barn", restaurantLocation: { lat: 19.0550, lng: 72.8330 }, prepTimeMin: 14 } },
  { categorySlug: "food", title: "Chocolate Brownie Sundae", subtitle: "Sweet Tooth Desserts", imageEmoji: "🍨", price: 189, priceUnit: "per order", rating: 4.6, location: "Connaught Place, Delhi", tags: ["dessert", "sweet"], meta: { restaurant: "Sweet Tooth Desserts", restaurantLocation: { lat: 28.6330, lng: 77.2100 }, prepTimeMin: 10 } },
  { categorySlug: "food", title: "Paneer Tikka Wrap", subtitle: "Punjab Grill", imageEmoji: "🌯", price: 199, priceUnit: "per order", rating: 4.4, location: "Connaught Place, Delhi", tags: ["wrap", "vegetarian"], meta: { restaurant: "Punjab Grill", restaurantLocation: { lat: 28.6315, lng: 77.2167 }, prepTimeMin: 15 } },

  // --- Pharmacy ---
  { categorySlug: "pharmacy", title: "Paracetamol 500mg", subtitle: "Strip of 15 tablets", imageEmoji: "💊", price: 25, priceUnit: "per strip", rating: 4.5, location: "In stock", tags: ["fever", "otc"], meta: { requiresPrescription: false } },
  { categorySlug: "pharmacy", title: "Cough Syrup", subtitle: "100ml bottle", imageEmoji: "🍶", price: 95, priceUnit: "per bottle", rating: 4.2, location: "In stock", tags: ["cold", "otc"], meta: { requiresPrescription: false } },
  { categorySlug: "pharmacy", title: "Vitamin C Effervescent", subtitle: "Tube of 20", imageEmoji: "🍊", price: 165, priceUnit: "per tube", rating: 4.4, location: "In stock", tags: ["immunity", "supplement"], meta: { requiresPrescription: false } },
  { categorySlug: "pharmacy", title: "Digital Thermometer", subtitle: "Fever check, 1 min read", imageEmoji: "🌡️", price: 249, priceUnit: "each", rating: 4.6, location: "In stock", tags: ["device"], meta: { requiresPrescription: false } },
  { categorySlug: "pharmacy", title: "N95 Masks", subtitle: "Pack of 10", imageEmoji: "😷", price: 349, priceUnit: "per pack", rating: 4.5, location: "In stock", tags: ["safety"], meta: { requiresPrescription: false } },
  { categorySlug: "pharmacy", title: "Amoxicillin 500mg", subtitle: "Strip of 10 — Rx required", imageEmoji: "💊", price: 85, priceUnit: "per strip", rating: 4.3, location: "In stock", tags: ["antibiotic", "prescription"], meta: { requiresPrescription: true } },
  { categorySlug: "pharmacy", title: "Blood Pressure Monitor", subtitle: "Digital, upper-arm cuff", imageEmoji: "🩺", price: 1899, priceUnit: "each", rating: 4.7, location: "In stock", tags: ["device", "bp"], meta: { requiresPrescription: false } },
  { categorySlug: "pharmacy", title: "First Aid Kit", subtitle: "Home essentials, 40 pieces", imageEmoji: "🩹", price: 449, priceUnit: "each", rating: 4.5, location: "In stock", tags: ["first-aid"], meta: { requiresPrescription: false } },

  // --- Movies & Events ---
  { categorySlug: "movies", title: "Interstellar Odyssey", subtitle: "Sci-fi · 2h 49m · IMAX", imageEmoji: "🎬", price: 380, priceUnit: "per ticket", rating: 4.7, location: "PVR Select City, Delhi", tags: ["sci-fi", "imax", "english"], meta: { venue: "PVR Select City", showtime: "7:30 PM", language: "English", format: "IMAX 3D" } },
  { categorySlug: "movies", title: "Dil Ki Kahani", subtitle: "Romance/Drama · 2h 20m", imageEmoji: "🎥", price: 260, priceUnit: "per ticket", rating: 4.3, location: "INOX Megaplex, Mumbai", tags: ["hindi", "drama"], meta: { venue: "INOX Megaplex", showtime: "9:00 PM", language: "Hindi", format: "2D" } },
  { categorySlug: "movies", title: "Arjun Reddy 2", subtitle: "Action · 2h 35m", imageEmoji: "🎞️", price: 300, priceUnit: "per ticket", rating: 4.1, location: "PVR Forum, Bengaluru", tags: ["telugu", "action"], meta: { venue: "PVR Forum Mall", showtime: "6:15 PM", language: "Telugu", format: "2D" } },
  { categorySlug: "movies", title: "Arijit Singh Live in Concert", subtitle: "Live music event", imageEmoji: "🎤", price: 1999, priceUnit: "per ticket", rating: 4.9, location: "Jawaharlal Nehru Stadium, Delhi", tags: ["concert", "live-music"], meta: { venue: "JLN Stadium", showtime: "Sat, 6:00 PM", language: "Hindi" } },
  { categorySlug: "movies", title: "Stand-up Comedy Night", subtitle: "Comedy show", imageEmoji: "🎙️", price: 499, priceUnit: "per ticket", rating: 4.5, location: "The Comedy Store, Mumbai", tags: ["comedy", "live"], meta: { venue: "The Comedy Store", showtime: "8:00 PM", language: "English/Hindi" } },
  { categorySlug: "movies", title: "IPL: Mumbai vs Chennai", subtitle: "T20 cricket match", imageEmoji: "🏏", price: 1499, priceUnit: "per ticket", rating: 4.8, location: "Wankhede Stadium, Mumbai", tags: ["cricket", "sports"], meta: { venue: "Wankhede Stadium", showtime: "7:30 PM" } },

  // --- Home Services --- (baseLocation drives the live technician-tracking simulation)
  { categorySlug: "homeservices", title: "AC Repair & Service", subtitle: "CoolFix Technicians", imageEmoji: "❄️", price: 499, priceUnit: "per visit", rating: 4.5, location: "Delhi", tags: ["ac", "appliance"], meta: { providerName: "CoolFix Technicians", baseLocation: { lat: 28.6139, lng: 77.2090 }, durationMin: 60 } },
  { categorySlug: "homeservices", title: "Deep Home Cleaning", subtitle: "SparklePro Cleaners", imageEmoji: "🧹", price: 1299, priceUnit: "per visit", rating: 4.6, location: "Mumbai", tags: ["cleaning"], meta: { providerName: "SparklePro Cleaners", baseLocation: { lat: 19.0760, lng: 72.8777 }, durationMin: 180 } },
  { categorySlug: "homeservices", title: "Electrician Visit", subtitle: "PowerFix Electricians", imageEmoji: "🔌", price: 349, priceUnit: "per visit", rating: 4.4, location: "Bengaluru", tags: ["electrician"], meta: { providerName: "PowerFix Electricians", baseLocation: { lat: 12.9716, lng: 77.5946 }, durationMin: 45 } },
  { categorySlug: "homeservices", title: "Plumber Visit", subtitle: "AquaFix Plumbers", imageEmoji: "🔧", price: 349, priceUnit: "per visit", rating: 4.3, location: "Bengaluru", tags: ["plumber"], meta: { providerName: "AquaFix Plumbers", baseLocation: { lat: 12.9784, lng: 77.6408 }, durationMin: 50 } },
  { categorySlug: "homeservices", title: "Salon at Home — Women's", subtitle: "GlamSquad Stylists", imageEmoji: "💇‍♀️", price: 899, priceUnit: "per visit", rating: 4.7, location: "Delhi", tags: ["salon", "beauty"], meta: { providerName: "GlamSquad Stylists", baseLocation: { lat: 28.5675, lng: 77.2100 }, durationMin: 90 } },
  { categorySlug: "homeservices", title: "Pest Control", subtitle: "BugOff Services", imageEmoji: "🐜", price: 799, priceUnit: "per visit", rating: 4.2, location: "Mumbai", tags: ["pest-control"], meta: { providerName: "BugOff Services", baseLocation: { lat: 19.1197, lng: 72.9051 }, durationMin: 75 } },
];

async function main() {
  console.log("Seeding database…");

  await prisma.cartItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.listing.deleteMany();

  for (const listing of listings) {
    await prisma.listing.create({ data: listing as Prisma.ListingCreateInput });
  }

  console.log(`Seeded ${listings.length} listings.`);

  const demoEmail = "demo@oneapp.dev";
  const existingDemo = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!existingDemo) {
    const passwordHash = await bcrypt.hash("password123", 10);
    await prisma.user.create({
      data: { name: "Demo User", email: demoEmail, passwordHash, phone: "+91 90000 00000", role: "user" },
    });
    console.log(`Created demo user: ${demoEmail} / password123`);
  }

  const adminEmail = "admin@oneapp.dev";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash("adminpass123", 10);
    await prisma.user.create({
      data: { name: "OneApp Admin", email: adminEmail, passwordHash, phone: "+91 90000 00001", role: "admin" },
    });
    console.log(`Created admin user: ${adminEmail} / adminpass123`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
