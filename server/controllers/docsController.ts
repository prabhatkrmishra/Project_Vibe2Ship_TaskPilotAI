import {Request, Response} from "express";
import {google} from "googleapis";
import {generateAIContent, getValidModel} from "../lib/ai";
import {sendInternalError} from "../lib/controllerUtils.ts";

export const createDocument = async (req: Request, res: Response) => {
    try {
        const accessToken = (req as any).headers["x-workspace-token"];
        if (!accessToken) return res.status(401).send("No access token");

        const {title, content} = req.body;
        const cleanTitle = typeof title === 'string' ? title.trim().substring(0, 500) : 'Untitled Document';
        const cleanContent = typeof content === 'string' ? content.substring(0, 500000) : '';

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
        const docs = google.docs({version: 'v1', auth: oauth2Client});

        const doc = await docs.documents.create({
            requestBody: {title: cleanTitle},
        });

        if (doc.data.documentId) {
            await docs.documents.batchUpdate({
                documentId: doc.data.documentId,
                requestBody: {
                    requests: [
                        {
                            insertText: {
                                location: {index: 1},
                                text: cleanContent
                            }
                        }
                    ]
                }
            });
        }

        res.json(doc.data);
    } catch (error: any) {
        console.error('Error creating Google Doc:', error);
        sendInternalError(res, error);
    }
};

export const generateReport = async (req: Request, res: Response) => {
    try {
        const accessToken = (req as any).headers["x-workspace-token"];
        if (!accessToken) return res.status(401).send("No access token");

        const {title, tasks, completedTasks, goals} = req.body;

        let segments: any[] = [];
        try {
            const prompt = `You are a professional assistant generating a comprehensive daily progress report for a user.
        Data:
        - Pending Tasks: ${JSON.stringify((tasks || []).map((t: any) => t.title))}
        - Completed Tasks: ${JSON.stringify((completedTasks || []).map((t: any) => t.title))}
        - Goals and Habits: ${JSON.stringify((goals || []).map((g: any) => ({title: g.title, type: g.type})))}
        
        Write a detailed but concise report summarizing:
        1. Overall productivity and status of tasks.
        2. Progress on habits and goals.
        3. Recommendations for tomorrow.
        
        Output a JSON array of text segments, applying formatting such as bold, italic, underline, or headings to improve visual info.
        Example format:
        [
          { "text": "Daily Progress Report\\n", "heading": "HEADING_1" },
          { "text": "Overview\\n", "heading": "HEADING_2" },
          { "text": "You completed ", "bold": false },
          { "text": "3 tasks", "bold": true },
          { "text": " today.\\n\\n", "bold": false }
        ]
        Valid headings: HEADING_1, HEADING_2, HEADING_3, NORMAL_TEXT. Ensure all paragraph breaks have \n. Do not include markdown like **.`;

            const aiRes = await generateAIContent({
                model: getValidModel(req.body.model),
                contents: prompt
            });
            let text = aiRes.text || "[]";
            text = text.replace(/```json/g, "").replace(/```/g, "").trim();
            segments = JSON.parse(text);
        } catch (err) {
            console.error("AI generation failed for docs:", err);
            segments = [{text: `Daily Progress Report\nTasks Completed: ${completedTasks?.length || 0}\nRemaining Tasks: ${tasks?.length || 0}\n`}];
        }

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
        const docs = google.docs({version: 'v1', auth: oauth2Client});

        const doc = await docs.documents.create({
            requestBody: {title},
        });

        if (doc.data.documentId && segments.length > 0) {
            const fullText = segments.map(s => s.text).join("");
            const requests: any[] = [
                {
                    insertText: {
                        location: {index: 1},
                        text: fullText
                    }
                }
            ];

            let currentIndex = 1;
            for (const segment of segments) {
                const segmentLength = segment.text.length;
                const startIndex = currentIndex;
                const endIndex = currentIndex + segmentLength;

                if (segment.bold || segment.italic || segment.underline) {
                    const textStyle: any = {};
                    const fields: string[] = [];
                    if (segment.bold) {
                        textStyle.bold = true;
                        fields.push("bold");
                    }
                    if (segment.italic) {
                        textStyle.italic = true;
                        fields.push("italic");
                    }
                    if (segment.underline) {
                        textStyle.underline = true;
                        fields.push("underline");
                    }

                    requests.push({
                        updateTextStyle: {
                            range: {startIndex, endIndex},
                            textStyle,
                            fields: fields.join(",")
                        }
                    });
                }

                if (segment.heading && segment.heading !== "NORMAL_TEXT") {
                    requests.push({
                        updateParagraphStyle: {
                            range: {startIndex, endIndex},
                            paragraphStyle: {namedStyleType: segment.heading},
                            fields: "namedStyleType"
                        }
                    });
                }

                currentIndex += segmentLength;
            }

            await docs.documents.batchUpdate({
                documentId: doc.data.documentId,
                requestBody: {requests}
            });
        }

        res.json(doc.data);
    } catch (error: any) {
        console.error('Error creating Google Doc report:', error);
        sendInternalError(res, error);
    }
};

