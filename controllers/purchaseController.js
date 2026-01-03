import mongoose from 'mongoose';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';

// @desc    Create new purchase
// @route   POST /api/purchases
// @access  Private/Admin
export const createPurchase = async (req, res) => {
    try {
        const {
            supplier,
            supplierInvoiceNumber,
            items, // Array of { product (ID or "NEW"), name, brand, category, sellingPrice, etc. }
            totalAmount,
            paidAmount,
            status,
            purchaseDate
        } = req.body;

        console.log("DEBUG: createPurchase called. (IMEI VALIDATION REMOVED)");

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No purchase items' });
        }

        const processedItems = [];

        // 1. Validation Logic: Handle New & Existing Products
        for (let item of items) {
            let product;

            // 1.1 Check if this is a NEW product or Existing
            const isNew = !item.product || item.product === 'NEW' || !mongoose.Types.ObjectId.isValid(item.product);

            if (isNew) {
                // Create the Product Master on the fly
                console.log(`Creating new Product Master for: ${item.name}`);

                // Validate required fields for new product
                if (!item.name || !item.brand || !item.sellingPrice) {
                    return res.status(400).json({
                        message: `New product '${item.name || 'unnamed'}' requires Brand and Selling Price.`
                    });
                }

                const trackIMEI = ['Mobile Phones', 'Tablets'].includes(item.category);

                product = await Product.create({
                    name: item.name.trim(),
                    brand: item.brand.trim(),
                    category: item.category || 'Others',
                    sellingPrice: Math.max(0, Number(item.sellingPrice) || 0),
                    purchasePrice: Math.max(0, Number(item.purchasePrice) || 0),
                    trackIMEI: trackIMEI,
                    simType: item.simType || 'None',
                    gstPercent: Math.max(0, Math.min(100, Number(item.gstPercent) || 18)),
                    supplier: supplier,
                    description: (item.description || '').trim(),
                    images: Array.isArray(item.images) ? item.images : [],
                    warrantyPeriod: (item.warrantyPeriod || '').trim(),
                    lowStockThreshold: Math.max(0, Number(item.lowStockThreshold) || 2)
                });

                // Replace the marker with the real ID
                item.product = product._id;
            } else {
                product = await Product.findById(item.product);
                if (!product) {
                    return res.status(404).json({ message: `Product not found: ${item.product}` });
                }
            }

            processedItems.push(item);
        }

        // 2. Generate Purchase Number
        const count = await Purchase.countDocuments();
        const purchaseNumber = `PUR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${(count + 1).toString().padStart(3, '0')}`;

        // Validate purchase data
        const validatedTotalAmount = Math.max(0, Number(totalAmount) || 0);
        const validatedPaidAmount = Math.max(0, Math.min(validatedTotalAmount, Number(paidAmount) || 0));
        const validatedStatus = ['Paid', 'Partial', 'Pending'].includes(status) ? status : 'Pending';

        const purchase = new Purchase({
            purchaseNumber,
            supplier,
            supplierInvoiceNumber: String(supplierInvoiceNumber || '').trim(),
            items: processedItems,
            totalAmount: validatedTotalAmount,
            paidAmount: validatedPaidAmount,
            status: validatedStatus,
            purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date()
        });

        const createdPurchase = await purchase.save();

        // 3. Update Product Inventory & Master Details
        for (const item of processedItems) {
            const updatePayload = {
                $inc: { stockQuantity: Number(item.quantity) },
                $set: {
                    purchasePrice: item.purchasePrice,
                    // Sync metadata to master if provided (e.g. updating description/images on restock)
                    description: item.description,
                    images: item.images && item.images.length > 0 ? item.images : undefined,
                    warrantyPeriod: item.warrantyPeriod
                }
            };

            // Remove undefined fields to avoid overwriting with null
            Object.keys(updatePayload.$set).forEach(key => {
                if (updatePayload.$set[key] === undefined) delete updatePayload.$set[key];
            });

            if (item.imeis && item.imeis.length > 0) {
                updatePayload.$push = { imei: { $each: item.imeis } };
            }

            await Product.findByIdAndUpdate(item.product, updatePayload);
        }

        res.status(201).json(createdPurchase);
    } catch (err) {
        console.error("Error in createPurchase:", err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all purchases
// @route   GET /api/purchases
// @access  Private
export const getPurchases = async (req, res) => {
    try {
        const purchases = await Purchase.find({})
            .populate('supplier', 'name mobile')
            .sort({ createdAt: -1 });
        res.json(purchases);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
