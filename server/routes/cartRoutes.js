// Cart route registration.
import { Router } from "express";
import { addCartItemHandler, clearCartHandler, getCartHandler, removeCartItemHandler, syncCartHandler, updateCartItemHandler } from "../controllers/cartController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { cartItemValidator, cartParamValidator, cartQuantityValidator, cartSyncValidator, cartVariantQueryValidator } from "../validators/cartValidators.js";

const router = Router();

router.get("/", protect, getCartHandler);
router.put("/sync", protect, cartSyncValidator, validate, syncCartHandler);
router.post("/items", protect, cartItemValidator, validate, addCartItemHandler);
router.put("/items/:productId", protect, cartParamValidator, cartVariantQueryValidator, cartQuantityValidator, validate, updateCartItemHandler);
router.delete("/items/:productId", protect, cartParamValidator, cartVariantQueryValidator, validate, removeCartItemHandler);
router.delete("/", protect, clearCartHandler);

export default router;
