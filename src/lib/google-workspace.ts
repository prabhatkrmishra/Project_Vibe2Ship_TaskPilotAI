import {zipSync, unzipSync, strToU8, strFromU8} from 'fflate';
import {formatDate, getTodayISO} from '@/lib/time.ts';

export interface Task {
    id: string;
    title: string;
    description?: string;
    priority: 'high' | 'medium' | 'low';
    status: 'todo' | 'pending' | 'in_progress' | 'completed' | 'blocked';
    dueDate?: Date;
}

// ─── Full Data Backup (signed, compressed, deduped) ───────────────────────
// Backs up everything except login credentials (password, JWT, OAuth tokens).
// The archive is a .zip containing:
//   data.json      — canonical JSON payload (tasks, goals, plans, chats, etc.)
//   signature.sig  — { contentHash, signature, formatVersion } signed server-side
// The signing key itself never reaches the client; signing/verification are
// proxied through authenticated /api/backup/* endpoints.

const BACKUP_FILE_PREFIX = 'TaskPilot_Backup_';
const BACKUP_MIME_TYPE = 'application/zip';

export class TamperedBackupError extends Error {
    constructor(message = 'Tampered backup — cannot restore.') {
        super(message);
        this.name = 'TamperedBackupError';
    }
}

const authedJson = async (url: string, idToken: string, init?: RequestInit) => {
    const res = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            ...(init?.headers || {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.statusText}`);
    }
    return res.json();
};

/** Fetches the full exportable dataset for the current user from the server. */
async function fetchBackupPayload(idToken: string): Promise<{
    payload: any;
    canonicalJson: string;
    contentHash: string
}> {
    return authedJson('/api/backup/export', idToken, {method: 'GET'});
}

/** Asks the server to sign a canonical JSON payload (server holds the signing key). */
async function signBackupPayload(idToken: string, canonicalJson: string): Promise<{
    contentHash: string;
    signature: string
}> {
    return authedJson('/api/backup/sign', idToken, {
        method: 'POST',
        body: JSON.stringify({canonicalJson}),
    });
}

/** Asks the server to verify a canonical JSON payload against its claimed signature. */
async function verifyBackupPayload(idToken: string, canonicalJson: string, signature: string): Promise<boolean> {
    const result = await authedJson('/api/backup/verify', idToken, {
        method: 'POST',
        body: JSON.stringify({canonicalJson, signature}),
    });
    return !!result.valid;
}

/** Builds a signed, compressed backup archive (Uint8Array of zip bytes). */
function buildSignedZip(canonicalJson: string, signature: string, contentHash: string, formatVersion: number): Uint8Array {
    const manifest = JSON.stringify({contentHash, signature, formatVersion});
    return zipSync(
        {
            'data.json': strToU8(canonicalJson),
            'signature.sig': strToU8(manifest),
        },
        {level: 6}
    );
}

/** Looks up existing TaskPilot backups in Drive, most recent first. */
async function listExistingBackups(driveToken: string): Promise<Array<{
    id: string;
    name: string;
    appProperties?: Record<string, string>
}>> {
    const q = encodeURIComponent(`name contains '${BACKUP_FILE_PREFIX}' and trashed = false and mimeType = '${BACKUP_MIME_TYPE}'`);
    const fields = encodeURIComponent('files(id,name,appProperties,createdTime)');
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime desc&pageSize=10`,
        {headers: {Authorization: `Bearer ${driveToken}`}}
    );
    if (!res.ok) return []; // Non-fatal: fall through and just upload a fresh backup.
    const data = await res.json();
    return data.files || [];
}

/**
 * Exports the user's full dataset (everything except login credentials) as a
 * signed, zip-compressed backup to Google Drive. Skips the upload entirely
 * if the content is identical to the most recent existing backup, so
 * repeated clicks don't pile up duplicate files.
 */
export async function exportFullBackupToDrive(
    driveToken: string,
    idToken: string
): Promise<{ skipped: boolean; fileId?: string; fileName?: string }> {
    const {canonicalJson, contentHash, payload} = await fetchBackupPayload(idToken);
    const formatVersion = payload?.formatVersion ?? 1;

    const existing = await listExistingBackups(driveToken);
    const latest = existing[0];
    if (latest?.appProperties?.contentHash === contentHash) {
        return {skipped: true};
    }

    const {signature} = await signBackupPayload(idToken, canonicalJson);
    const zipBytes = buildSignedZip(canonicalJson, signature, contentHash, formatVersion);

    const fileName = `${BACKUP_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    const metadata = {
        name: fileName,
        mimeType: BACKUP_MIME_TYPE,
        appProperties: {contentHash, signature, formatVersion: String(formatVersion)},
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
    form.append('file', new Blob([zipBytes], {type: BACKUP_MIME_TYPE}));

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
        method: 'POST',
        headers: {Authorization: `Bearer ${driveToken}`},
        body: form,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Drive Error: ${err.error?.message || res.statusText}`);
    }
    const created = await res.json();
    return {skipped: false, fileId: created.id, fileName: created.name};
}

