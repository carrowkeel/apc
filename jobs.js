import { cacheString } from '/apc/cache.js';
import { generateID } from '/apc/common.js';

export const pollResult = async (url, init_time=Math.round(new Date().getTime() / 1000), timeout=600, increment=5) => {
	const time_offset = Math.round(new Date().getTime() / 1000) - init_time;
	let retries = -1;
	while ((retries === -1 ? 0 : time_offset) + (++retries * (retries * increment) / 2) <= timeout) {
		await new Promise(resolve => setTimeout(resolve, increment * retries * 1000));
		try {
			const response = await fetch(url);
			if (!response.ok)
				throw 'Request failed';
			return response;
		} catch (e) {
			// Depending on fetch error, maybe stop polling
		}
	}
	throw 'Failed to load S3 object';
};

const deployScript = async (worker, request) => {
	const script_uri = request.script_uri || await cacheString(`/job_scripts/${request.request_id}.${request.framework}`, request.script, request.framework === 'js' ? 'application/javascript' : undefined);
	worker.postMessage(Object.assign({}, request, {type: 'request', script_uri}));
};

export const attachWorker = async (elem) => {
	const worker = new Worker('/apc/worker.js');
	elem.addEventListener('deploy', e => {
		const request = e.detail;
		deployScript(worker, request);
	});
	elem.addEventListener('worker_message', e => {
		const request = e.detail;
		worker.postMessage(request);
	});
	worker.addEventListener('message', async e => {
		const request = e.data;
		switch (true) {
			case request.type === 'error':
				elem.dispatchEvent(new CustomEvent('worker_error', {detail: request}));
				break;
			default:
				elem.dispatchEvent(new CustomEvent('worker_response', {detail: request}));
		}
	});
	worker.addEventListener('error', async e => {
		elem.dispatchEvent(new CustomEvent('error', {detail: {error: e.message}}));
	});
	elem.addEventListener('worker_terminate', e => {
		worker.terminate();
	});
	window.addEventListener('beforeunload', e => {
		worker.terminate();
	});
};

export const collect = async (result) => {
	const parts = [];
	for (const job of result.jobs) {
		const result_part = job.job_id ? await pollResult(`/results/${job.job_id}.json`, result.time) : [];
		if (result_part === null)
			throw 'Empty result received';
		parts.push(result_part);
	}
	return parts;
};
