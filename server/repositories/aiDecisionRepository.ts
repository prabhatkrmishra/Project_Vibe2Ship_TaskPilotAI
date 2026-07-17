import {AIDecision} from "../db/mongodb.js";

// ─── AI Decision Repository ───────────────────────────────────────────────────
// This file contains data access methods for AI Decision entities.
// Implements CRUD operations and queries specific to AI decisions.

/**
 * Finds an AI decision by its ID
 * @param id - The AI decision ID
 * @returns The AI decision document or null if not found
 */
export const findAIDecisionById = (id: string) => AIDecision.findById(id);

/**
 * Finds an AI decision by its ID scoped to a user
 * @param id - The AI decision ID
 * @param userId - The user ID to scope the query to
 * @returns The AI decision document or null if not found
 */
export const findAIDecisionByIdForUser = (id: string, userId: string) =>
    AIDecision.findOne({_id: id, userId});

/**
 * Finds AI decisions by user ID
 * @param userId - The user ID
 * @returns Array of AI decision documents
 */
export const findAIDecisionsByUser = (userId: string) => AIDecision.find({userId});

/**
 * Finds AI decisions by task ID
 * @param taskId - The task ID
 * @returns Array of AI decision documents
 */
export const findAIDecisionsByTask = (taskId: string) => AIDecision.find({taskId});

/**
 * Creates a new AI decision
 * @param data - AI decision data to create
 * @returns The created AI decision document
 */
export const createAIDecision = (data: Partial<any>) => AIDecision.create(data);

/**
 * Updates an AI decision by ID
 * @param id - The AI decision ID
 * @param userId - The user ID
 * @param update - Update data
 * @returns The updated AI decision document or null if not found
 */
export const updateAIDecisionById = (id: string, userId: string, update: Partial<any>) =>
    AIDecision.findOneAndUpdate({_id: id, userId}, update, {returnDocument: 'after'});

/**
 * Deletes an AI decision by ID
 * @param id - The AI decision ID
 * @param userId - The user ID
 * @returns The deleted AI decision document or null if not found
 */
export const deleteAIDecisionById = (id: string, userId: string) =>
    AIDecision.findOneAndDelete({_id: id, userId});

/**
 * Finds recent AI decisions by user ID
 * @param userId - The user ID
 * @param limit - Number of decisions to return
 * @returns Array of recent AI decision documents
 */
export const findRecentAIDecisionsByUser = (userId: string, limit: number = 10) =>
    AIDecision.find({userId}).sort({createdAt: -1}).limit(limit);

/**
 * Finds AI decisions by model provider
 * @param provider - The AI model provider
 * @returns Array of AI decision documents
 */
export const findAIDecisionsByProvider = (provider: string) =>
    AIDecision.find({provider});

/**
 * Counts total AI decisions for a user
 * @param userId - The user ID
 * @returns Count of AI decisions
 */
export const countAIDecisionsByUser = (userId: string) =>
    AIDecision.countDocuments({userId});