export const generatePresentation = async (req: Request, res: Response) => {
    try {
        const accessToken = (req as any).headers["x-workspace-token"];
        if (!accessToken) return res.status(401).send("No access token");

        const {type, tasks, completedTasks, goals} = req.body;

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
        const slides = google.slides({version: 'v1', auth: oauth2Client});

        let title = "Generated Presentation";
        if (type === 'project-dashboard') title = `Project Status - ${new Date().toLocaleDateString()}`;
        if (type === 'standup') title = `Daily Standup - ${new Date().toLocaleDateString()}`;
        if (type === 'sprint-planning') title = `Sprint Planning - ${new Date().toLocaleDateString()}`;
        if (type === 'progress-report') title = `Progress Report - ${new Date().toLocaleDateString()}`;

        const response = await slides.presentations.create({
            requestBody: {title},
        });

        const presId = response.data.presentationId;
        if (!presId) throw new Error("Could not create presentation");

        const requests: any[] = [];

        const firstSlide = response.data.slides?.[0];
        if (firstSlide && firstSlide.pageElements) {
            const titleElement = firstSlide.pageElements.find(
                (e: any) => e.shape?.placeholder?.type === 'CENTERED_TITLE' || e.shape?.placeholder?.type === 'TITLE'
            );
            if (titleElement?.objectId) {
                requests.push({
                    insertText: {
                        objectId: titleElement.objectId,
                        text: title
                    }
                });
            }

            const subtitleElement = firstSlide.pageElements.find(
                (e: any) => e.shape?.placeholder?.type === 'SUBTITLE'
            );
            if (subtitleElement?.objectId) {
                requests.push({
                    insertText: {
                        objectId: subtitleElement.objectId,
                        text: `Generated by TaskPilot AI`
                    }
                });
            }
        }

        const slide2Id = `slide_content_${Date.now()}`;
        requests.push({
            createSlide: {
                objectId: slide2Id,
                slideLayoutReference: {predefinedLayout: 'BLANK'}
            }
        });

        const titleBoxId = `textbox_title_${Date.now()}`;
        requests.push({
            createShape: {
                objectId: titleBoxId,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                    pageObjectId: slide2Id,
                    size: {height: {magnitude: 60, unit: 'PT'}, width: {magnitude: 600, unit: 'PT'}},
                    transform: {scaleX: 1, scaleY: 1, translateX: 50, translateY: 30, unit: 'PT'}
                }
            }
        });

        requests.push({
            insertText: {
                objectId: titleBoxId,
                text: "Executive Summary"
            }
        });

        const textBoxId = `textbox_body_${Date.now()}`;
        requests.push({
            createShape: {
                objectId: textBoxId,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                    pageObjectId: slide2Id,
                    size: {height: {magnitude: 300, unit: 'PT'}, width: {magnitude: 600, unit: 'PT'}},
                    transform: {scaleX: 1, scaleY: 1, translateX: 50, translateY: 100, unit: 'PT'}
                }
            }
        });

        let textContent = "";
        try {
            const prompt = `You are a professional assistant generating a 3-5 bullet point slide summary for a "${title}" presentation.
        Use this data:
        - Pending Tasks: ${JSON.stringify((tasks || []).map((t: any) => t.title))}
        - Completed Tasks: ${JSON.stringify((completedTasks || []).map((t: any) => t.title))}
        - Goals/Habits: ${JSON.stringify((goals || []).map((g: any) => g.title))}
        Keep it concise, plain text only, no markdown formatting like ** or ##, just use standard bullet points (-). Make it professional.`;

            const aiRes = await generateAIContent({
                model: getValidModel(req.body.model),
                contents: prompt
            });
            textContent = aiRes.text || "Summary generated successfully.";
        } catch (err) {
            console.error("AI generation failed for slides:", err);
            textContent = `${title}\n\nTasks Pending: ${tasks?.length || 0}\nCompleted: ${completedTasks?.length || 0}`;
        }

        requests.push({
            insertText: {
                objectId: textBoxId,
                text: textContent
            }
        });

        if (requests.length > 0) {
            await slides.presentations.batchUpdate({
                presentationId: presId,
                requestBody: {requests}
            });
        }

        res.json(response.data);
    } catch (error: any) {
        console.error('Error creating presentation:', error);
        sendInternalError(res, error);
    }
};

export const createSpreadsheet = async (req: Request, res: Response) => {
    try {
        const accessToken = (req as any).headers["x-workspace-token"];
        if (!accessToken) return res.status(401).send("No access token");

        const {title, data} = req.body;
        const cleanTitle = typeof title === 'string' ? title.trim().substring(0, 500) : 'Untitled Spreadsheet';
        const cleanData = Array.isArray(data) ? data.slice(0, 1000).map((row: any) =>
            Array.isArray(row) ? row.slice(0, 100).map((cell: any) => String(cell).substring(0, 1000)) : []
        ) : [];

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({access_token: accessToken, token_type: 'Bearer'});
        const sheets = google.sheets({version: 'v4', auth: oauth2Client});

        const spreadsheet = await sheets.spreadsheets.create({
            requestBody: {properties: {title: cleanTitle}}
        });

        if (spreadsheet.data.spreadsheetId) {
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheet.data.spreadsheetId,
                range: 'Sheet1!A1',
                valueInputOption: 'USER_ENTERED',
                requestBody: {values: cleanData}
            });
        }

        res.json(spreadsheet.data);
    } catch (error: any) {
        console.error('Error creating Google Sheet:', error);
        sendInternalError(res, error);
    }
};
