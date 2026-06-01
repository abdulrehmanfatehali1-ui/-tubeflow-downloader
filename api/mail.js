const https = require('https');

module.exports = async (req, res) => {
  // Setup CORS Headers for browser security
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Parse queries
  const action = req.query.action;
  let targetUrl = 'https://www.1secmail.com/api/v1/';

  if (action === 'gen') {
    // Generate a set of random addresses
    targetUrl += '?action=genEmailAddresses&count=5';
  } else if (action === 'getMessages') {
    const { login, domain } = req.query;
    if (!login || !domain) {
      return res.status(400).json({ error: 'Missing login or domain parameters' });
    }
    targetUrl += `?action=getMessages&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`;
  } else if (action === 'readMessage') {
    const { login, domain, id } = req.query;
    if (!login || !domain || !id) {
      return res.status(400).json({ error: 'Missing login, domain or id parameters' });
    }
    targetUrl += `?action=readMessage&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${encodeURIComponent(id)}`;
  } else {
    return res.status(400).json({ error: 'Invalid or missing action' });
  }

  // Proxy the request to 1secmail
  try {
    const responseData = await new Promise((resolve, reject) => {
      https.get(targetUrl, (response) => {
        let dataBody = '';
        response.on('data', chunk => dataBody += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(dataBody));
          } catch (e) {
            resolve(dataBody);
          }
        });
      }).on('error', (err) => {
        reject(err);
      });
    });

    res.status(200).json(responseData);
  } catch (err) {
    console.error('[API Proxy] Error fetching from 1secmail:', err.message);
    res.status(500).json({ error: 'Failed to communicate with mail nodes', details: err.message });
  }
};
