export const fetchCalendarEvents = async (accessToken: string, timeMin: string, timeMax: string) => {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Failed to fetch calendar events");
  return res.json();
};

export const createCalendarEvent = async (accessToken: string, event: { summary: string, start: string, end: string }) => {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: event.summary,
      start: { dateTime: event.start },
      end: { dateTime: event.end }
    })
  });
  if (!res.ok) throw new Error("Failed to create calendar event");
  return res.json();
};

export const createGoogleDoc = async (accessToken: string, title: string, content: string) => {
  // 1. Create empty doc
  const res = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });
  if (!res.ok) throw new Error("Failed to create Google Doc");
  const doc = await res.json();
  
  // 2. Insert content
  await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: content
          }
        }
      ]
    })
  });
  
  return doc;
};

export const createGoogleSlide = async (accessToken: string, title: string, subtitle: string) => {
  const res = await fetch('https://slides.googleapis.com/v1/presentations', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });
  if (!res.ok) throw new Error("Failed to create Google Slide");
  return res.json();
};

export const createGoogleSheet = async (accessToken: string, title: string, data: any[][]) => {
  // 1. Create spreadsheet
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties: { title } })
  });
  if (!res.ok) throw new Error("Failed to create Google Sheet");
  const sheet = await res.json();
  
  // 2. Insert data
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: data
    })
  });
  
  return sheet;
};