/**
 * Downloads a backup zip from Drive, unpacks it, and verifies its signature
 * server-side. Throws TamperedBackupError if the signature doesn't match
 * (file was modified or wasn't produced by this server), so callers can
 * show a dedicated "tampered backup" banner instead of a generic error.
 */
export async function downloadAndVerifyBackup(driveToken: string, idToken: string, fileId: string): Promise<any> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {Authorization: `Bearer ${driveToken}`},
    });
    if (!res.ok) throw new Error('Failed to download backup file from Drive');
    const zipBytes = new Uint8Array(await res.arrayBuffer());

    let unzipped: Record<string, Uint8Array>;
    try {
        unzipped = unzipSync(zipBytes);
    } catch {
        // Not a valid zip at all — treat as tampered/corrupted, same user-facing outcome.
        throw new TamperedBackupError();
    }

    const dataEntry = unzipped['data.json'];
    const sigEntry = unzipped['signature.sig'];
    if (!dataEntry || !sigEntry) {
        throw new TamperedBackupError();
    }

    const canonicalJson = strFromU8(dataEntry);
    let manifest: { signature?: string; contentHash?: string };
    try {
        manifest = JSON.parse(strFromU8(sigEntry));
    } catch {
        throw new TamperedBackupError();
    }
    if (!manifest.signature) throw new TamperedBackupError();

    // Extra integrity check: the recomputed hash of the extracted JSON must
    // match the hash recorded at sign time before we even ask the server to
    // verify the HMAC.
    if (manifest.contentHash) {
        const digest = await crypto.subtle.digest('SHA-256', strToU8(canonicalJson));
        const recomputedHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (recomputedHash !== manifest.contentHash) {
            throw new TamperedBackupError();
        }
    }

    const valid = await verifyBackupPayload(idToken, canonicalJson, manifest.signature);
    if (!valid) throw new TamperedBackupError();

    return JSON.parse(canonicalJson);
}

/**
 * Restores a verified backup payload into the app's database, skipping
 * records that already exist (matched by id) so repeated restores don't
 * create duplicates.
 */
export async function restoreBackupPayload(idToken: string, payload: any): Promise<{
    tasksAdded: number;
    goalsAdded: number
}> {
    const headers = {'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`};

    const [existingTasksRes, existingGoalsRes] = await Promise.all([
        fetch('/api/tasks', {headers}),
        fetch('/api/goals', {headers}),
    ]);
    const existingTaskIds = new Set(existingTasksRes.ok ? (await existingTasksRes.json()).map((t: any) => t.id) : []);
    const existingGoalIds = new Set(existingGoalsRes.ok ? (await existingGoalsRes.json()).map((g: any) => g.id) : []);

    let tasksAdded = 0;
    const allTasks = [...(payload.tasks || [])];
    for (const t of allTasks) {
        if (t.id && existingTaskIds.has(t.id)) continue;
        const res = await fetch('/api/tasks', {method: 'POST', headers, body: JSON.stringify(t)});
        if (res.ok) tasksAdded++;
    }

    let goalsAdded = 0;
    for (const g of payload.goals || []) {
        if (g.id && existingGoalIds.has(g.id)) continue;
        const res = await fetch('/api/goals', {method: 'POST', headers, body: JSON.stringify(g)});
        if (res.ok) goalsAdded++;
    }

    return {tasksAdded, goalsAdded};
}

const getHeaders = async () => {
    const token = localStorage.getItem('workspace_access_token');
    if (!token) throw new Error("Not authenticated with Google Workspace");
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
};

export async function exportToCalendar(task: Task) {
    const headers = await getHeaders();

    if (!task.dueDate) throw new Error("Task needs a due date to export to Calendar");

    const start = new Date(task.dueDate);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration

    const event = {
        summary: `[TaskPilot] ${task.title}`,
        description: task.description || "",
        start: {
            dateTime: start.toISOString(),
        },
        end: {
            dateTime: end.toISOString(),
        },
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers,
        body: JSON.stringify(event)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Calendar Error: ${err.error?.message || res.statusText}`);
    }
    return res.json();
}

export async function exportToDrive(data: any) {
    const headers = await getHeaders();

    const content = JSON.stringify(data, null, 2);
    const metadata = {
        name: `TaskPilot_Backup_${getTodayISO()}.json`,
        mimeType: 'application/json'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
    form.append('file', new Blob([content], {type: 'application/json'}));

    // Using multipart upload for Drive API
    const token = localStorage.getItem('workspace_access_token');
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: form
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Drive Error: ${err.error?.message || res.statusText}`);
    }
    return res.json();
}

