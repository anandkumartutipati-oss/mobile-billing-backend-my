import Product from '../models/Product.js';
import csv from 'csv-parser';
import { Readable } from 'stream';

// @desc    Get all products
// @route   GET /api/products
// @access  Private
export const getProducts = async (req, res) => {
    try {
        const products = await Product.find({}).populate('supplier', 'name').sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
};

// @desc    Get product by ID
// @route   GET /api/products/:id
// @access  Private
export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('supplier', 'name');

        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: 'Error fetching product', error: error.message });
    }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private
export const createProduct = async (req, res) => {
    try {
        const {
            name, brand, category, imei, simType, trackIMEI, purchasePrice, sellingPrice,
            gstPercent, stockQuantity, lowStockThreshold, supplier,
            warrantyPeriod, purchaseDate, description, images
        } = req.body;

        const product = new Product({
            name, brand, category, imei, simType, trackIMEI, purchasePrice, sellingPrice,
            gstPercent, stockQuantity, lowStockThreshold, supplier,
            warrantyPeriod, purchaseDate, description, images: images || []
        });

        const createdProduct = await product.save();
        res.status(201).json(createdProduct);
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(400).json({ message: 'Error creating product', error: error.message });
    }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private
export const updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (product) {
            if (req.body.name !== undefined) product.name = req.body.name;
            if (req.body.brand !== undefined) product.brand = req.body.brand;
            if (req.body.category !== undefined) product.category = req.body.category;
            if (req.body.imei !== undefined) product.imei = req.body.imei;
            if (req.body.simType !== undefined) product.simType = req.body.simType;
            if (req.body.trackIMEI !== undefined) product.trackIMEI = req.body.trackIMEI;
            if (req.body.purchasePrice !== undefined) product.purchasePrice = req.body.purchasePrice;
            if (req.body.sellingPrice !== undefined) product.sellingPrice = req.body.sellingPrice;
            if (req.body.gstPercent !== undefined) product.gstPercent = req.body.gstPercent;
            if (req.body.stockQuantity !== undefined) product.stockQuantity = req.body.stockQuantity;
            if (req.body.lowStockThreshold !== undefined) product.lowStockThreshold = req.body.lowStockThreshold;
            if (req.body.supplier !== undefined) product.supplier = req.body.supplier;
            if (req.body.warrantyPeriod !== undefined) product.warrantyPeriod = req.body.warrantyPeriod;
            if (req.body.purchaseDate !== undefined) product.purchaseDate = req.body.purchaseDate;
            if (req.body.description !== undefined) product.description = req.body.description;
            if (req.body.images !== undefined) product.images = req.body.images;

            const updatedProduct = await product.save();
            res.json(updatedProduct);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(400).json({ message: 'Error updating product', error: error.message });
    }
};

// @desc    Bulk Import Products
// @route   POST /api/products/bulk-import
// @access  Private
export const bulkImportProducts = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const results = [];
    const stream = Readable.from(req.file.buffer.toString());

    stream
        .pipe(csv())
        .on('data', (data) => {
            // Process images from CSV (comma separated string)
            const images = data.images ? data.images.split(',').map(img => img.trim()) : [];
            const imei = data.imei ? data.imei.split(',').map(i => i.trim()) : [];

            results.push({
                name: data.name,
                brand: data.brand,
                category: data.category || 'Others',
                imei: [], // IMEI not imported in bulk
                simType: data.simType || (['Mobile Phones', 'Tablets'].includes(data.category) ? 'Dual SIM' : 'None'),
                trackIMEI: data.trackIMEI !== undefined ? data.trackIMEI === 'true' : ['Mobile Phones', 'Tablets'].includes(data.category),
                purchasePrice: Number(data.purchasePrice) || 0,
                sellingPrice: Number(data.sellingPrice) || 0,
                gstPercent: Number(data.gstPercent) || 18,
                stockQuantity: Number(data.stockQuantity) || 0,
                lowStockThreshold: Number(data.lowStockThreshold) || 2,
                description: data.description,
                images: images,
                warrantyPeriod: data.warrantyPeriod
            });
        })
        .on('end', async () => {
            try {
                const products = await Product.insertMany(results);
                res.json({ message: 'Products imported successfully', count: products.length });
            } catch (err) {
                console.error('Bulk Import Error:', err);
                res.status(400).json({ message: 'Error importing products', error: err.message });
            }
        });
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Owner
export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (product) {
            await product.deleteOne();
            res.json({ message: 'Product removed' });
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
};

// @desc    Search products by IMEI or Name
// @route   GET /api/products/search/:query
// @access  Private
export const searchProducts = async (req, res) => {
    try {
        const query = req.params.query;
        const products = await Product.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { brand: { $regex: query, $options: 'i' } },
                { imei: { $in: [query] } }
            ]
        });
        res.json(products);
    } catch (error) {
        console.error("Error searching products:", error);
        res.status(500).json({ message: 'Error searching products', error: error.message });
    }
};
