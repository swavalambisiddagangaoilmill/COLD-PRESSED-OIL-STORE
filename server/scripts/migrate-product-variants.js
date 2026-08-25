import "dotenv/config";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import User from "../models/User.js";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");
await mongoose.connect(uri);
const products = await Product.collection.find({}).toArray();
let migrated = 0;
for (const product of products) {
  const variants = product.variants?.length ? product.variants.map((variant) => ({ ...variant, weight: variant.weight ?? product.weight ?? 0, dimensions: variant.dimensions || product.dimensions || { length: 0, width: 0, height: 0 } })) : [{
    _id: new mongoose.Types.ObjectId(), name: product.weight ? `${product.weight}kg` : "Default",
    sku: product.sku || `PRODUCT-${String(product._id).slice(-8).toUpperCase()}`,
    price: product.discountPrice || product.price, mrp: product.price,
    discount: product.discountPrice ? product.price - product.discountPrice : 0,
    stock: product.stock || 0, weight: product.weight || 0,
    dimensions: product.dimensions || { length: 0, width: 0, height: 0 }, images: product.images || [], isActive: product.isActive !== false, isArchived: false,
  }];
  await Product.collection.updateOne({ _id: product._id }, { $set: { variants }, $unset: { category: "", sku: "", price: "", discountPrice: "", stock: "", weight: "", dimensions: "", images: "" } });
  migrated += 1;
}
const users = await User.find({ "cart.0": { $exists: true } });
for (const user of users) {
  for (const item of user.cart) {
    if (item.variant) continue;
    const product = await Product.findById(item.product).select("variants");
    item.variant = product?.variants?.find((variant) => variant.isActive && variant.stock > 0)?._id || product?.variants?.[0]?._id;
  }
  user.cart = user.cart.filter((item) => item.variant);
  await user.save();
}
console.info(`Migrated ${migrated} products and normalized ${users.length} carts.`);
await mongoose.disconnect();
