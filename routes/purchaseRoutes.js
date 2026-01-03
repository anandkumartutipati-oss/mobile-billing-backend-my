import express from 'express';
const router = express.Router();
import {
    createPurchase,
    getPurchases
} from '../controllers/purchaseController.js';
import {
    createSecondHandPurchase,
    getSecondHandPurchases,
    getSecondHandCustomers,
    updateSecondHandStatus
} from '../controllers/secondHandController.js';
import { protect } from '../middlewares/authMiddleware.js';

router.route('/')
    .get(protect, getPurchases)
    .post(protect, createPurchase);

// Hidden Routes for Customer Buy-back (Second Hand)
router.route('/customer-buyback')
    .get(protect, getSecondHandPurchases)
    .post(protect, createSecondHandPurchase);

router.get('/customer-buyback/customers', protect, getSecondHandCustomers);

router.patch('/customer-buyback/:id/status', protect, updateSecondHandStatus);

export default router;
