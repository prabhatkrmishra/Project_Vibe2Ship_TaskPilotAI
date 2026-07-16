import {Request, Response} from "express";
import * as crypto from "crypto";
import {connectDB} from "../db/mongodb.ts";
import {sendInternalError, sendNotFound, sendBadRequest} from "../lib/controllerUtils.ts";
import {
    findUserById,
    findUserByIdSelect,
    updateUserById,
    findUserWithSubscriptions,
    findOneAndUpdateUser,
    updateOneUser
} from "../repositories/userRepository.ts";
import {
    findEnabledPlanById,
    findAllEnabledPlans,
    countPricingConfigs,
    insertManyPricingConfigs
} from "../repositories/pricingRepository.ts";

const DEFAULT_PRICING: any[] = [
    {
        planId: "monthly",
        name: "Monthly Premium",
        description: "Access to all premium features for one month",
        basePrice: 199,
        interval: 'month' as const,
        features: [
            "Unlimited AI-powered scheduling",
            "Advanced analytics & insights",
            "Focus Zone power modes unlocked",
            "Priority email support",
            "20+ customization themes"
        ],
        popular: false
    },
    {
        planId: "annual",
        name: "Annual Premium",
        description: "Save 20% with annual billing",
        basePrice: 1999,
        interval: 'year' as const,
        features: [
            "All Monthly Premium features",
            "20% savings vs monthly",
            "Early access to new features",
            "Premium badge & customization",
            "No ads, ever"
        ],
        popular: true
    }
];

let pricingSeeded = false;

export async function ensurePricingSeeded() {
    if (pricingSeeded) return;
    try {
        await connectDB();
        const count = await countPricingConfigs();
        if (count === 0) {
            await insertManyPricingConfigs(DEFAULT_PRICING);
            console.log("Default pricing seeded");
        }
        pricingSeeded = true;
    } catch (err) {
        // DB not available yet — skip seeding
    }
}

async function getPricing(planId?: string) {
    await ensurePricingSeeded();
    await connectDB();
    if (planId) {
        return await findEnabledPlanById(planId);
    }
    return await findAllEnabledPlans();
}

async function getEffectivePrice(planId: string): Promise<{ price: number; name: string }> {
    const plan = await getPricing(planId);
    if (!plan) {
        const fallback = DEFAULT_PRICING.find((p) => p.planId === planId);
        return {price: fallback?.basePrice || 0, name: fallback?.name || planId};
    }
    const effectivePrice = plan.saleActive && plan.salePrice ? plan.salePrice : plan.basePrice;
    return {price: effectivePrice, name: plan.name};
}

function generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export const createOrder = async (req: any, res: Response) => {
    try {
        const {plan} = req.body;
        if (!plan || !["monthly", "annual"].includes(plan)) {
            return res.status(400).json({error: "Invalid plan. Use 'monthly' or 'annual'."});
        }

        await connectDB();
        const user = await findUserById(req.uid);
        if (!user) return res.status(404).json({error: "User not found"});
        if (!user.emailVerified) return res.status(403).json({error: "Please verify your email address before subscribing."});

        const razorPayKey = process.env.RAZORPAY_KEY_ID;
        const razorPaySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!razorPayKey || !razorPaySecret) {
            console.error("Razorpay credentials not configured");
            return res.status(500).json({error: "Payment gateway not configured"});
        }

        const {price: effectivePrice, name: planName} = await getEffectivePrice(plan);
        if (effectivePrice <= 0) {
            return res.status(400).json({error: "Plan is not available for purchase"});
        }
        const amountInPaise = Math.round(effectivePrice * 100);
        if (amountInPaise < 100) {
            return res.status(400).json({error: "Plan price is below the minimum payable amount."});
        }
        const transactionId = generateTransactionId();

        const orderData = {
            amount: amountInPaise,
            currency: "INR",
            receipt: transactionId,
            notes: {
                userId: user._id.toString(),
                plan: plan,
            },
        };

        const response = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
                Authorization:
                    "Basic " +
                    Buffer.from(`${razorPayKey}:${razorPaySecret}`).toString("base64"),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(orderData),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            let err: any = {};
            try {
                err = JSON.parse(text);
            } catch {
            }
            console.error(
                "Razorpay order creation failed:",
                response.status,
                text
            );
            throw new Error(
                err?.error?.description ||
                `Failed to create order (Razorpay returned HTTP ${response.status})`
            );
        }

        const order = await response.json();

        if (!user.subscriptions) user.subscriptions = [];
        user.subscriptions.push({
            plan,
            amount: effectivePrice,
            currency: "INR",
            orderId: order.id,
            transactionId,
            status: "pending",
            startedAt: new Date(),
        });
        await user.save();

        res.json({
            orderId: order.id,
            amount: orderData.amount,
            currency: "INR",
            keyId: razorPayKey,
            plan: planName,
            transactionId,
        });
    } catch (error: any) {
        console.error("Create subscription order error:", error);
        sendInternalError(res, error);
    }
};

