import express from 'express';
const router = express.Router();
import { getOffers, createOffer, updateOffer, deleteOffer } from '../controllers/offerController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.route('/').get(protect, getOffers).post(protect, admin, createOffer);
router.route('/:id').put(protect, admin, updateOffer).delete(protect, admin, deleteOffer);

export default router;
