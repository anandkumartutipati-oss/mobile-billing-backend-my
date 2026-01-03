import express from 'express';
const router = express.Router();
import {
    createInvoice,
    getInvoices,
    getInvoiceById,
    getDashboardStats,
    payEmi,
    getEmiInvoices
} from '../controllers/invoiceController.js';
import { protect } from '../middlewares/authMiddleware.js';

router.route('/').get(protect, getInvoices).post(protect, createInvoice);
router.route('/stats').get(protect, getDashboardStats);
router.route('/emi-list').get(protect, getEmiInvoices);
router.route('/:id').get(protect, getInvoiceById);
router.route('/:id/pay-emi').post(protect, payEmi);

export default router;
