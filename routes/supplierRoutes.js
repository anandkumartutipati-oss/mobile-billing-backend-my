import express from 'express';
const router = express.Router();
import { getSuppliers, createSupplier, updateSupplier } from '../controllers/supplierController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.route('/').get(protect, getSuppliers).post(protect, admin, createSupplier);
router.route('/:id').put(protect, admin, updateSupplier);

export default router;
