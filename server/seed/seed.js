// Simple development-only seed data for local testing.
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Category from "../models/Category.js";
import ContactMessage from "../models/ContactMessage.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import AdminSession from "../models/AdminSession.js";
import { slugify } from "../utils/slugify.js";

if (process.env.NODE_ENV === "production") {
  console.error("Seed script is disabled in production.");
  process.exit(1);
}

const resetOnly = process.argv.includes("--reset");

const imageUrls = [
  "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1620706857370-e1b9770e8bb1?auto=format&fit=crop&w=900&q=80",
];

const categorySeeds = [
  { name: "Groundnut Oils", description: "Nutty everyday cold-pressed oils for Indian kitchens." },
  { name: "Coconut Oils", description: "Aromatic coconut oils for cooking, baking, and pantry care." },
  { name: "Sesame Oils", description: "Traditional gingelly oils with rich roasted depth." },
];

const productSeeds = [
  { title: "Cold Pressed Groundnut Oil 1L", price: 399, discountPrice: 349, stock: 40, category: "Groundnut Oils", featured: true, bestSeller: true, tags: ["groundnut", "Cold Pressed", "cooking oil"] },
  { title: "Classic Groundnut Oil 500ml", price: 229, discountPrice: 199, stock: 55, category: "Groundnut Oils", featured: false, bestSeller: true, tags: ["groundnut", "daily cooking"] },
  { title: "Premium Groundnut Oil 5L Tin", price: 1899, discountPrice: 1699, stock: 18, category: "Groundnut Oils", featured: true, bestSeller: false, tags: ["groundnut", "family pack"] },
  { title: "Virgin Coconut Oil 500ml", price: 349, discountPrice: 299, stock: 32, category: "Coconut Oils", featured: true, bestSeller: true, tags: ["coconut", "virgin oil"] },
  { title: "Cold Pressed Coconut Oil 1L", price: 549, discountPrice: 499, stock: 27, category: "Coconut Oils", featured: true, bestSeller: false, tags: ["coconut", "cold pressed"] },
  { title: "Coconut Oil Family Pack 2L", price: 999, discountPrice: 899, stock: 14, category: "Coconut Oils", featured: false, bestSeller: false, tags: ["coconut", "family pack"] },
  { title: "Traditional Gingelly Oil 1L", price: 479, discountPrice: 429, stock: 35, category: "Sesame Oils", featured: true, bestSeller: true, tags: ["sesame", "gingelly"] },
  { title: "Sesame Oil 500ml", price: 279, discountPrice: 249, stock: 48, category: "Sesame Oils", featured: false, bestSeller: false, tags: ["sesame", "cooking oil"] },
  { title: "Black Sesame Oil 250ml", price: 249, discountPrice: 219, stock: 22, category: "Sesame Oils", featured: false, bestSeller: false, tags: ["black sesame", "wellness"] },
  { title: "Festival Sesame Oil 2L", price: 929, discountPrice: 849, stock: 16, category: "Sesame Oils", featured: true, bestSeller: false, tags: ["sesame", "festival", "traditional"] },
];

const address = {
  fullName: "Demo Customer",
  phone: "9999999999",
  street: "12 Market Road",
  city: "Tumakuru",
  state: "Karnataka",
  postalCode: "572106",
  country: "India",
};

async function ensureUser(payload) {
  const existing = await User.findOne(payload.email ? { email: payload.email } : { phone: payload.phone });
  if (existing) return { doc: existing, created: false };
  const doc = await User.create(payload);
  return { doc, created: true };
}

async function ensureCategory(seed, index) {
  const slug = slugify(seed.name);
  const existing = await Category.findOne({ slug });
  if (existing) return { doc: existing, created: false };
  const doc = await Category.create({ ...seed, slug, image: imageUrls[index % imageUrls.length], isActive: true });
  return { doc, created: true };
}

async function ensureProduct(seed, _categories, index) {
  const slug = slugify(seed.title);
  const existing = await Product.findOne({ slug });
  if (existing) return { doc: existing, created: false };
  const variantName = seed.title.match(/(\d+(?:\.\d+)?\s*(?:ml|l))/i)?.[1]?.replace(/\s+/g, "") || "Default";
  const sku = `SSOIL-${String(index + 1).padStart(3, "0")}`;
  const image = { url: imageUrls[index % imageUrls.length], publicId: null };
  const doc = await Product.create({
    title: seed.title,
    slug,
    description: `${seed.title} is made in small batches using traditional cold-press methods for natural aroma and everyday cooking quality.`,
    tags: seed.tags,
    variants: [{ name: variantName, sku, price: seed.discountPrice || seed.price, mrp: seed.price, discount: seed.discountPrice ? seed.price - seed.discountPrice : 0, stock: seed.stock, weight: seed.title.includes("5L") ? 5 : seed.title.includes("2L") ? 2 : seed.title.includes("250ml") ? 0.25 : seed.title.includes("500ml") ? 0.5 : 1, dimensions: { length: 10, width: 10, height: 24 }, images: [image], isActive: true }],
    featured: seed.featured,
    bestSeller: seed.bestSeller,
    newArrival: index > 6,
    isActive: true,
  });
  return { doc, created: true };
}

async function ensureOrder(seed) {
  const existing = await Order.findOne({ couponCode: seed.couponCode });
  if (existing) return { doc: existing, created: false };
  const doc = await Order.create(seed);
  return { doc, created: true };
}

