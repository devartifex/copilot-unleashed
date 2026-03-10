import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pollForToken, validateGitHubToken } from '$lib/server/auth/github';
import { config } from '$lib/server/config';
import { logSecurity } from '$lib/server/security-log';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	if (!locals.session) {
		return json({ error: 'No session available' }, { status: 500 });
	}

	const deviceCode = locals.session.githubDeviceCode;
	const expiry = locals.session.githubDeviceExpiry;

	if (!deviceCode) {
		return json({ error: 'No active device flow. Call /start first.' }, { status: 400 });
	}

	if (expiry && Date.now() > expiry) {
		delete locals.session.githubDeviceCode;
		delete locals.session.githubDeviceExpiry;
		await new Promise<void>((resolve, reject) =>
			locals.session!.save((err?) => (err ? reject(err) : resolve()))
		);
		return json({ status: 'expired' });
	}

	try {
		const result = await pollForToken(deviceCode);

		if (result.status === 'pending' || result.status === 'slow_down') {
			return json({ status: result.status });
		}

		if (result.status === 'access_denied') {
			delete locals.session.githubDeviceCode;
			delete locals.session.githubDeviceExpiry;
			await new Promise<void>((resolve, reject) =>
				locals.session!.save((err?) => (err ? reject(err) : resolve()))
			);
			return json({ status: 'access_denied' });
		}

		if (result.status === 'expired') {
			delete locals.session.githubDeviceCode;
			delete locals.session.githubDeviceExpiry;
			await new Promise<void>((resolve, reject) =>
				locals.session!.save((err?) => (err ? reject(err) : resolve()))
			);
			return json({ status: 'expired' });
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
				ip: getClientAddress(),
			});
			return json(
				{
					status: 'forbidden',
					error: 'Your GitHub account is not authorized to use this application.',
				},
				{ status: 403 }
			);
		}

		// Regenerate session to prevent session fixation, then save
		const token = result.token;
		await new Promise<void>((resolve, reject) =>
			locals.session!.regenerate((err?) => (err ? reject(err) : resolve()))
		);
		locals.session!.githubToken = token;
		locals.session!.githubUser = user;
		locals.session!.githubAuthTime = Date.now();
		await new Promise<void>((resolve, reject) =>
			locals.session!.save((err?) => (err ? reject(err) : resolve()))
		);

		logSecurity('info', 'auth_success', { user: user.login });
		return json({ status: 'authorized', githubUser: user.login });
	} catch (err) {
		console.error('GitHub device flow poll error:', err);
		return json({ error: 'Device flow polling failed' }, { status: 500 });
	}
};
