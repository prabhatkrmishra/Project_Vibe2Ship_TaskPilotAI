import {User} from "../db/mongodb.ts";

// ─── Subscription Repository ──────────────────────────────────────────────────
// This file contains data access methods for the subscriptions array embedded
// in the User document.

/**
 * Finds a user by ID
 * @param userId - The user ID
 * @returns The user document or null if not found
 */
export const findUserById = (userId: string) => User.findById(userId);

/**
 * Returns the subscriptions array for a user
 * @param userId - The user ID
 * @returns The subscriptions array
 */
export const findUserSubscriptions = async (userId: string) => {
    const user = await User.findById(userId).select("subscriptions");
    return user?.subscriptions ?? [];
};

/**
 * Pushes a new subscription onto the user's subscriptions array
 * @param userId - The user ID
 * @param subscription - The subscription object to add
 * @returns The updated user document
 */
export const addSubscription = (userId: string, subscription: any) =>
    User.findOneAndUpdate(
        {_id: userId},
        {$push: {subscriptions: subscription}},
        {returnDocument: "after"}
    );

/**
 * Updates a specific subscription within the user's subscriptions array
 * matched by orderId
 * @param userId - The user ID
 * @param orderId - The orderId of the subscription to update
 * @param update - Fields to update on the subscription
 * @returns The updated user document
 */
export const updateSubscription = (userId: string, orderId: string, update: any) => {
    const setFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(update)) {
        setFields[`subscriptions.$.${key}`] = value;
    }
    return User.findOneAndUpdate(
        {_id: userId, "subscriptions.orderId": orderId},
        {$set: setFields},
        {returnDocument: "after"}
    );
};
