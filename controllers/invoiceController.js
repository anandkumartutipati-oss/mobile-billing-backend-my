import Invoice from '../models/Invoice.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import { getDiscountedPrice } from './offerController.js';

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Private
export const createInvoice = async (req, res) => {
    try {
        console.log("--- INVOICE CREATE (MERGED VERSION) ---");
        console.log("Creating invoice with body:", JSON.stringify(req.body, null, 2));

        const {
            items,
            discount = 0,
            discountType = 'Fixed', // 'Fixed' or 'Percentage'
            paymentMode,
            paymentMethod,
            paymentDetails,
            status,
            paidAmount = 0,
            mixedPayments = [], // [{ mode, amount }]
            emiDetails = {} // { rateOfInterest, tenureMonths, downPayment }
        } = req.body;

        // 1. Resolve Customer Fields
        let customerName = req.body.customerName;
        let customerMobile = req.body.customerMobile;

        if (req.body.customer) {
            customerName = customerName || req.body.customer.name;
            customerMobile = customerMobile || req.body.customer.mobile || req.body.customer.phone;
        }

        if (!customerName || !customerMobile) {
            console.error("SNAPSHOT ERROR: Missing name/mobile. Body:", req.body);
            return res.status(400).json({ message: 'Customer name and mobile/phone are required' });
        }

        console.log("SNAPSHOT DEBUG: customerName:", customerName, "customerMobile:", customerMobile);

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No invoice items' });
        }

        // 1. Find or Create Customer
        let customer = await Customer.findOne({ mobile: customerMobile });
        if (!customer) {
            customer = await Customer.create({
                name: customerName,
                mobile: customerMobile,
                address: req.body.customer?.address || ''
            });
        }

        // 2. Calculate Totals and Update Stock
        let grossTotal = 0;
        const processedItemsRaw = [];

        for (const item of items) {
            let product = null;
            if (item.product && item.product !== 'undefined' && item.product !== 'null') {
                product = await Product.findById(item.product);
            }

            let unitPrice, itemLineTotal, itemGstPercent;

            if (product) {
                // --- EXISTING PRODUCT LOGIC ---
                // --- EXISTING PRODUCT LOGIC ---
                // "sellingPrice" in DB is usually the MRP/Inclusive price
                let inputPrice = item.price !== undefined ? Number(item.price) : product.sellingPrice;
                let discountAmount = Number(item.discount || 0);

                // Enforce GST Rules based on Category
                let itemGstPercent = 18; // Default
                const categoryLower = (product.category || '').toLowerCase();

                if (categoryLower.includes('mobile') || categoryLower.includes('phone') || categoryLower.includes('smartphone')) {
                    itemGstPercent = 12; // Mandated 12% for mobile phones
                } else {
                    itemGstPercent = product.gstPercent || 18;
                }

                // Override attempt check: If user sends a different GST, we ignore it for Mobiles to remain compliant
                // For accessories, we trust the DB or fallback to 18

                // Validations
                const itemQuantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
                if (product.stockQuantity < itemQuantity) {
                    return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
                }

                // IMEI Validation
                const isMobileOrTablet = product.trackIMEI;
                if (isMobileOrTablet) {
                    const providedIMEIs = (item.imei || []).map(i => String(i).trim()).filter(Boolean);
                    const slotsPerUnit = (product.simType === 'Dual SIM') ? 2 : 1;
                    const expectedCount = itemQuantity * slotsPerUnit;

                    if (providedIMEIs.length !== expectedCount) {
                        return res.status(400).json({
                            message: `IMEI Mismatch: Expected ${expectedCount} IMEIs for ${product.name} (Qty: ${itemQuantity}, Type: ${product.simType}), got ${providedIMEIs.length}`
                        });
                    }

                    // Validate against stock? (Optional but recommended)
                    // const validStockIMEIs = (product.imei || []).map(i => String(i).trim());
                    // const invalidIMEIs = providedIMEIs.filter(i => !validStockIMEIs.includes(i));
                    // if (invalidIMEIs.length > 0) ...

                    item.imei = providedIMEIs;
                } else {
                    item.imei = []; // Clear IMEIs if not required
                }

                // --- COMPLIANT CALCULATION ---
                // 1. Transaction Value (Inclusive) = (Unit Price * Qty) - Discount
                // Note: The "price" sent from frontend is usually per unit. discount is often per unit or total?
                // Standard convention: inputPrice is per unit. discount sent here is likely per-item total or we treat manual discount carefully.
                // Let's assume item.discount is TOTAL discount for this line item (common in POS).

                const totalInclusivePrice = (inputPrice * itemQuantity) - discountAmount;
                const finalTransactionValue = Math.max(0, totalInclusivePrice);

                // 2. Taxable Value (Reverse Calculation)
                // Taxable = TransactionValue / (1 + GST%)
                const gstMultiplier = 1 + (itemGstPercent / 100);
                const taxableValue = finalTransactionValue / gstMultiplier;

                // 3. GST Amount
                const gstAmount = finalTransactionValue - taxableValue;

                // 4. Split
                const cgst = gstAmount / 2;
                const sgst = gstAmount / 2;

                itemLineTotal = finalTransactionValue; // This is what the customer pays (Total)

                processedItemsRaw.push({
                    product: product._id,
                    name: product.name,
                    category: product.category,
                    quantity: itemQuantity,
                    price: inputPrice, // Unit Price (Inclusive, before discount)
                    originalPrice: product.sellingPrice,
                    purchasePrice: product.purchasePrice,
                    imei: item.imei,
                    simType: product.simType,
                    gstPercent: itemGstPercent,
                    discount: discountAmount,
                    taxableValue: taxableValue, // NEW FIELD
                    cgst: cgst, // NEW FIELD
                    sgst: sgst, // NEW FIELD
                    gstAmount: gstAmount, // NEW FIELD
                    itemLineTotal
                });

                // Update Stock
                const updatePayload = { $inc: { stockQuantity: -itemQuantity } };
                if (product.trackIMEI) {
                    updatePayload.$pull = { imei: { $in: item.imei } };
                }
                await Product.findByIdAndUpdate(item.product, updatePayload);

            } else {
                // --- AD-HOC ITEM LOGIC ---
                // Apply strict 18% unless specified, but usually ad-hoc is for accessories/services
                unitPrice = Math.max(0, Number(item.price) || 0);
                let discountAmount = Number(item.discount || 0);
                itemGstPercent = item.gstPercent !== undefined ? Number(item.gstPercent) : 18;
                const itemQuantity = Math.max(1, Number(item.quantity) || 1);

                const totalInclusivePrice = (unitPrice * itemQuantity) - discountAmount;
                const finalTransactionValue = Math.max(0, totalInclusivePrice);

                const gstMultiplier = 1 + (itemGstPercent / 100);
                const taxableValue = finalTransactionValue / gstMultiplier;
                const gstAmount = finalTransactionValue - taxableValue;

                itemLineTotal = finalTransactionValue;

                processedItemsRaw.push({
                    product: null,
                    name: item.name,
                    category: item.category || 'Others',
                    quantity: itemQuantity,
                    price: unitPrice,
                    originalPrice: unitPrice,
                    purchasePrice: 0,
                    imei: [],
                    simType: 'None',
                    gstPercent: itemGstPercent,
                    discount: discountAmount,
                    taxableValue: taxableValue,
                    gstAmount: gstAmount,
                    cgst: gstAmount / 2,
                    sgst: gstAmount / 2,
                    itemLineTotal
                });
            }
            grossTotal += itemLineTotal;
        }

        // --- GLOBAL DISCOUNT HANDLING ---
        // If a global discount is applied on top of item discounts, we need to redistribute it?
        // Usually, POS allows either Item Discount OR Global Discount. 
        // If both, Global Discount reduces the Total Payable, which effectively reduces Taxable Value further.

        let globalDiscount = Math.max(0, Number(discount) || 0);
        if (discountType === 'Percentage') {
            globalDiscount = (grossTotal * globalDiscount) / 100;
        }

        // If global discount exists, we must recalculate everything proportionally
        // Because GST is levied on the FINAL Transaction Value.

        const grandTotal = Math.max(0, grossTotal - globalDiscount);

        const processedItems = processedItemsRaw.map(item => {
            if (globalDiscount > 0 && grossTotal > 0) {
                // Redistribute global discount
                const weight = item.itemLineTotal / grossTotal;
                const itemShareGlobalDiscount = globalDiscount * weight;

                // New effective total for this item
                const newTotal = item.itemLineTotal - itemShareGlobalDiscount;

                // Recalculate Tax
                const gstMultiplier = 1 + (item.gstPercent / 100);
                const newTaxable = newTotal / gstMultiplier;
                const newGst = newTotal - newTaxable;

                return {
                    ...item,
                    discount: item.discount + itemShareGlobalDiscount, // Total effective discount
                    total: Math.round(newTotal), // Item Final Total
                    taxableValue: newTaxable,
                    gstAmount: newGst,
                    cgst: newGst / 2,
                    sgst: newGst / 2
                };
            }
            return {
                ...item,
                total: Math.round(item.itemLineTotal)
            };
        });

        // Remap totals
        let subTotal = 0; // This should be Taxable Total usually, or Pre-Tax? 
        // In this system, subTotal usually meant "Total before global discount".
        // Let's align with invoice standards: SubTotal = Sum of Taxable Values? Or Sum of Item Totals?
        // To avoid frontend breakage, let's keep logic but ensure we pass detailed fields for the invoice.
        // Let's set subTotal = Sum of Taxable Values (True SubTotal)

        subTotal = processedItems.reduce((acc, curr) => acc + curr.taxableValue, 0);
        const gstTotal = processedItems.reduce((acc, curr) => acc + curr.gstAmount, 0);

        const roundedSubTotal = Math.round(subTotal);
        const roundedGstTotal = Math.round(gstTotal);
        const roundedDiscount = Math.round(globalDiscount);
        // grandTotal is already calculated

        // --- PAYMENT LOGIC ---
        const activePaymentMode = paymentMode || paymentMethod || 'Cash';
        let finalEmiDetails = null;

        if (activePaymentMode === 'EMI' || activePaymentMode === 'Mixed') {
            // Only process if emiDetails is provided (Mixed mode might not include EMI)
            if (emiDetails && (emiDetails.monthlyInstallment || emiDetails.rateOfInterest !== undefined)) {
                if (emiDetails.monthlyInstallment) {
                    finalEmiDetails = {
                        rateOfInterest: emiDetails.rateOfInterest,
                        tenureMonths: emiDetails.tenureMonths,
                        downPayment: emiDetails.downPayment,
                        monthlyInstallment: Math.round(emiDetails.monthlyInstallment),
                        totalPaid: emiDetails.totalPaid,
                        nextDueDate: emiDetails.nextDueDate || new Date(new Date().setMonth(new Date().getMonth() + 1)),
                        installments: emiDetails.installments || []
                    };
                } else {
                    const rateOfInterest = Math.max(0, Number(emiDetails.rateOfInterest) || 0);
                    const interest = (grandTotal * rateOfInterest / 100);
                    const totalWithInterest = grandTotal + interest;
                    const tenure = Math.max(1, Math.floor(Number(emiDetails.tenureMonths) || 1));
                    const downPayment = Math.max(0, Math.min(grandTotal, Number(emiDetails.downPayment) || 0));
                    const monthlyInstallment = tenure > 0 ? (totalWithInterest - downPayment) / tenure : 0;

                    const dueDate = new Date();
                    dueDate.setMonth(dueDate.getMonth() + 1); // First EMI due after 1 month

                    finalEmiDetails = {
                        rateOfInterest: rateOfInterest,
                        tenureMonths: tenure,
                        downPayment: downPayment,
                        monthlyInstallment: Math.round(monthlyInstallment),
                        totalPaid: downPayment, // Initial payment is the down payment
                        nextDueDate: dueDate,
                        installments: [{
                            amount: downPayment,
                            paymentMode: activePaymentMode,
                            paymentDate: new Date(),
                            note: 'Down Payment'
                        }]
                    };
                }
            }
        }

        if (activePaymentMode === 'Mixed') {
            const totalMixed = (mixedPayments || []).reduce((acc, curr) => {
                if (!curr) return acc;
                return acc + Math.max(0, Number(curr.amount || 0));
            }, 0);
            if (Math.abs(totalMixed - paidAmount) > 1 && paidAmount !== 0) { // Allow 1 rupee tolerance for rounding
                console.warn("Mixed payment sum doesn't match paidAmount provided", { totalMixed, paidAmount });
            }
        }

        // 3. Generate Unique Invoice Number (Daily Sequential)
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const datePrefix = `INV-${todayStr}`;

        // Find the last invoice created today to get the next sequence number
        const lastInvoiceToday = await Invoice.findOne({
            invoiceNumber: new RegExp(`^${datePrefix}`)
        }).sort({ invoiceNumber: -1 });

        let nextNum = 1;
        if (lastInvoiceToday) {
            const parts = lastInvoiceToday.invoiceNumber.split('-');
            const lastSeq = parseInt(parts[parts.length - 1]);
            if (!isNaN(lastSeq)) {
                nextNum = lastSeq + 1;
            }
        }

        const invoiceNumber = `${datePrefix}-${nextNum.toString().padStart(3, '0')}`;

        const invoice = new Invoice({
            invoiceNumber,
            customer: customer._id,
            customerName,
            customerMobile,
            items: processedItems,
            subTotal: roundedSubTotal,
            discount: roundedDiscount,
            discountDetails: { type: discountType, value: discount },
            gstTotal: roundedGstTotal,
            grandTotal: grandTotal,
            paymentMode: activePaymentMode,
            paymentDetails,
            mixedPayments: activePaymentMode === 'Mixed' ? mixedPayments : [],
            emiDetails: finalEmiDetails,
            status: finalEmiDetails ? 'EMI - Active' : (status || 'Paid'),
            createdBy: req.user._id
        });

        const createdInvoice = await invoice.save();
        console.log("Invoice created successfully:", createdInvoice.invoiceNumber, "Snapshots:", { name: createdInvoice.customerName, mobile: createdInvoice.customerMobile });

        // 4. Update Customer History
        customer.purchaseHistory.push(createdInvoice._id);

        // Ensure numeric values for balance calculation
        const gTotal = Number(grandTotal) || 0;
        const pAmount = Number(paidAmount) || 0;
        const downPay = Number(emiDetails?.downPayment) || 0;

        if (createdInvoice.status !== 'Paid' && !['EMI - Active', 'EMI - Completed'].includes(createdInvoice.status)) {
            customer.outstandingBalance = (Number(customer.outstandingBalance) || 0) + (gTotal - pAmount);
        } else if (createdInvoice.status === 'EMI - Active') {
            customer.outstandingBalance = (Number(customer.outstandingBalance) || 0) + (gTotal - downPay);
        }
        await customer.save();

        res.status(201).json(createdInvoice);
    } catch (err) {
        console.error("Error in createInvoice:", err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
export const getInvoices = async (req, res) => {
    try {
        const invoices = await Invoice.find({}).populate('customer', 'name mobile').sort({ createdAt: -1 });
        res.json(invoices);
    } catch (error) {
        console.error("Error fetching invoices:", error);
        res.status(500).json({ message: 'Error fetching invoices', error: error.message });
    }
};

// @desc    Get invoice by ID
// @route   GET /api/invoices/:id
// @access  Private
export const getInvoiceById = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer')
            .populate('createdBy', 'name');

        if (invoice) {
            res.json(invoice);
        } else {
            res.status(404).json({ message: 'Invoice not found' });
        }
    } catch (error) {
        console.error("Error fetching invoice:", error);
        res.status(500).json({ message: 'Error fetching invoice', error: error.message });
    }
};