export async function exportToDocs(tasks: Task[]) {
    const headers = await getHeaders();

    // 1. Create a new document
    const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            title: `TaskPilot Summary - ${formatDate(new Date().toISOString())}`
        })
    });

    if (!createRes.ok) throw new Error("Failed to create document");
    const doc = await createRes.json();
    const documentId = doc.documentId;

    // 2. Insert text into the document
    let text = "TaskPilot Daily Focus Summary\n\n";
    tasks.forEach(t => {
        text += `[${t.status}] ${t.priority} Priority: ${t.title}\n`;
        if (t.description) text += `Description: ${t.description}\n`;
        if (t.dueDate) text += `Due: ${formatDate(t.dueDate.toISOString())}\n`;
        text += "\n";
    });

    const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            requests: [
                {
                    insertText: {
                        location: {index: 1},
                        text
                    }
                }
            ]
        })
    });

    if (!updateRes.ok) throw new Error("Failed to write to document");
    return doc;
}

export async function exportToSlides(tasks: Task[]) {
    const headers = await getHeaders();

    const createRes = await fetch('https://slides.googleapis.com/v1/presentations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            title: `TaskPilot Tasks - ${formatDate(new Date().toISOString())}`
        })
    });

    if (!createRes.ok) throw new Error("Failed to create presentation");
    const presentation = await createRes.json();
    const presentationId = presentation.presentationId;
    const slideId = presentation.slides[0].objectId;

    let text = "TaskPilot Daily Focus Summary\n\n";
    tasks.forEach(t => {
        text += `[${t.status}] ${t.priority} Priority: ${t.title}\n`;
        if (t.description) text += `Description: ${t.description}\n`;
        if (t.dueDate) text += `Due: ${formatDate(t.dueDate.toISOString())}\n`;
        text += "\n";
    });

    const updateRes = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            requests: [
                {
                    createShape: {
                        objectId: "textBoxId1",
                        shapeType: "TEXT_BOX",
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {width: {magnitude: 600, unit: "PT"}, height: {magnitude: 400, unit: "PT"}},
                            transform: {scaleX: 1, scaleY: 1, translateX: 50, translateY: 50, unit: "PT"}
                        }
                    }
                },
                {
                    insertText: {
                        objectId: "textBoxId1",
                        text
                    }
                }
            ]
        })
    });

    if (!updateRes.ok) throw new Error("Failed to write to presentation");
    return presentation;
}

export async function exportToTasks(tasks: Task[]) {
    const headers = await getHeaders();

    for (const t of tasks) {
        const taskBody = {
            title: `[TaskPilot] ${t.title}`,
            notes: t.description || "",
            status: t.status === 'completed' ? 'completed' : 'needsAction',
            due: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
        };

        const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
            method: 'POST',
            headers,
            body: JSON.stringify(taskBody)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Tasks Error: ${err.error?.message || res.statusText}`);
        }
    }
}

export async function exportToSheets(tasks: Task[]) {
    const headers = await getHeaders();

    // 1. Create a new spreadsheet
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            properties: {
                title: `TaskPilot Tasks - ${formatDate(new Date().toISOString())}`
            }
        })
    });

    if (!createRes.ok) throw new Error("Failed to create spreadsheet");
    const sheet = await createRes.json();
    const spreadsheetId = sheet.spreadsheetId;

    // 2. Add data
    const values = [
        ["ID", "Title", "Priority", "Status", "Due Date", "Description"],
        ...tasks.map(t => [
            t.id,
            t.title,
            t.priority,
            t.status,
            t.dueDate ? formatDate(t.dueDate.toISOString()) : "",
            t.description || ""
        ])
    ];

    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            range: "Sheet1!A1",
            majorDimension: "ROWS",
            values
        })
    });

    if (!updateRes.ok) throw new Error("Failed to write to spreadsheet");
    return sheet;
}


export async function importFromTasks() {
    const headers = await getHeaders();

    const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false', {
        method: 'GET',
        headers
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Tasks Error: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const importedTasks = [];

    if (data.items) {
        for (const item of data.items) {
            importedTasks.push({
                title: item.title,
                description: item.notes || "",
                status: item.status === 'completed' ? 'completed' : 'pending',
                priority: 'medium',
                dueDate: item.due ? new Date(item.due) : undefined
            });
        }
    }

    return importedTasks;
}