export const createPaymentLink = async (req: any, res: Response) => {
    try {
        const {plan} = req.body;
        if (!plan || !["monthly", "annual"].includes(plan)) {
            return res.status(400).json({error: "Invalid plan. Use 'monthly' or 'annual'."});
        }

        await connectDB();
        const user = await findUserById(req.uid);
        if (!user) return res.status(404).json({error: "User not found"});
        if (!user.emailVerified) return res.status(403).json({error: "Please verify your email address before subscribing."});

        const razorPayKey = process.env.RAZORPAY_KEY_ID;
        const razorPaySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!razorPayKey || !razorPaySecret) {
            return res.status(500).json({error: "Payment gateway not configured"});
        }

        const {price: effectivePrice, name: planName} = await getEffectivePrice(plan);
        if (effectivePrice <= 0) {
            return res.status(400).json({error: "Plan is not available for purchase"});
        }
        const amountInPaise = Math.round(effectivePrice * 100);
        if (amountInPaise < 100) {
            return res.status(400).json({error: "Plan price is below the minimum payable amount."});
        }
        const transactionId = generateTransactionId();

        const plResponse = await fetch("https://api.razorpay.com/v1/payment_links", {
            method: "POST",
            headers: {
                Authorization:
                    "Basic " +
                    Buffer.from(`${razorPayKey}:${razorPaySecret}`).toString("base64"),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: "INR",
                description: `${planName} - TaskPilot AI Premium`,
                notes: {
                    userId: user._id.toString(),
                    plan,
                    transactionId,
                },
                callback_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/payment-success`,
                callback_method: "get",
            }),
        });

        if (!plResponse.ok) {
            const text = await plResponse.text().catch(() => "");
            let err: any = {};
            try {
                err = JSON.parse(text);
            } catch {
            }
            console.error(
                "Razorpay payment link creation failed:",
                plResponse.status,
                text
            );
            throw new Error(
                err?.error?.description ||
                `Failed to create payment link (Razorpay returned HTTP ${plResponse.status})`
            );
        }

        const paymentLink = await plResponse.json();

        if (!user.subscriptions) user.subscriptions = [];
        user.subscriptions.push({
            plan,
            amount: effectivePrice,
            currency: "INR",
            orderId: paymentLink.order_id,
            paymentLinkId: paymentLink.id,
            transactionId,
            status: "pending",
            startedAt: new Date(),
        });
        await user.save();

        res.json({
            paymentLinkId: paymentLink.id,
            shortUrl: paymentLink.short_url,
            paymentLink: paymentLink.short_url,
        });
    } catch (error: any) {
        console.error("Create payment link error:", error);
        sendInternalError(res, error);
    }
};

export const verifyPayment = async (req: any, res: Response) => {
    try {
        const {orderId, paymentId, signature} = req.body;

        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({error: "Missing required fields"});
        }

        const razorPayKey = process.env.RAZORPAY_KEY_ID;
        const razorPaySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!razorPayKey || !razorPaySecret) {
            return res.status(500).json({error: "Payment gateway not configured"});
        }

        const payload = orderId + "|" + paymentId;
        const expectedSignature = crypto
            .createHmac("sha256", razorPaySecret)
            .update(payload)
            .digest("hex");

        let sigBuf: Buffer, expectedBuf: Buffer;
        try {
            sigBuf = Buffer.from(signature, "hex");
            expectedBuf = Buffer.from(expectedSignature, "hex");
        } catch {
            return res.status(400).json({error: "Invalid signature"});
        }
        if (
            sigBuf.length !== expectedBuf.length ||
            !crypto.timingSafeEqual(sigBuf, expectedBuf)
        ) {
            return res.status(400).json({error: "Invalid signature"});
        }

        await connectDB();

        const user = await findUserWithSubscriptions({
            _id: req.uid,
            "subscriptions.orderId": orderId,
        });
        if (!user) {
            return res.status(404).json({
                error:
                    "No matching order found for this user. Please start checkout again.",
            });
        }

        const orderRecord = (user.subscriptions || []).find(
            (s: any) => s.orderId === orderId
        );
        if (!orderRecord) {
            return res.status(404).json({error: "Order record not found."});
        }

        if (orderRecord.status === "active" || orderRecord.paymentId) {
            return res.json({
                success: true,
                isPremium: true,
                premiumExpiry: user.premiumExpiry,
                message: "Subscription already active.",
            });
        }

        const plan = orderRecord.plan;
        const amount = orderRecord.amount;

        const now = new Date();
        const expiryDate = new Date(
            now.getTime() + (plan === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000
        );

        const updateResult = await findOneAndUpdateUser(
            {
                _id: user._id,
                subscriptions: {
                    $elemMatch: {orderId, status: {$ne: "active"}},
                },
            },
            {
                $set: {
                    isPremium: true,
                    premiumExpiry: expiryDate,
                    subscriptionId: paymentId,
                    subscriptionPlan: plan,
                    subscriptionActive: true,
                    "subscriptions.$[elem].status": "active",
                    "subscriptions.$[elem].paymentId": paymentId,
                    "subscriptions.$[elem].amount": amount,
                    "subscriptions.$[elem].expiry": expiryDate,
                },
            },
            {arrayFilters: [{"elem.orderId": orderId}]}
        );

        if (!updateResult) {
            const refreshed = await findUserById(user._id.toString());
            return res.json({
                success: true,
                isPremium: true,
                premiumExpiry: refreshed?.premiumExpiry,
                message: "Subscription already active.",
            });
        }

        res.json({
            success: true,
            isPremium: true,
            premiumExpiry: expiryDate.toISOString(),
            message: "Subscription activated successfully!",
        });
    } catch (error: any) {
        console.error("Verify subscription error:", error);
        sendInternalError(res, error);
    }
};

export const cancelSubscription = async (req: any, res: Response) => {
    try {
        await connectDB();

        const userAfterCancel = await findOneAndUpdateUser(
            {_id: req.uid, isPremium: true, subscriptionId: {$ne: null}},
            {
                $set: {"subscriptions.$[lastSub].status": "cancelled"},
                $unset: {subscriptionId: "", subscriptionPlan: ""},
            },
            {
                arrayFilters: [{"lastSub.status": "active"}],
            }
        );

        if (!userAfterCancel) {
            return res.status(400).json({error: "No active subscription found"});
        }

        const hasUpcomingSub = (userAfterCancel as any).subscriptions?.some(
            (s: any) => s.status === "active" && new Date(s.expiry) > new Date()
        );

        if (!hasUpcomingSub) {
            await findOneAndUpdateUser(
                {_id: req.uid},
                {$set: {isPremium: false, premiumExpiry: null}}
            );
            res.json({
                success: true,
                isPremium: false,
                message:
                    "Subscription cancelled. Premium features have been removed.",
            });
        } else {
            res.json({
                success: true,
                isPremium: true,
                message:
                    "Subscription cancelled. Premium features remain active until the current period ends.",
            });
        }
    } catch (error: any) {
        console.error("Cancel subscription error:", error);
        sendInternalError(res, error);
    }
};

export const getSubscriptionStatus = async (req: any, res: Response) => {
    try {
        await connectDB();
        const user = await findUserByIdSelect(req.uid, "isPremium premiumExpiry subscriptionPlan subscriptions");
        if (!user) return res.status(404).json({error: "User not found"});

        const now = new Date();
        const isExpired = user.premiumExpiry && user.premiumExpiry < now;
        const isActive = user.isPremium && !isExpired;

        if (user.isPremium && isExpired) {
            await updateOneUser(
                {_id: user._id, isPremium: true},
                {
                    $set: {
                        isPremium: false,
                        subscriptionActive: false,
                        updatedAt: now,
                    },
                    $push: {
                        subscriptions: {
                            $each: [{status: "expired", expiry: user.premiumExpiry}],
                            $slice: -50,
                        },
                    },
                }
            );
        }

        res.json({
            isPremium: isActive,
            premiumExpiry: user.premiumExpiry,
            subscriptionPlan: user.subscriptionPlan,
            subscriptions: user.subscriptions || [],
            daysRemaining: user.premiumExpiry
                ? Math.ceil(
                    (user.premiumExpiry.getTime() - now.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
                : 0,
        });
    } catch (error: any) {
        console.error("Get subscription status error:", error);
        sendInternalError(res, error);
    }
};
