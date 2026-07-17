import jwt from "jsonwebtoken";
import {connectDB, User} from "../db/mongodb.js";
import {JWT_SECRET} from "../config/env.js";

export async function verifyToken(req: any, res: any, next: any) {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({error: 'Unauthorized'});
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded.twoFA) {
            return res.status(401).json({error: 'Incomplete 2FA verification'});
        }
        req.uid = decoded.uid;
        if (decoded.tv !== undefined) {
            await connectDB();
            const user = await User.findById(decoded.uid).select('tokenVersion');
            if (user && user.tokenVersion !== decoded.tv) {
                return res.status(401).json({error: 'Token invalidated — please log in again'});
            }
        }
        next();
    } catch {
        res.status(401).json({error: 'Invalid token'});
    }
}

export async function requireAdmin(req: any, res: any, next: any) {
    try {
        await connectDB();
        const user = await User.findById(req.uid).select('role');
        if (!user || user.role !== 'admin') {
            return res.status(403).json({error: 'Admin access required'});
        }
        next();
    } catch {
        res.status(403).json({error: 'Admin access required'});
    }
}
