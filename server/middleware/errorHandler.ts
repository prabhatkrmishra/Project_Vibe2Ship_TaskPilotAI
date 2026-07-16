import {Request, Response, NextFunction} from "express";

// ─── Error Handler Middleware ─────────────────────────────────────────────────
// This file contains centralized error handling for the application.

/**
 * Centralized error handler middleware
 * @param err - The error object
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    console.error('Unhandled error:', err);

    // Default error response
    const errorResponse = {
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    };

    // Handle specific error types
    if (err.status) {
        return res.status(err.status).json({...errorResponse, status: err.status});
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation error',
            message: err.message
        });
    }

    // Handle cast errors (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'Invalid ID format',
            message: 'The requested resource ID is invalid'
        });
    }

    // Handle 404 errors
    if (err.code === 'ENOENT') {
        return res.status(404).json({
            error: 'Not found',
            message: 'The requested resource could not be found'
        });
    }

    // Default internal server error
    return res.status(500).json(errorResponse);
}