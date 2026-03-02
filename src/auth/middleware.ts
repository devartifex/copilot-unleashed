import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logSecurity } from '../security-log.js';

export function requireGitHub(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session?.githubToken) {
    res.status(401).json({ error: 'GitHub authentication required' });
    return;
  }

  // Token freshness check — force re-auth after configured max age
  const authTime = req.session.githubAuthTime;
  if (authTime && Date.now() - authTime > config.tokenMaxAge) {
    logSecurity('info', 'token_expired', {
      user: req.session.githubUser?.login,
      reason: 'max_age_exceeded',
    });
    req.session.destroy(() => {});
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  next();
}
