import express from "express";
const router = express.Router();
import {
  getShopSettings,
  updateShopSettings,
} from "../controllers/shopController.js";
import { protect, admin } from "../middlewares/authMiddleware.js";

router.get("/", getShopSettings);
router.put("/", protect, updateShopSettings); // Restricted to admin/owner ideally? Using protect for now, logic in UI checks role.

export default router;
