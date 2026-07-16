import * as AIDecisionRepository from "../repositories/aiDecisionRepository.ts";
import {generateAIContent} from "../lib/ai";

// ─── AI Decision Service ──────────────────────────────────────────────────────
// This file contains business logic for AI decisions, including creation,
// processing, and integration with AI providers.

/**
 * Creates a new AI decision
 * @param decisionData - Data for the new AI decision
 * @returns The created AI decision
 */
export const createAIDecision = async (decisionData: any) => {
    // Validation could go here
    const newDecision = await AIDecisionRepository.createAIDecision(decisionData);
    return newDecision;
};

/**
 * Gets AI decisions for a specific user
 * @param userId - The user ID
 * @returns Array of AI decisions for the user
 */
export const getAIDecisionsByUser = async (userId: string) => {
    return await AIDecisionRepository.findAIDecisionsByUser(userId);
};

/**
 * Gets a specific AI decision by ID scoped to a user
 * @param id - The AI decision ID
 * @param userId - The user ID
 * @returns The AI decision document or null
 */
export const getAIDecisionById = async (id: string, userId: string) => {
    return await AIDecisionRepository.findAIDecisionByIdForUser(id, userId);
};

/**
 * Updates an AI decision
 * @param id - The AI decision ID
 * @param userId - The user ID
 * @param updateData - Update data
 * @returns The updated AI decision or null
 */
export const updateAIDecision = async (id: string, userId: string, updateData: any) => {
    // Validation could go here
    const updatedDecision = await AIDecisionRepository.updateAIDecisionById(id, userId, updateData);
    return updatedDecision;
};

/**
 * Deletes an AI decision
 * @param id - The AI decision ID
 * @param userId - The user ID
 * @returns The deleted AI decision or null
 */
export const deleteAIDecision = async (id: string, userId: string) => {
    const deletedDecision = await AIDecisionRepository.deleteAIDecisionById(id, userId);
    return deletedDecision;
};

/**
 * Gets recent AI decisions for a user
 * @param userId - The user ID
 * @param limit - Number of decisions to return
 * @returns Array of recent AI decisions
 */
export const getRecentAIDecisions = async (userId: string, limit: number = 10) => {
    return await AIDecisionRepository.findRecentAIDecisionsByUser(userId, limit);
};

/**
 * Gets AI decisions by model provider
 * @param provider - The AI model provider
 * @returns Array of AI decisions
 */
export const getAIDecisionsByProvider = async (provider: string) => {
    return await AIDecisionRepository.findAIDecisionsByProvider(provider);
};

/**
 * Gets AI decision statistics for a user
 * @param userId - The user ID
 * @returns AI decision statistics
 */
export const getAIDecisionStats = async (userId: string) => {
    const total = await AIDecisionRepository.countAIDecisionsByUser(userId);

    return {
        total,
        // Additional stats could be calculated here
    };
};

/**
 * Processes an AI decision request
 * @param userId - The user ID
 * @param requestData - Data for the AI request
 * @returns The processed AI decision
 */
export const processAIDecision = async (userId: string, requestData: any) => {
    const model = requestData.model || 'gemini-3.5-flash';
    const aiResponse = await generateAIContent({model, contents: requestData.input || requestData.prompt || ''});

    const decisionData = {
        userId,
        provider: requestData.provider || model,
        input: requestData.input || requestData.prompt,
        output: aiResponse.text,
        timestamp: new Date()
    };

    const newDecision = await AIDecisionRepository.createAIDecision(decisionData);
    return newDecision;
};