export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: Date;
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
    name: `TaskPilot_Backup_${new Date().toISOString().split('T')[0]}.json`,
    mimeType: 'application/json'
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

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
      title: `TaskPilot Summary - ${new Date().toLocaleDateString()}`
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
    if (t.dueDate) text += `Due: ${new Date(t.dueDate).toLocaleDateString()}\n`;
    text += "\n";
  });

  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
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
      title: `TaskPilot Tasks - ${new Date().toLocaleDateString()}`
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
    if (t.dueDate) text += `Due: ${new Date(t.dueDate).toLocaleDateString()}\n`;
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
              size: { width: { magnitude: 600, unit: "PT" }, height: { magnitude: 400, unit: "PT" } },
              transform: { scaleX: 1, scaleY: 1, translateX: 50, translateY: 50, unit: "PT" }
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
        title: `TaskPilot Tasks - ${new Date().toLocaleDateString()}`
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
      t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "", 
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
