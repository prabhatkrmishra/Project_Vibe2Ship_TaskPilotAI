export const fetchCalendarEvents = async (accessToken: string, timeMin: string, timeMax: string) => {
  const res = await fetch(`/api/calendar/events?timeMin=${timeMin}&timeMax=${timeMax}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Failed to fetch calendar events");
  return res.json();
};

export const createCalendarEvent = async (accessToken: string, event: { summary: string, start: string, end: string }) => {
  const res = await fetch('/api/calendar/events', {
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
  const res = await fetch('/api/docs', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, content })
  });
  if (!res.ok) throw new Error("Failed to create Google Doc");
  return res.json();
};

export const generatePresentation = async (accessToken: string, reportData: any) => {
  const res = await fetch('/api/presentations/generate', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reportData)
  });
  if (!res.ok) throw new Error("Failed to generate Google Slide presentation");
  return res.json();
};

export const createGoogleSheet = async (accessToken: string, title: string, data: any[][]) => {
  const res = await fetch('/api/sheets', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, data })
  });
  if (!res.ok) throw new Error("Failed to create Google Sheet");
  return res.json();
};
