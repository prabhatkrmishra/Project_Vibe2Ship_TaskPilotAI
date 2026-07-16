import crypto from "crypto";
import {Request, Response} from "express";
import * as BackupService from "../services/backupService";
import {signBackupPayload, verifyBackupSignature} from "../lib/backup";

export const exportBackup = async (req: any, res: Response) => {
    try {
        const data = await BackupService.exportUserBackup(req.uid);
        res.json(data);
    } catch (error: any) {
        console.error("Backup export error:", error);
        res.status(500).json({error: "Failed to export backup data"});
    }
};

export const signBackup = async (req: any, res: Response) => {
    try {
        const {canonicalJson} = req.body;
        if (!canonicalJson || typeof canonicalJson !== "string") {
            return res.status(400).json({error: "canonicalJson (string) is required"});
        }
        if (canonicalJson.length > 10 * 1024 * 1024) {
            return res.status(413).json({error: "Backup payload too large (max 10MB)"});
        }
        const contentHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
        const signature = signBackupPayload(canonicalJson);
        res.json({contentHash, signature});
    } catch (error: any) {
        console.error("Backup sign error:", error);
        res.status(500).json({error: "Failed to sign backup"});
    }
};

export const verifyBackup = async (req: any, res: Response) => {
    try {
        const {canonicalJson, signature} = req.body;
        if (!canonicalJson || !signature) {
            return res.status(400).json({valid: false, error: "canonicalJson and signature are required"});
        }
        const valid = verifyBackupSignature(canonicalJson, signature);
        res.json({valid});
    } catch (error: any) {
        console.error("Backup verify error:", error);
        res.status(500).json({valid: false, error: "Failed to verify backup"});
    }
};
