import express from 'express';
const router = express.Router();
import {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    searchProducts,
    bulkImportProducts
} from '../controllers/productController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';
import uploadCSV from '../middlewares/csvMiddleware.js';

router.route('/').get(protect, getProducts).post(protect, createProduct);
router.route('/bulk-import').post(protect, uploadCSV.single('file'), bulkImportProducts);
router.route('/search/:query').get(protect, searchProducts);
router.route('/:id').get(protect, getProductById).put(protect, updateProduct).delete(protect, admin, deleteProduct);

export default router;