// @desc    Get Dashboard Stats
// @route   GET /api/invoices/stats
// @access  Private
export const getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // Better Profit Calculation (Item by Item)
        // Exclude Cancelled invoices to match report logic
        const invoices = await Invoice.find({
            createdAt: { $gte: firstDayOfMonth },
            status: { $ne: 'Cancelled' }
        }).populate('customer');

        let todaySales = 0;
        let todayCount = 0;
        let todayProfit = 0;
        let monthSales = 0;
        let monthProfit = 0;

        const paymentModes = {
            Cash: 0,
            UPI: 0,
            Card: 0,
            EMI: 0
        };

        const salesBreakdown = [];
        const profitBreakdown = [];
        const monthProfitBreakdown = [];
        const discountBreakdown = [];
        let monthDiscount = 0;

        (invoices || []).forEach(inv => {
            if (!inv) return;

            const isToday = (inv.createdAt && new Date(inv.createdAt) >= today);

            // LOGGING START
            const items = inv.items || [];
            const grossSum = items.reduce((s, i) => s + (Number(i.total) || (Number(i.price || 0) * (Number(i.quantity) || 0))), 0);
            console.log(`[STATS DEBUG] Invoice ${inv.invoiceNumber}: GrandTotal=${inv.grandTotal}, CalculatedGross=${grossSum}, Discount=${inv.discount}`);
            // LOGGING END

            // Handle Customer Name (Populated or String)
            const customerName = inv.customer?.name || inv.customerName || 'Walk-in Customer';

            const currentGrandTotal = Math.max(0, Number(inv.grandTotal || 0));
            monthSales += currentGrandTotal;

            // Discount Calculation
            const discountVal = Math.max(0, Number(inv.discount || 0));
            monthDiscount += discountVal;

            if (discountVal > 0) {
                discountBreakdown.push({
                    invoiceNumber: inv.invoiceNumber,
                    customerName: customerName,
                    amount: currentGrandTotal,
                    discount: discountVal,
                    date: inv.createdAt
                });
            }

            // Population of sales breakdown for ALL invoices in the month
            salesBreakdown.push({
                invoiceNumber: inv.invoiceNumber,
                customerName: customerName,
                itemCount: (inv.items || []).length,
                amount: currentGrandTotal,
                date: inv.createdAt,
                isToday: isToday // Added flag to filter today vs month in frontend if needed
            });

            // Aggregate Payment Modes
            if (inv.paymentMode === 'Mixed') {
                (inv.mixedPayments || []).forEach(p => {
                    if (paymentModes[p.mode] !== undefined) {
                        paymentModes[p.mode] += Number(p.amount) || 0;
                    }
                });
                // If there's an EMI portion in a mixed payment
                if (inv.emiDetails) {
                    const downPayment = Number(inv.emiDetails.downPayment) || 0;
                    const totalPayable = currentGrandTotal; // For simplicity in pie chart, we use principal
                    const emiPortion = currentGrandTotal - downPayment;
                    paymentModes.EMI += Math.max(0, emiPortion);
                }
            } else if (inv.paymentMode === 'EMI') {
                const downPayment = Number(inv.emiDetails?.downPayment) || 0;
                paymentModes.Cash += downPayment; // Assuming downpayment is cash if not mixed
                paymentModes.EMI += Math.max(0, currentGrandTotal - downPayment);
            } else if (paymentModes[inv.paymentMode] !== undefined) {
                paymentModes[inv.paymentMode] += currentGrandTotal;
            }

            // Calculate Invoice Gross Total (Pre-discount, inclusive of tax stored in price if any)
            const invoiceGrossTotal = (inv.items || []).reduce((sum, item) => {
                const qty = Math.max(0, Number(item.quantity || 0));
                // Use total if available (it refers to price*qty in recent schema) or calc it
                const itemTotal = Number(item.total) || (Number(item.price || 0) * qty);
                return sum + itemTotal;
            }, 0);

            let invCost = 0;

            (inv.items || []).forEach(item => {
                if (item) {
                    const qty = Math.max(0, Number(item.quantity || 0));
                    const pPrice = Math.max(0, Number(item.purchasePrice || 0));
                    const cost = pPrice * qty;
                    invCost += cost;

                    // Unified Breakdown Logic: Calculate for ALL invoices to populate monthProfitBreakdown

                    // Simple Apportionment Logic:
                    // Item Net Revenue = (Item Gross / Invoice Gross) * Invoice Grand Total
                    const itemGross = Number(item.total) || (Number(item.price || 0) * qty);

                    let itemNetRevenue = itemGross;
                    if (invoiceGrossTotal > 1) { // Use > 1 to avoid small precision issues
                        // Force scaling to ensure sum of parts == grandTotal
                        itemNetRevenue = Math.round((itemGross / invoiceGrossTotal) * currentGrandTotal);
                    } else if (invoiceGrossTotal === 0 && currentGrandTotal > 0) {
                        // Fallback: if somehow gross is 0 but we have a grandTotal, 
                        // just use a proportional share of currentGrandTotal (though this shouldn't happen)
                        itemNetRevenue = currentGrandTotal / (inv.items?.length || 1);
                    }

                    // Simple Profit = Revenue - Cost
                    const itemProfit = itemNetRevenue - cost;

                    console.log(`  [ITEM DEBUG] ${item.name}: Qty=${qty}, Gross=${itemGross}, NetRev=${itemNetRevenue.toFixed(2)}, Cost=${cost}, Profit=${itemProfit.toFixed(2)}`);

                    const breakdownItem = {
                        name: item.name,
                        customerName: customerName, // Use resolved name
                        qty: qty,
                        revenue: itemNetRevenue,
                        profit: itemProfit,
                        date: inv.createdAt
                    };

                    monthProfitBreakdown.push(breakdownItem);

                    if (isToday) {
                        profitBreakdown.push(breakdownItem);
                    }
                }
            });

            // Invoice Level Profit (Simple Cash Basis)
            // Revenue (Grand Total) - Cost (Purchase Price total)
            const invProfit = currentGrandTotal - invCost;
            monthProfit += invProfit;

            if (isToday) {
                todaySales += currentGrandTotal;
                todayCount += 1;
                todayProfit += invProfit;
            }
        });

        // Stock Value & Category Counts
        const products = await Product.find({});
        let totalStockValue = 0;
        let lowStockAlerts = 0;
        const categoryCounts = {};

        (products || []).forEach(p => {
            if (!p) return;
            const purchasePrice = Math.max(0, Number(p.purchasePrice || 0));
            const stockQuantity = Math.max(0, Number(p.stockQuantity || 0));
            const lowStockThreshold = Math.max(0, Number(p.lowStockThreshold || 0));

            totalStockValue += (purchasePrice * stockQuantity);
            if (stockQuantity <= lowStockThreshold) {
                lowStockAlerts++;
            }

            // Categorization
            const cat = (p.category || 'Others').trim();
            const normalizedCat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();

            if (!categoryCounts[normalizedCat]) {
                categoryCounts[normalizedCat] = 0;
            }
            categoryCounts[normalizedCat] += stockQuantity;
        });

        res.json({
            todaySales,
            todayCount,
            todayProfit,
            monthSales,
            monthProfit,
            totalStockValue,
            lowStockAlerts,
            paymentModes,
            categoryCounts,
            salesBreakdown,
            profitBreakdown,
            monthProfitBreakdown,
            monthDiscount,
            discountBreakdown
        });
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ message: err.message });
    }
};

