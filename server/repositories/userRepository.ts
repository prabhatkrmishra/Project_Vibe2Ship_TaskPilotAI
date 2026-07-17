import {User} from "../db/mongodb.js";
import * as crypto from 'crypto';

function localDateStr(d?: Date): string {
    const date = d || new Date();
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

// ─── User Repository ──────────────────────────────────────────────────────────
// This file contains data access methods for User entities.
// Implements CRUD operations and queries specific to users.

/**
 * Finds a user by email
 * @param email - The user email
 * @returns The user document or null if not found
 */
export const findUserByEmail = (email: string) => User.findOne({email: email.toLowerCase()});

export const findUserByGoogleIdOrEmail = (googleUid: string, email: string) =>
    User.findOne({
        $or: [
            {googleId: googleUid},
            {googleEmail: email.toLowerCase()},
            {email: email.toLowerCase(), authProvider: "google"},
        ],
    });

/**
 * Finds a user by ID
 * @param id - The user ID
 * @returns The user document or null if not found
 */
export const findUserById = (id: string) => User.findById(id);

/**
 * Finds a user by ID with selected fields
 * @param id - The user ID
 * @param fields - Fields to select
 * @returns The user document or null if not found
 */
export const findUserByIdSelect = (id: string, fields: string) => User.findById(id).select(fields);

/**
 * Creates a new user
 * @param data - User data to create
 * @returns The created user document
 */
export const createUser = (data: any) => User.create(data);

/**
 * Updates a user by ID
 * @param id - The user ID
 * @param update - Update data
 * @returns The updated user document or null if not found
 */
export const updateUserById = (id: string, update: any) =>
    User.findOneAndUpdate({_id: id}, update, {returnDocument: 'after'});

export const updateUserByEmail = (email: string, update: any) =>
    User.findOneAndUpdate({email: email.toLowerCase()}, update, {returnDocument: 'after'});

export const updateUserConditions = (filter: any, update: any, options?: any) =>
    User.findOneAndUpdate(filter, update, options);

export const updateUserMany = (filter: any, update: any, options?: any) =>
    User.updateMany(filter, update, options);

export const countUsers = (filter?: any) =>
    User.countDocuments(filter || {});

export const aggregateUsers = (pipeline: any[]) =>
    User.aggregate(pipeline);

export const findUsers = (filter: any, options?: { select?: string; sort?: any; limit?: number }) => {
    let query = User.find(filter);
    if (options?.select) query = query.select(options.select);
    if (options?.sort) query = query.sort(options.sort);
    if (options?.limit) query = query.limit(options.limit);
    return query;
};

/**
 * Increments a user field
 * @param id - The user ID
 * @param field - Field to increment
 * @param value - Value to increment by
 * @returns The updated user document
 */
export const incrementUserField = (id: string, field: string, value: number) =>
    User.findOneAndUpdate({_id: id}, {$inc: {[field]: value}}, {returnDocument: 'after'});

/**
 * Adds an item to a user's array field
 * @param id - The user ID
 * @param field - Array field name
 * @param value - Value to add
 * @returns The updated user document
 */
export const addToUserArray = (id: string, field: string, value: any) =>
    User.findOneAndUpdate({_id: id}, {$addToSet: {[field]: value}}, {returnDocument: 'after'});

/**
 * Removes an item from a user's array field
 * @param id - The user ID
 * @param field - Array field name
 * @param value - Value to remove
 * @returns The updated user document
 */
export const removeFromUserArray = (id: string, field: string, value: any) =>
    User.findOneAndUpdate({_id: id}, {$pull: {[field]: value}}, {returnDocument: 'after'});

export const deleteUsersByIds = (ids: string[]) =>
    User.deleteMany({_id: {$in: ids}});

export const countGuestUsers = () =>
    User.countDocuments({isGuest: true});

export const findOldestGuests = (limit: number) =>
    User.find({isGuest: true}).sort({createdAt: 1}).limit(limit).select('_id');

export const findOneUser = (query: any) =>
    User.findOne(query);

/**
 * Gets corrected gamification data for a user.
 * Resets streak to 0 if the user hasn't been active for more than 1 day.
 * @param gamificationObj - Raw gamification object or mongoose document
 * @returns Corrected gamification object with all fields preserved
 */
export const getCorrectedGamification = (gamificationObj: any) => {
    if (!gamificationObj) return {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        xp: 0,
        level: 1,
        totalTasksCompleted: 0,
        onTimeTasksCompleted: 0,
        earnedBadges: [],
        unlockedPersonalities: ['default'],
        activePersonality: 'default'
    };

    const gamification = gamificationObj.toObject ? gamificationObj.toObject() : {...gamificationObj};

    const today = localDateStr();
    if (gamification.lastActiveDate && gamification.lastActiveDate !== today) {
        const lastActive = new Date(gamification.lastActiveDate);
        const todayDate = new Date(today);
        const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
            gamification.currentStreak = 0;
        }
    }

    // Ensure all fields are present with defaults (preserves dropped fields)
    return {
        currentStreak: gamification.currentStreak || 0,
        longestStreak: gamification.longestStreak || 0,
        lastActiveDate: gamification.lastActiveDate || null,
        xp: gamification.xp || 0,
        level: gamification.level || 1,
        totalTasksCompleted: gamification.totalTasksCompleted || 0,
        onTimeTasksCompleted: gamification.onTimeTasksCompleted || 0,
        earnedBadges: gamification.earnedBadges || [],
        unlockedPersonalities: gamification.unlockedPersonalities || ['default'],
        activePersonality: gamification.activePersonality || 'default'
    };
};

// ─── Subscription & Webhook helpers ─────────────────────────────────────────

export const findUserByGoogleId = (googleId: string) =>
    User.findOne({googleId});

export const findUserWithSubscriptions = (filter: any) =>
    User.findOne(filter);

export const findOneAndUpdateUser = (filter: any, update: any, options: any = {}) =>
    User.findOneAndUpdate(filter, update, {returnDocument: 'after', ...options});

export const updateOneUser = (filter: any, update: any) =>
    User.updateOne(filter, update);