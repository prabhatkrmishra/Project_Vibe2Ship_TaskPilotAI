import crypto from "crypto";
import {connectDB} from "../db/mongodb.js";
import {sendInternalError, sendBadRequest} from "../lib/controllerUtils.js";
import {findEnabledPlanById} from "../repositories/pricingRepository.js";
import {findUserById, findUserWithSubscriptions, findOneAndUpdateUser} from "../repositories/userRepository.js";

const DEFAULT_PRICING: any[] = [
    {
        planId: 'monthly',
        name: 'Monthly Premium',
        basePrice: 199,
    },
    {
        planId: 'annual',
        name: 'Annual Premium',
        basePrice: 1999,
    }
];

async function getEffectivePrice(planId: string): Promise<{ price: number; name: string }> {
    await connectDB();
    const plan = await findEnabledPlanById(planId);
    if (!plan) {
        const fallback = DEFAULT_PRICING.find(p => p.planId === planId);
        return {price: fallback?.basePrice || 0, name: fallback?.name || planId};
    }
    const effectivePrice = plan.saleActive && plan.salePrice ? plan.salePrice : plan.basePrice;
    return {price: effectivePrice, name: plan.name};
}

export async function razorpayWebhook(req: any, res: any) {
    try {
        const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!razorpayWebhookSecret) {
            console.error('RAZORPAY_WEBHOOK_SECRET is not configured — refusing to process webhook.');
            return res.status(500).json({error: 'Webhook not configured'});
        }
        const signature = req.headers['x-razorpay-signature'] as string;
        if (!signature) {
            return res.status(400).json({error: 'Missing signature'});
        }
        const expectedSignature = crypto.createHmac('sha256', razorpayWebhookSecret)
            .update(req.body.toString())
            .digest('hex');
        let sigBuf: Buffer, expectedBuf: Buffer;
        try {
            sigBuf = Buffer.from(signature, 'hex');
            expectedBuf = Buffer.from(expectedSignature, 'hex');
        } catch {
            return res.status(400).json({error: 'Invalid signature'});
        }
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return res.status(400).json({error: 'Invalid signature'});
        }

        const payload = JSON.parse(req.body.toString());
        const {event, payload: data, created_at} = payload;

        if (typeof created_at === 'number' && (Date.now() / 1000 - created_at) > 300) {
            console.warn('Razorpay webhook: stale event ignored', event, created_at);
            return res.json({received: true});
        }

        if (event === 'payment.captured' || event === 'payment_link.paid') {
            const paymentId = data.payment?.entity?.id;
            const orderId = data.order?.entity?.id;
            const paymentLinkId = data.payment_link?.entity?.id;
            const planFromNotes = data.payment?.entity?.notes?.plan || data.payment_link?.entity?.notes?.plan;

            if (!paymentId || data.payment?.entity?.status !== 'captured') {
                return res.json({received: true});
            }

            await connectDB();

            let user = await findUserWithSubscriptions({
                $or: [
                    {'subscriptions.orderId': orderId},
                    {'subscriptions.paymentLinkId': paymentLinkId},
                    {'subscriptions.paymentId': paymentId}
                ]
            });

            if (!user && data.payment?.entity?.notes?.userId) {
                user = await findUserById(data.payment.entity.notes.userId);
            }

            if (!user && data.order?.entity?.notes?.userId) {
                user = await findUserById(data.order.entity.notes.userId);
            }

            if (!user) {
                console.log('Webhook: No user found for payment', paymentId, orderId, paymentLinkId);
                return res.json({received: true});
            }

            const plan = planFromNotes || user.subscriptionPlan || 'monthly';
            const now = new Date();
            const expiryDate = new Date(now.getTime() + (plan === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000);

            if (!user.subscriptions) user.subscriptions = [];
            const alreadyProcessed = user.subscriptions.some((s: any) => s.paymentId === paymentId);
            if (alreadyProcessed) {
                return res.json({received: true, message: 'Payment already processed'});
            }

            const existingRecord = user.subscriptions.find(
                (s: any) => s.orderId === orderId || s.paymentLinkId === paymentLinkId
            );

            if (existingRecord) {
                const updateResult = await findOneAndUpdateUser(
                    {
                        _id: user._id,
                        subscriptions: {$elemMatch: {orderId: existingRecord.orderId, status: {$ne: 'active'}}}
                    },
                    {
                        $set: {
                            isPremium: true,
                            premiumExpiry: expiryDate,
                            subscriptionId: paymentId,
                            subscriptionPlan: plan,
                            subscriptionActive: true,
                            'subscriptions.$[elem].status': 'active',
                            'subscriptions.$[elem].paymentId': paymentId,
                            'subscriptions.$[elem].expiry': expiryDate,
                            'subscriptions.$[elem].paymentMethod': 'razorpay'
                        }
                    },
                    {arrayFilters: [{'elem.orderId': existingRecord.orderId}]}
                );
                if (!updateResult) {
                    return res.json({received: true, message: 'Payment already processed'});
                }
            } else {
                user.isPremium = true;
                user.premiumExpiry = expiryDate;
                user.subscriptionActive = true;
                user.subscriptionId = paymentId;
                user.subscriptions.push({
                    plan,
                    amount: (await getEffectivePrice(plan)).price,
                    currency: 'INR',
                    orderId,
                    paymentId,
                    startedAt: now,
                    expiry: expiryDate,
                    status: 'active',
                    paymentMethod: 'razorpay'
                });
                await user.save();
            }

            console.log('Webhook activated premium for user:', user.email);

            res.json({received: true});
        } else {
            res.json({received: true});
        }
    } catch (error: any) {
        console.error("Razorpay webhook error:", error);
        sendInternalError(res, error);
    }
}
