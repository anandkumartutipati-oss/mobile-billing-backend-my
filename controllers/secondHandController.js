import SecondHandPurchase from '../models/SecondHandPurchase.js';
import SecondHandCustomer from '../models/SecondHandCustomer.js';

// @desc    Create a second-hand purchase (Customer Buy-back)
// @route   POST /api/purchases/customer-buyback
// @access  Private
export const createSecondHandPurchase = async (req, res) => {
    try {
        const {
            name,
            brand,
            category,
            simType,
            imei,
            specifications,
            description,
            originalPrice,
            buyingPrice,
            sellerName,
            sellerPhone,
            sellerAddress,
            idProofPhoto,
            panCardPhoto,
            productPhoto
        } = req.body;

        // Validation
        if (!name || !imei || !Array.isArray(imei) || imei.length === 0 || !buyingPrice || !sellerName || !sellerPhone) {
            return res.status(400).json({
                message: 'Mandatory fields: Product Name, at least one IMEI, Buying Price, Seller Name, and Seller Phone'
            });
        }

        // 10-digit Phone Validation
        if (sellerPhone.length !== 10 || !/^\d+$/.test(sellerPhone)) {
            return res.status(400).json({ message: 'Seller phone number must be exactly 10 digits' });
        }

        // Check for existing IMEI (Prevent multiple buys of same phone)
        const imeiExists = await SecondHandPurchase.findOne({ imei: { $in: imei } });
        if (imeiExists) {
            return res.status(400).json({ message: `One or more IMEIs (${imei.join(', ')}) already exist in a second-hand purchase` });
        }

        // Clean & validate IMEIs
        const cleanedImeis = imei
            .map(i => String(i).replace(/\D/g, ''))
            .filter(i => i.length === 15);

        if (cleanedImeis.length === 0 && (category === 'Mobile' || category === 'Mobile Phones' || category === 'Tablet' || category === 'Tablets')) {
            return res.status(400).json({ message: "Invalid IMEI numbers. Mobile/Tablet requires 15-digit IMEIs." });
        }

        const validatedBuyingPrice = Math.max(0, Number(buyingPrice || 0));
        const cleanedSellerPhone = sellerPhone.trim();

        const buyback = new SecondHandPurchase({
            name: name.trim(),
            brand: brand ? brand.trim() : '',
            category: category === 'Mobile' ? 'Mobile Phones' : (category || 'Mobile Phones'),
            simType: simType || 'None',
            imei: cleanedImeis,
            specifications: specifications ? specifications.trim() : '',
            description: description ? description.trim() : '',
            originalPrice: Math.max(0, Number(originalPrice || 0)),
            buyingPrice: validatedBuyingPrice,
            sellerName: sellerName.trim(),
            sellerPhone: cleanedSellerPhone,
            sellerAddress: sellerAddress ? sellerAddress.trim() : '',
            idProofPhoto: idProofPhoto || '',
            panCardPhoto: panCardPhoto || '',
            productPhoto: productPhoto || '',
            purchasedBy: req.user._id
        });

        const createdBuyback = await buyback.save();
        res.status(201).json(createdBuyback);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all second-hand purchases
// @route   GET /api/purchases/customer-buyback
// @access  Private
export const getSecondHandPurchases = async (req, res) => {
    try {
        const purchases = await SecondHandPurchase.find({})
            .populate('purchasedBy', 'name')
            .sort({ createdAt: -1 });
        res.json(purchases);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Update second-hand purchase status
// @route   PATCH /api/purchases/customer-buyback/:id/status
// @access  Private
export const updateSecondHandStatus = async (req, res) => {
    try {
        const { status, soldTo } = req.body;
        // Validate internal enum
        if (!['In Stock', 'Sold', 'Under Repair'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be In Stock, Sold, or Under Repair' });
        }

        // Fetch purchase first to get details for customer history
        const purchase = await SecondHandPurchase.findById(req.params.id);
        if (!purchase) {
            return res.status(404).json({ message: 'Purchase record not found' });
        }

        const updateData = { status };
        if (status === 'Sold' && soldTo) {
            // Validate soldTo data
            const { customerName, customerPhone, salePrice, saleDate } = soldTo;

            if (!customerName || !customerName.trim()) {
                return res.status(400).json({ message: 'Customer name is required when marking as sold' });
            }

            if (!customerPhone || !/^\d{10}$/.test(customerPhone.trim())) {
                return res.status(400).json({ message: 'Valid 10-digit customer phone is required when marking as sold' });
            }

            const validatedSalePrice = Math.max(0, Number(salePrice || 0));
            if (validatedSalePrice <= 0) {
                return res.status(400).json({ message: 'Sale price must be greater than 0' });
            }

            updateData.soldTo = {
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                salePrice: validatedSalePrice,
                saleDate: saleDate ? new Date(saleDate) : new Date()
            };

            // Sync with SecondHandCustomer Collection
            if (customerName && customerPhone) {
                let customer = await SecondHandCustomer.findOne({ mobile: customerPhone.trim() });

                if (customer) {
                    // Update existing customer
                    customer.purchaseHistory.push({
                        purchaseId: req.params.id,
                        productName: purchase.name || '',
                        salePrice: validatedSalePrice,
                        purchaseDate: new Date()
                    });
                    customer.totalSpent = (Number(customer.totalSpent) || 0) + validatedSalePrice;
                    // Update name/address if provided (optional, prioritizing latest)
                    customer.name = customerName.trim();
                    await customer.save();
                } else {
                    // Create new customer
                    await SecondHandCustomer.create({
                        name: customerName.trim(),
                        mobile: customerPhone.trim(),
                        purchaseHistory: [{
                            purchaseId: req.params.id,
                            productName: purchase.name || '',
                            salePrice: salePrice,
                            purchaseDate: new Date()
                        }],
                        totalSpent: Number(salePrice)
                    });
                }
            }
        }

        const updatedPurchase = await SecondHandPurchase.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        res.json(updatedPurchase);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all second-hand customers
// @route   GET /api/purchases/customer-buyback/customers
// @access  Private
export const getSecondHandCustomers = async (req, res) => {
    try {
        const customers = await SecondHandCustomer.find({}).sort({ updatedAt: -1 });
        res.json(customers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
