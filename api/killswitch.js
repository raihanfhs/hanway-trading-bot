// api/killswitch.js
// Vercel Serverless Function: Manual Kill Switch API endpoint
import { setKillSwitch, isKillSwitchActive } from '../lib/storage.js';

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const querySecret = req.query ? req.query.secret : null;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isQueryValid = querySecret === cronSecret;
    if (!isHeaderValid && !isQueryValid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
    }
  }

  try {
    if (req.method === 'POST') {
      const { active } = req.body || {};
      const shouldActivate = active === true || active === 'true' || active === 1;
      await setKillSwitch(shouldActivate);
      return res.status(200).json({
        success: true,
        killSwitchActive: shouldActivate,
        message: shouldActivate ? 'Kill switch diaktifkan. Bot berhenti bertransaksi.' : 'Kill switch dimatikan. Bot kembali aktif.'
      });
    }

    const currentStatus = await isKillSwitchActive();
    return res.status(200).json({
      success: true,
      killSwitchActive: currentStatus
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
