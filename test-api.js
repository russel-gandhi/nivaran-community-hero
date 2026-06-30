import fetch from 'node-fetch';

async function test() {
  const req = {
    category: "Street & Civil",
    subtag: "Pothole",
    description: "Huge pothole",
    evidenceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    evidenceType: "photo"
  };

  try {
    const res = await fetch('http://localhost:3000/api/verify-evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    
    const text = await res.text();
    console.log("Response:", text);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

test();