async function ensureContact(seed) {
  const existing = await ContactMessage.findOne({ email: seed.email, subject: seed.subject });
  if (existing) return { doc: existing, created: false };
  const doc = await ContactMessage.create(seed);
  return { doc, created: true };
}

async function seed() {
  await connectDB();

  if (resetOnly) {
    await Promise.all([User.deleteMany(), AdminSession.deleteMany(), Product.deleteMany(), Order.deleteMany()]);
    console.log("Product, user, admin-session, and order database reset complete. Gallery, categories, contact messages, and uploaded files were preserved.");
    await mongoose.disconnect();
    return;
  }

  let usersCreated = 0;
  let categoriesCreated = 0;
  let productsCreated = 0;
  let ordersCreated = 0;
  let contactsCreated = 0;

  const adminResult = await ensureUser({ name: "Development Admin", email: "admin@example.com", password: process.env.DEFAULT_ADMIN_PASSWORD || "Admin@12345", role: "admin", adminRole: "OWNER" });
  const user1Result = await ensureUser({ name: "Demo User One", phone: "+919876543210", phoneVerified: true, role: "user", addresses: [{ ...address, label: "Home", isDefault: true }] });
  const user2Result = await ensureUser({ name: "Demo User Two", phone: "+919876543211", phoneVerified: true, role: "user", addresses: [{ ...address, fullName: "Demo User Two", label: "Home", isDefault: true }] });
  usersCreated += [adminResult, user1Result, user2Result].filter((item) => item.created).length;

  const categoryResults = [];
  for (const [index, seedItem] of categorySeeds.entries()) categoryResults.push(await ensureCategory(seedItem, index));
  categoriesCreated = categoryResults.filter((item) => item.created).length;
  const categories = categoryResults.map((item) => item.doc);

  const productResults = [];
  for (const [index, seedItem] of productSeeds.entries()) productResults.push(await ensureProduct(seedItem, categories, index));
  productsCreated = productResults.filter((item) => item.created).length;
  const products = productResults.map((item) => item.doc);

  user1Result.doc.wishlist = [products[0]._id, products[3]._id, products[6]._id];
  user1Result.doc.cart = [{ product: products[0]._id, variant: products[0].variants[0]._id, quantity: 1 }, { product: products[7]._id, variant: products[7].variants[0]._id, quantity: 2 }];
  await user1Result.doc.save();
  user2Result.doc.wishlist = [products[2]._id, products[4]._id];
  user2Result.doc.cart = [{ product: products[4]._id, variant: products[4].variants[0]._id, quantity: 1 }];
  await user2Result.doc.save();

  const orderSeeds = [
    {
      user: user1Result.doc._id,
      products: [
        { product: products[0]._id, variant: products[0].variants[0]._id, variantName: products[0].variants[0].name, sku: products[0].variants[0].sku, title: products[0].title, image: products[0].variants[0].images[0].url, quantity: 1, price: products[0].variants[0].price, mrp: products[0].variants[0].mrp, total: products[0].variants[0].price },
        { product: products[6]._id, variant: products[6].variants[0]._id, variantName: products[6].variants[0].name, sku: products[6].variants[0].sku, title: products[6].title, image: products[6].variants[0].images[0].url, quantity: 1, price: products[6].variants[0].price, mrp: products[6].variants[0].mrp, total: products[6].variants[0].price },
      ],
      shippingAddress: address,
      paymentMethod: "cod",
      paymentStatus: "pending",
      orderStatus: "placed",
      totalAmount: products[0].variants[0].price + products[6].variants[0].price,
      couponCode: "DEMOORDER1",
    },
    {
      user: user2Result.doc._id,
      products: [{ product: products[4]._id, variant: products[4].variants[0]._id, variantName: products[4].variants[0].name, sku: products[4].variants[0].sku, title: products[4].title, image: products[4].variants[0].images[0].url, quantity: 2, price: products[4].variants[0].price, mrp: products[4].variants[0].mrp, total: products[4].variants[0].price * 2 }],
      shippingAddress: { ...address, fullName: "Demo User Two" },
      paymentMethod: "razorpay",
      paymentStatus: "paid",
      orderStatus: "confirmed",
      totalAmount: products[4].variants[0].price * 2,
      couponCode: "DEMOORDER2",
      razorpayOrderId: "order_demo_seed_002",
      razorpayPaymentId: "pay_demo_seed_002",
    },
  ];

  for (const seedItem of orderSeeds) ordersCreated += (await ensureOrder(seedItem)).created ? 1 : 0;

  const contactSeeds = [
    { name: "Priya Rao", email: "priya.demo@example.com", phone: "9000000001", subject: "Bulk order enquiry", message: "I would like pricing for a monthly bulk order of groundnut oil." },
    { name: "Ramesh Kumar", email: "ramesh.demo@example.com", phone: "9000000002", subject: "Delivery question", message: "Please confirm delivery availability for Tumakuru and Bengaluru." },
  ];
  for (const seedItem of contactSeeds) contactsCreated += (await ensureContact(seedItem)).created ? 1 : 0;

  console.log(`Seed complete. Categories created: ${categoriesCreated}. Products created: ${productsCreated}. Users created: ${usersCreated}. Orders created: ${ordersCreated}. Contact messages created: ${contactsCreated}.`);
  console.log("Development admin login: admin@example.com; password from DEFAULT_ADMIN_PASSWORD (or Admin@12345 locally). Customer mock OTP phones: +919876543210 and +919876543211");
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
