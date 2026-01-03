import Offer from '../models/Offer.js';

// @desc    Get all offers
// @route   GET /api/offers
// @access  Private
export const getOffers = async (req, res) => {
    try {
        const offers = await Offer.find({});
        res.json(offers);
    } catch (error) {
        console.error("Error fetching offers:", error);
        res.status(500).json({ message: 'Error fetching offers', error: error.message });
    }
};

// @desc    Create an offer
// @route   POST /api/offers
// @access  Private/Owner
export const createOffer = async (req, res) => {
    try {
        const { name, description, offerType, targetId, discountType, discountValue, startDate, endDate, isActive, minQuantity } = req.body;

        // Validation
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Offer name is required' });
        }

        if (!['Product', 'Category', 'All'].includes(offerType)) {
            return res.status(400).json({ message: 'Invalid offer type' });
        }

        if (offerType !== 'All' && !targetId) {
            return res.status(400).json({ message: 'Target ID is required for Product and Category offers' });
        }

        if (!['Percentage', 'Fixed'].includes(discountType)) {
            return res.status(400).json({ message: 'Invalid discount type' });
        }

        const validatedDiscountValue = Math.max(0, Number(discountValue) || 0);
        if (validatedDiscountValue <= 0) {
            return res.status(400).json({ message: 'Discount value must be greater than 0' });
        }

        if (discountType === 'Percentage' && validatedDiscountValue > 100) {
            return res.status(400).json({ message: 'Percentage discount cannot exceed 100%' });
        }

        const validatedMinQuantity = Math.max(1, Math.floor(Number(minQuantity) || 1));

        // Date validation
        const validatedStartDate = startDate ? new Date(startDate) : new Date();
        const validatedEndDate = endDate ? new Date(endDate) : null;

        if (validatedEndDate && validatedEndDate < validatedStartDate) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }

        const offer = new Offer({
            name: name.trim(),
            description: description ? description.trim() : '',
            offerType,
            targetId: offerType === 'All' ? 'ALL' : targetId,
            discountType,
            discountValue: validatedDiscountValue,
            startDate: validatedStartDate,
            endDate: validatedEndDate,
            isActive: isActive !== undefined ? Boolean(isActive) : true,
            minQuantity: validatedMinQuantity
        });

        const createdOffer = await offer.save();
        res.status(201).json(createdOffer);
    } catch (error) {
        console.error("Error creating offer:", error);
        res.status(400).json({ message: 'Error creating offer', error: error.message });
    }
};

// @desc    Apply offers to current items (Internal utility)
export const getDiscountedPrice = async (product, originalPrice, quantity = 1) => {
    if (!product || !originalPrice || originalPrice <= 0) {
        return { price: originalPrice || 0, discount: 0 };
    }

    const now = new Date();
    const quantityNum = Math.max(1, Number(quantity) || 1);
    const priceNum = Math.max(0, Number(originalPrice) || 0);

    // Date range check helper
    const isOfferActive = (offer) => {
        if (!offer.isActive) return false;
        if (offer.startDate && new Date(offer.startDate) > now) return false;
        if (offer.endDate && new Date(offer.endDate) < now) return false;
        return true;
    };

    // 1. Check for Product Specific Offer (taking highest minQuantity that applies)
    let offers = await Offer.find({
        isActive: true,
        offerType: 'Product',
        targetId: String(product._id),
        minQuantity: { $lte: quantityNum },
        $or: [
            { startDate: { $exists: false } },
            { startDate: { $lte: now } }
        ],
        $and: [
            {
                $or: [
                    { endDate: { $exists: false } },
                    { endDate: { $gte: now } }
                ]
            }
        ]
    }).sort({ minQuantity: -1 });

    let offer = offers.find(o => isOfferActive(o)) || null;

    // 2. Check for Category Specific Offer
    if (!offer && product.category) {
        offers = await Offer.find({
            isActive: true,
            offerType: 'Category',
            targetId: product.category,
            minQuantity: { $lte: quantityNum },
            $or: [
                { startDate: { $exists: false } },
                { startDate: { $lte: now } }
            ],
            $and: [
                {
                    $or: [
                        { endDate: { $exists: false } },
                        { endDate: { $gte: now } }
                    ]
                }
            ]
        }).sort({ minQuantity: -1 });

        offer = offers.find(o => isOfferActive(o)) || null;
    }

    // 3. Check for Global Offer
    if (!offer) {
        offers = await Offer.find({
            isActive: true,
            offerType: 'All',
            minQuantity: { $lte: quantityNum },
            $or: [
                { startDate: { $exists: false } },
                { startDate: { $lte: now } }
            ],
            $and: [
                {
                    $or: [
                        { endDate: { $exists: false } },
                        { endDate: { $gte: now } }
                    ]
                }
            ]
        }).sort({ minQuantity: -1 });

        offer = offers.find(o => isOfferActive(o)) || null;
    }

    if (!offer) return { price: priceNum, discount: 0 };

    let discount = 0;
    const discountValue = Math.max(0, Number(offer.discountValue) || 0);
    
    if (offer.discountType === 'Percentage') {
        discount = Math.min(priceNum, (priceNum * discountValue) / 100);
    } else {
        discount = Math.min(priceNum, discountValue);
    }

    return {
        price: Math.max(0, priceNum - discount),
        discount,
        offerName: offer.name
    };
};

// @desc    Update an offer
// @route   PUT /api/offers/:id
// @access  Private/Owner
export const updateOffer = async (req, res) => {
    try {
        const { name, description, offerType, targetId, discountType, discountValue, startDate, endDate, isActive, minQuantity } = req.body;
        const offer = await Offer.findById(req.params.id);

        if (offer) {
            offer.name = name || offer.name;
            offer.description = description !== undefined ? description : offer.description;
            offer.offerType = offerType || offer.offerType;
            offer.targetId = targetId || offer.targetId;
            offer.discountType = discountType || offer.discountType;
            offer.discountValue = discountValue !== undefined ? discountValue : offer.discountValue;
            offer.minQuantity = minQuantity !== undefined ? minQuantity : offer.minQuantity;
            offer.startDate = startDate || offer.startDate;
            offer.endDate = endDate !== undefined ? endDate : offer.endDate;
            offer.isActive = isActive !== undefined ? isActive : offer.isActive;

            const updatedOffer = await offer.save();
            res.json(updatedOffer);
        } else {
            res.status(404).json({ message: 'Offer not found' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Delete an offer
// @route   DELETE /api/offers/:id
// @access  Private/Owner
export const deleteOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (offer) {
            await offer.deleteOne();
            res.json({ message: 'Offer removed' });
        } else {
            res.status(404).json({ message: 'Offer not found' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
