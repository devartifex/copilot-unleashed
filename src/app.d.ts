declare global {
	namespace App {
		interface Locals {
			session: {
				githubToken?: string;
				githubUser?: { login: string; name: string };
				githubAuthTime?: number;
				githubDeviceCode?: string;
				githubDeviceExpiry?: number;
				regenerate(callback: (err?: any) => void): void;
				save(callback: (err?: any) => void): void;
				destroy(callback: (err?: any) => void): void;
			} | null;
		}
	}
}

export {};
