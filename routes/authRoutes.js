import express from 'express';
const router = express.Router();
import { loginUser, registerUser, getUserProfile, updateShopSettings } from '../controllers/authController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.post('/login', loginUser);
router.post('/register', registerUser);
router.route('/profile').get(protect, getUserProfile);
router.route('/settings').put(protect, admin, updateShopSettings);

export default router;
