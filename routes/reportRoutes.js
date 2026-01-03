import express from 'express';
const router = express.Router();
import { getSalesReport, getStockReport, getGSTReport, getProfitBreakdown, getSalesChartData, getWeeklySalesData } from '../controllers/reportController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.get('/sales', protect, getSalesReport);
router.get('/stock', protect, getStockReport);
router.get('/gst', protect, getGSTReport);
router.get('/profit-breakdown', protect, getProfitBreakdown);
router.get('/chart-data', protect, getSalesChartData);
router.get('/weekly-sales', protect, getWeeklySalesData);

export default router;