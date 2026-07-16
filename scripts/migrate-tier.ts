/**
 * Migration: Map existing isPremium boolean users to the new tier system.
 *
 * Rules:
 *   1. Users with isPremium=true AND no tier set yet → tier='pro_plus'
 *      (today's single premium tier already includes everything Pro+ will have)
 *   2. Users with an expired premiumExpiry → tier='free', isPremium=false
 *   3. Users already on 'pro' or 'pro_plus' are left untouched
 *
 * Usage:
 *   npx tsx scripts/migrate-tier.ts
 */

import mongoose from 'mongoose';
import {connectDB, User} from '../src/db/mongodb';

async function migrate() {
    await connectDB();

    const now = new Date();

    // 1. Promote active premium users to 'pro_plus' (only if they are still on default 'free')
    //    Guide 0.1: "for every user with isPremium: true, set tier: 'pro_plus'"
    const promoted = await User.updateMany(
        {isPremium: true, tier: 'free'},
        {$set: {tier: 'pro_plus'}}
    );
    console.log(`[migrate-tier] Promoted ${promoted.modifiedCount} users from free → pro_plus`);

    // 2. Demote expired premium subscriptions back to 'free'
    const demoted = await User.updateMany(
        {premiumExpiry: {$lt: now}, isPremium: true},
        {$set: {isPremium: false, tier: 'free'}}
    );
    console.log(`[migrate-tier] Demoted ${demoted.modifiedCount} expired users to free`);

    // 3. Sync tierExpiry from premiumExpiry for any pro_plus users missing it
    const synced = await User.updateMany(
        {tier: 'pro_plus', tierExpiry: null, premiumExpiry: {$ne: null}},
        [{$set: {tierExpiry: '$premiumExpiry'}}]
    );
    console.log(`[migrate-tier] Synced tierExpiry for ${synced.modifiedCount} users`);

    console.log('[migrate-tier] Migration complete');
    await mongoose.disconnect();
}

migrate().catch((err) => {
    console.error('[migrate-tier] Migration failed:', err);
    process.exit(1);
});
