// Wishlist business logic.
import Product from "../models/Product.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

export async function getWishlist(userId) {
  const user = await User.findById(userId).select("wishlist").lean();
  if (!user) throw new ApiError("User not found.", 404);
  const products = await Product.find({ _id: { $in: user.wishlist }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const wishlist = user.wishlist.filter((productId) => productMap.has(productId.toString()));
  if (wishlist.length !== user.wishlist.length) await User.updateOne({ _id: userId }, { wishlist });
  return wishlist.map((productId) => productMap.get(productId.toString()));
}

export async function addToWishlist(userId, productId) {
  const exists = await Product.exists({ _id: productId, isActive: true });
  if (!exists) throw new ApiError("Product not found.", 404);
  const user = await User.findByIdAndUpdate(userId, { $addToSet: { wishlist: productId } }, { new: true }).populate("wishlist");
  if (!user) throw new ApiError("User not found.", 404);
  return getWishlist(userId);
}

export async function removeFromWishlist(userId, productId) {
  const user = await User.findByIdAndUpdate(userId, { $pull: { wishlist: productId } }, { new: true }).populate("wishlist");
  if (!user) throw new ApiError("User not found.", 404);
  return getWishlist(userId);
}
