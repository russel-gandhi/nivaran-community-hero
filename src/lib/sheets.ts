export async function exportReportsToSheets(reports: any[], accessToken: string): Promise<string> {
  // Create spreadsheet
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: `Reports Export - ${new Date().toLocaleDateString()}` }
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create spreadsheet');
  }

  const spreadsheet = await response.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  const rows = [
    ['Category', 'Subtag', 'Severity', 'Status', 'Tier', 'Created Date', 'Resolved Date']
  ];

  reports.forEach(report => {
    rows.push([
      report.categoryName || '',
      report.subtag || '',
      report.severity?.toString() || '',
      report.status || '',
      report.tier || '',
      report.createdAt ? new Date(report.createdAt).toLocaleString() : '',
      report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : ''
    ]);
  });

  // Update spreadsheet with values
  const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: rows
    })
  });

  if (!updateRes.ok) {
    throw new Error('Failed to write data to spreadsheet');
  }

  return spreadsheet.spreadsheetUrl;
}
