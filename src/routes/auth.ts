import { Router } from 'express';
import {
  requestDeviceCode,
  pollForToken,
  validateGitHubToken,
} from '../auth/github.js';
import { config } from '../config.js';
import { logSecurity } from '../security-log.js';

const router = Router();

// Start GitHub Device Flow
router.post('/github/device/start', async (req, res) => {
  try {
    const deviceData = await requestDeviceCode();
    req.session.githubDeviceCode = deviceData.device_code;
    req.session.githubDeviceExpiry = Date.now() + deviceData.expires_in * 1000;

    res.json({
      user_code: deviceData.user_code,
      verification_uri: deviceData.verification_uri,
      expires_in: deviceData.expires_in,
      interval: deviceData.interval,
    });
  } catch (err) {
    console.error('GitHub device flow start error:', err);
    res.status(500).json({ error: 'Failed to start device flow' });
  }
});

// Poll GitHub Device Flow
router.post('/github/device/poll', async (req, res) => {
  const deviceCode = req.session.githubDeviceCode;
  const expiry = req.session.githubDeviceExpiry;

  if (!deviceCode) {
    return res.status(400).json({ error: 'No active device flow. Call /start first.' });
  }

  if (expiry && Date.now() > expiry) {
    delete req.session.githubDeviceCode;
    delete req.session.githubDeviceExpiry;
    return res.json({ status: 'expired' });
  }

  try {
    const result = await pollForToken(deviceCode);

    if (result.status === 'pending' || result.status === 'slow_down') {
      return res.json({ status: result.status });
    }

    if (result.status === 'access_denied') {
      delete req.session.githubDeviceCode;
      delete req.session.githubDeviceExpiry;
      return res.json({ status: 'access_denied' });
    }

    if (result.status === 'expired') {
      delete req.session.githubDeviceCode;
      delete req.session.githubDeviceExpiry;
      return res.json({ status: 'expired' });
    }

    if (!result.token) throw new Error('Token missing in authorized response');

    const user = await validateGitHubToken(result.token);
    if (!user) throw new Error('Could not validate GitHub token');

    // Check allowed users list (if configured)
    if (
      config.allowedUsers.length > 0 &&
      !config.allowedUsers.includes(user.login.toLowerCase())
    ) {
      logSecurity('warn', 'auth_denied_not_allowed', {
        user: user.login,
        ip: req.ip,
      });
      return res.status(403).json({
        status: 'forbidden',
        error: 'Your GitHub account is not authorized to use this application.',
      });
    }

    // Regenerate session to prevent session fixation, then save before responding
    const token = result.token;
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve()))
    );
    req.session.githubToken = token;
    req.session.githubUser = user;
    req.session.githubAuthTime = Date.now();
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );

    logSecurity('info', 'auth_success', { user: user.login });
    res.json({ status: 'authorized', githubUser: user.login });
  } catch (err) {
    console.error('GitHub device flow poll error:', err);
    res.status(500).json({ error: 'Device flow polling failed' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Auth status — also validates token freshness
router.get('/status', (req, res) => {
  if (req.session?.githubToken) {
    const authTime = req.session.githubAuthTime;
    if (authTime && Date.now() - authTime > config.tokenMaxAge) {
      logSecurity('info', 'status_check_expired', {
        user: req.session.githubUser?.login,
      });
      req.session.destroy(() => {});
      return res.json({ authenticated: false, githubUser: null });
    }
  }

  res.json({
    authenticated: !!req.session?.githubToken,
    githubUser: req.session?.githubUser?.login || null,
  });
});

export { router as authRoutes };

