import {Response} from "express";

const isDev = process.env.NODE_ENV === 'development';

export const sendSuccess = (res: Response, data: any, status = 200) => {
    res.status(status).json(data);
};

export const sendNotFound = (res: Response, resource = "Resource") => {
    res.status(404).json({error: `${resource} not found`});
};

export const sendBadRequest = (res: Response, message: string) => {
    res.status(400).json({error: message});
};

export const sendValidationError = (res: Response, details: Record<string, string[]>) => {
    res.status(400).json({error: "Validation failed", details});
};

export const sendConflict = (res: Response, message: string) => {
    res.status(409).json({error: message});
};

export const sendInternalError = (res: Response, error: any, fallback = "Internal server error") => {
    console.error(fallback + ":", error);
    res.status(500).json({
        error: fallback,
        ...(isDev ? {message: error.message} : {}),
    });
};
