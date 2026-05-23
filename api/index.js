// api/index.js

const PORTAL_URL = "http://line.watchtivo-8k.com/server/load.php"; 
const MAC_ADDRESS = "00:1A:79:A9:E6:04";

async function getTokenAndCookie() {
  const headers = {
    "Cookie": `mac=${MAC_ADDRESS}`,
    "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)"
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
  const channelCmd = req.query.channel;

  // ১. চ্যানেল প্লে করার রিকোয়েস্ট (যখন লিংকে channel থাকবে)
  if (channelCmd) {
    const auth = await getTokenAndCookie();
    
    const headers = {
      "Cookie": auth.cookie,
      "Authorization": `Bearer ${auth.token}`,
      "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)"
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
        // 302 Redirect
        return res.redirect(302, streamUrl);
      } else {
        return res.status(404).send("Stream URL not found or MAC blocked.");
      }
    } catch (error) {
      return res.status(500).send("Error creating stream link.");
    }
  }

  // ২. প্লেলিস্ট রিকোয়েস্ট (ডিফল্ট)
  const auth = await getTokenAndCookie();
  
  const headers = {
    "Cookie": auth.cookie,
    "Authorization": `Bearer ${auth.token}`,
    "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)"
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

      m3u += `#EXTINF:-1 tvg-id="${id}" tvg-logo="${logo}",${name}\n`;
      // চ্যানেল প্লে করার নতুন লিংক
      m3u += `${baseUrl}/api?channel=${encodeURIComponent(cmd)}\n`;
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u8"');
    return res.status(200).send(m3u);

  } catch (error) {
    return res.status(500).send("Error connecting to server.");
  }
}
