import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    statusCode: number;
    isOperational: boolean;
}

export class ApiError extends Error implements AppError {
    statusCode: number;
    isOperational: boolean;

    constructor(statusCode: number, message: string, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`[Error] ${req.method} ${req.url} - ${statusCode}: ${message}`);
    if (err.stack) console.error(err.stack);

    res.status(statusCode).json({
        status: 'error',
        statusCode,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};
