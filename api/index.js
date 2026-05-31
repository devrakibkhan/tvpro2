// api/index.js

const PORTAL_URL = "http://main.light-ott.net"; 
const MAC_ADDRESS = "00:1A:79:7A:DB:FD";

// পোর্টালের API থেকে ডেটা আনার জন্য MAG Box-এর অরিজিনাল User-Agent (সার্ভারকে ধোঁকা দেওয়ার জন্য)
const API_USER_AGENT = "Mozilla/5.0 (QtEmbedded; U; Linux; C)";

// আপনার আইপিটিভি প্লেয়ারের জন্য User-Agent
const PLAYER_USER_AGENT = "MySTB Player";

async function getTokenAndCookie() {
  const headers = {
    "Cookie": `mac=${MAC_ADDRESS}`,
    "User-Agent": API_USER_AGENT
  };

  try {
    const handshakeUrl = `${PORTAL_URL}?type=stb&action=handshake&token=&JsHttpRequest=1-xml`;
    const response = await fetch(handshakeUrl, { headers });
    const textData = await response.text(); 
    
    try {
      const data = JSON.parse(textData);
      const token = data?.js?.token || '';
      return { token, cookie: `mac=${MAC_ADDRESS}` };
    } catch (e) {
      return { token: '', cookie: `mac=${MAC_ADDRESS}` };
    }
  } catch (error) {
    return { token: '', cookie: `mac=${MAC_ADDRESS}` };
  }
}

export default async function handler(req, res) {
  // ১. CORS Policy ফিক্স করা হলো যেন যেকোনো প্লেয়ার বা ব্রাউজার থেকে এক্সেস পায়
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const channelCmd = req.query.channel;

  // ২. চ্যানেল প্লে করার রিকোয়েস্ট (যখন লিংকে channel থাকবে)
  if (channelCmd) {
    const auth = await getTokenAndCookie();
    
    const headers = {
      "Cookie": auth.cookie,
      "Authorization": `Bearer ${auth.token}`,
      "User-Agent": API_USER_AGENT 
    };

    const linkUrl = `${PORTAL_URL}?type=itv&action=create_link&cmd=${encodeURIComponent(channelCmd)}&JsHttpRequest=1-xml`;
    
    try {
      const response = await fetch(linkUrl, { headers });
      const data = await response.json();
      let streamUrl = data?.js?.cmd || "";

      if (streamUrl.includes(" ")) {
        streamUrl = streamUrl.split(" ").pop(); 
      }

      if (streamUrl && streamUrl.startsWith("http")) {
        // ভিডিও লিংকের সাথে MySTB Player-এর User-Agent যুক্ত করে দেওয়া হলো
        const finalStreamUrl = `${streamUrl}|User-Agent=${PLAYER_USER_AGENT}`;
        return res.redirect(302, finalStreamUrl);
      } else {
        return res.status(404).send("Stream URL not found or MAC blocked by Server IP.");
      }
    } catch (error) {
      return res.status(500).send("Error creating stream link.");
    }
  }

  // ৩. প্লেলিস্ট রিকোয়েস্ট (ডিফল্ট)
  const auth = await getTokenAndCookie();
  
  const headers = {
    "Cookie": auth.cookie,
    "Authorization": `Bearer ${auth.token}`,
    "User-Agent": API_USER_AGENT 
  };

  const channelsUrl = `${PORTAL_URL}?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
  
  try {
    const response = await fetch(channelsUrl, { headers });
    const textData = await response.text();
    let data;
    
    try {
      data = JSON.parse(textData);
    } catch (e) {
      return res.status(500).send("Error: Server blocked the request or sent invalid data.");
    }

    const channels = data?.js?.data || [];
    if (channels.length === 0) {
      return res.status(404).send("No channels found or MAC blocked.");
    }

    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${host}`;

    let m3u = "#EXTM3U\n";

    for (const channel of channels) {
      const name = channel.name || "Unknown Channel";
      const id = channel.id || "";
      const cmd = channel.cmd || "";
      const logo = channel.logo || "";

      // M3U8 ফাইলের ভেতরে প্লেয়ারকে নির্দেশ দেওয়া হলো যেন সে MySTB Player-এর User-Agent ব্যবহার করে
      m3u += `#EXTINF:-1 tvg-id="${id}" tvg-logo="${logo}" user-agent="${PLAYER_USER_AGENT}",${name}\n`;
      m3u += `#EXTVLCOPT:http-user-agent=${PLAYER_USER_AGENT}\n`;
      m3u += `${baseUrl}/api?channel=${encodeURIComponent(cmd)}\n`;
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u8"');
    return res.status(200).send(m3u);

  } catch (error) {
    return res.status(500).send("Error connecting to server.");
  }
}
