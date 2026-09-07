import adapter from '@sveltejs/adapter-static';

// Set by the Pages workflow to the repo name (e.g. /openPlan3D) so assets
// resolve under the project subpath. Empty locally and for root-domain hosts.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		paths: { base, relative: false }
	}
};

export default config;