// @desc    Pay EMI installment
// @route   POST /api/invoices/:id/pay-emi
// @access  Private
export const payEmi = async (req, res) => {
    try {
        const { amount, paymentMode, note } = req.body;
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice || (!invoice.emiDetails)) {
            return res.status(404).json({ message: 'EMI details not found for this invoice' });
        }

        // Add installment
        invoice.emiDetails.installments.push({
            amount,
            paymentMode,
            note,
            paymentDate: new Date()
        });

        // Update totals
        invoice.emiDetails.totalPaid = Math.round(invoice.emiDetails.totalPaid + Number(amount));

        // Calculate new due date
        const nextDate = new Date(invoice.emiDetails.nextDueDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        invoice.emiDetails.nextDueDate = nextDate;

        // Check if fully paid (Total Interest + GrandTotal)
        const interest = (invoice.grandTotal * (invoice.emiDetails.rateOfInterest || 0) / 100);
        const totalPayable = invoice.grandTotal + interest;

        if (invoice.emiDetails.totalPaid >= totalPayable) {
            invoice.status = 'EMI - Completed';
        }

        const updatedInvoice = await invoice.save();

        // Update customer outstanding
        const customer = await Customer.findById(invoice.customer);
        if (customer) {
            const payAmount = Number(amount) || 0;
            customer.outstandingBalance = Math.max(0, (Number(customer.outstandingBalance) || 0) - payAmount);
            await customer.save();
        }

        res.json(updatedInvoice);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// @desc    Get all EMI active invoices
// @route   GET /api/invoices/emi-list
// @access  Private
export const getEmiInvoices = async (req, res) => {
    try {
        const invoices = await Invoice.find({ status: 'EMI - Active' })
            .populate('customer', 'name mobile address')
            .sort({ 'emiDetails.nextDueDate': 1 });

        // Format for a detailed table
        const formattedList = (invoices || []).map(inv => {
            if (!inv) return null;

            const grandTotal = Math.max(0, Number(inv.grandTotal || 0));
            const rateOfInterest = Math.max(0, Number(inv.emiDetails?.rateOfInterest || 0));
            const totalPaid = Math.max(0, Number(inv.emiDetails?.totalPaid || 0));

            const interest = (grandTotal * rateOfInterest / 100);
            const totalPayable = grandTotal + interest;
            const remaining = Math.max(0, totalPayable - totalPaid);

            // Accurate months paid count (excluding Down Payment note)
            const installments = inv.emiDetails?.installments || [];
            const paidMonths = installments.filter(inst => inst && inst.note !== 'Down Payment').length;

            return {
                id: inv._id,
                invoiceNo: inv.invoiceNumber || 'N/A',
                customer: inv.customer?.name || inv.customerName || 'N/A',
                mobile: inv.customer?.mobile || inv.customerMobile || 'N/A',
                product: (inv.items || []).map(i => i?.name || '').filter(Boolean).join(', ') || 'N/A',
                itemDetails: (inv.items || []).map(i => {
                    if (!i) return null;
                    return {
                        name: i.name || '',
                        qty: Math.max(0, Number(i.quantity || 0)),
                        billPrice: Math.max(0, Number(i.price || 0)),
                        mrp: Math.max(0, Number(i.originalPrice || 0))
                    };
                }).filter(Boolean),
                totalValue: Math.round(totalPayable),
                paid: totalPaid,
                remaining: Math.round(remaining),
                monthlyEMI: Math.max(0, Number(inv.emiDetails?.monthlyInstallment || 0)),
                nextDue: inv.emiDetails?.nextDueDate ? new Date(inv.emiDetails.nextDueDate).toISOString().split('T')[0] : 'N/A',
                monthsPaid: paidMonths,
                monthsRemaining: Math.max(0, (Math.max(0, Number(inv.emiDetails?.tenureMonths || 0)) - paidMonths)),
                emiProgress: `${paidMonths}/${Math.max(0, Number(inv.emiDetails?.tenureMonths || 0))}`
            };
        }).filter(Boolean);

        res.json(formattedList);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
