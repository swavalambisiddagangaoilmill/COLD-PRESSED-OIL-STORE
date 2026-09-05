import mongoose from "mongoose";
import { DEFAULT_NAVBAR_CONFIG } from "../../shared/navbarConfig.js";
import SiteContent from "../models/SiteContent.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";

const safeText = (value, label, max = 60) => { const text = String(value || "").trim(); if (!text || text.length > max) throw new ApiError(`${label} is required and must be ${max} characters or fewer.`, 400); return text; };
const safeKey = (value) => { const key = String(value || "").trim(); if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(key)) throw new ApiError("Navigation keys must contain only lowercase letters, numbers, and hyphens.", 400); return key; };
const safeHref = (value) => { const href = String(value || "").trim(); if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || /[\u0000-\u001f]/.test(href) || href.length > 300) throw new ApiError("Navigation links must be safe internal paths.", 400); return href; };

export async function validateNavbarConfig(payload) {
  if (!Array.isArray(payload?.items) || !payload.items.length || payload.items.length > 20) throw new ApiError("Navigation must contain between 1 and 20 top-level items.", 400);
  const keys = new Set(); const references = [];
  const items = payload.items.map((item, index) => {
    const key = safeKey(item.key); if (keys.has(key)) throw new ApiError("Navigation keys must be unique.", 400); keys.add(key);
    if (!Array.isArray(item.children) || item.children.length > 30) throw new ApiError("Each navigation section may contain up to 30 items.", 400);
    const childKeys = new Set();
    const children = item.children.map((child, childIndex) => {
      const childKey = safeKey(child.key); if (childKeys.has(childKey)) throw new ApiError("Child navigation keys must be unique within their section.", 400); childKeys.add(childKey);
      const type = ["LINK", "PRODUCT", "CATEGORY"].includes(child.type) ? child.type : "LINK";
      const referenceId = child.referenceId ? String(child.referenceId) : undefined;
      if (referenceId && !mongoose.isValidObjectId(referenceId)) throw new ApiError("Navigation reference ID is invalid.", 400);
      if (referenceId && type !== "LINK") references.push({ type, id: referenceId });
      return { key: childKey, label: safeText(child.label, "Navigation item label"), type, ...(referenceId ? { referenceId } : {}), href: safeHref(child.href), active: child.active !== false, order: childIndex + 1 };
    });
    return { key, label: safeText(item.label, "Navigation section label"), active: item.active !== false, order: index + 1, href: safeHref(item.href), dropdownEnabled: Boolean(item.dropdownEnabled), children };
  });
  const productIds = references.filter((item) => item.type === "PRODUCT").map((item) => item.id); const categoryIds = references.filter((item) => item.type === "CATEGORY").map((item) => item.id);
  const [products, categories] = await Promise.all([Product.countDocuments({ _id: { $in: productIds } }), Category.countDocuments({ _id: { $in: categoryIds } })]);
  if (products !== new Set(productIds).size || categories !== new Set(categoryIds).size) throw new ApiError("One or more navigation references do not exist.", 400);
  return { items };
}

export async function getNavbarConfig() { const content = await SiteContent.findOne({ key: "navbar" }).lean(); return content?.value?.items ? content.value : DEFAULT_NAVBAR_CONFIG; }
export async function saveNavbarConfig(payload, adminId) { const value = await validateNavbarConfig(payload); const content = await SiteContent.findOneAndUpdate({ key: "navbar" }, { value, updatedBy: adminId }, { upsert: true, new: true, runValidators: true }); return content.value; }
