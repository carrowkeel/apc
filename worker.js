'use strict';

importScripts('/pyodide/dist/pyodide.js');
const generateID = (k=8) => Array(k).fill(0).map(() => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 62))).join('');

const get_python_imported_libraries = (script_text) => {
	const import_regex = /^\s*(?:from\s+([^\s]+)\s+)?import\s+([^\n;]+)/gm;
	const imports = new Set();
	let match;
	while ((match = import_regex.exec(script_text)) !== null) {
		if (match[1]) {
			const module_name = match[1].split('.')[0];
			imports.add(module_name);
		} else {
			const modules_part = match[2];
			const modules = modules_part
				.split(',')
				.map((s) => s.trim().split(/\s+as\s+/)[0].split('.')[0]);
			modules.forEach((module) => imports.add(module));
		}
	}
	return Array.from(imports);
};

const saveBase64Image = async (base64_data) => {
	const cache_id = generateID();
	const image_uri = `/analyses/plot_${cache_id}.png`;
	const blob = new Blob([Uint8Array.from(atob(base64_data), c => c.charCodeAt(0))], { type: 'image/png' });
	const cache = await caches.open('apc_cache');
	await cache.put(new Request(image_uri), new Response(blob, { headers: { 'Content-Type': 'image/png' }}));
	return image_uri;
};

const deployToWorker = (queue, worker_id, request, params, request_id=generateID()) => new Promise(resolve => {
	queue[worker_id][2] += 1;
	queue[worker_id][1].postMessage({request_id, type: 'sub_request', script_uri: request.script_uri, framework: request.framework, function_name: request.function_name, params});
	const handler = e => {
		const result = e.data;
		if (result.request_id !== request_id)
			return;
		resolve(result.data);
		queue[worker_id][2] -= 1;
		queue[worker_id][1].removeEventListener('message', handler);
	};
	queue[worker_id][1].addEventListener('message', handler);
});

const distributedRun = (queue, request, params, worker_limit=navigator.hardwareConcurrency || 4) => {
	const workers = Object.values(queue);
	const workers_load = workers.map(worker => worker[2]);
	switch(true) {
		case workers.length === 0 || (Math.min.apply(null, workers_load) > 0 && workers.length < worker_limit): {
			const worker = new Worker('./worker.js');
			const worker_id = generateID(8);
			queue[worker_id] = [worker_id, worker, 0];
			return deployToWorker(queue, worker_id, request, params);
		}
		default: {
			const worker_id = workers.sort((a,b) => a[2] - b[2])[0][0];
			return deployToWorker(queue, worker_id, request, params);
		}
	}
};

const runPyScript = async (request, queue, function_name='run', cache={}) => {
	if (!cache.pyodide) {
		cache.pyodide = await loadPyodide({stderr: () => {}});
		await cache.pyodide.loadPackage(['numpy'], {messageCallback: () => {}, errorCallback: () => {}});
	}
	const js_module = {
		distribute: async (function_name, param_set) => {
			const sub_request = Object.assign({}, request, {function_name});
			const param_set_js = param_set.toJs({dict_converter: it => Object.fromEntries(it)});
			const results = await Promise.all(param_set_js.map(params => distributedRun(queue, sub_request, params)));
			return cache.pyodide.toPy(results);
		},
		message: message_py => {
			const message = message_py.toJs({dict_converter: it => Object.fromEntries(it)});
			self.postMessage(Object.assign(message, {request_id: request.request_id}));
		},
		increment_step: t => new Promise(resolve => {
			const handler = async e => {
				const step_request = e.data;
				if (step_request.request_id !== request.request_id || step_request.type !== 'step')
					return;
				resolve(step_request.step);
				self.removeEventListener('message', handler);
			};
			self.addEventListener('message', handler);
		})
	};
	const js_module_name = `js_functions_${request.request_id}`;
	cache.pyodide.registerJsModule(js_module_name, js_module);
	cache.pyodide.globals.set('params', cache.pyodide.toPy(request.params));
	if (cache.scripts === undefined || cache.scripts[request.script_uri] === undefined) {
		if (cache.scripts === undefined)
			cache.scripts = {};
		const script_text = await fetch(request.script_uri).then(res => res.text());
		cache.scripts[request.script_uri] = script_text;
	}
	const imported_libraries = request.libraries !== undefined ? request.libraries.split(',') : get_python_imported_libraries(cache.scripts[request.script_uri]);
	if (imported_libraries.length > 0)
		await cache.pyodide.loadPackage(imported_libraries, {messageCallback: () => {}, errorCallback: () => {}}); // Will throw exception if libraries are not in pyodide
	await cache.pyodide.runPythonAsync(`import asyncio\nfrom ${js_module_name} import distribute, message, increment_step`);
	if (imported_libraries.includes('matplotlib'))
		await cache.pyodide.runPythonAsync(`import os\nos.environ['MPLBACKEND'] = 'AGG'\nimport matplotlib.pyplot as plt\nimport io\nimport base64\nsaved_images = []\n\ndef save_image():\n\timage_bytes = io.BytesIO()\n\tplt.savefig(image_bytes, format='png')\n\tplt.close()\n\timage_bytes.seek(0)\n\tsaved_images.append(base64.b64encode(image_bytes.read()).decode('utf-8'))\n\timage_bytes.close()\n\nplt.show = save_image`);
	await cache.pyodide.runPythonAsync(`${cache.scripts[request.script_uri]}\n\noutput=await ${function_name}(params)`);
	const output_proxy = cache.pyodide.globals.get('output');
	const saved_images_proxy = cache.pyodide.globals.get('saved_images');
	const result = output_proxy?.toJs ? output_proxy.toJs({dict_converter: it => Object.fromEntries(it)}) : output_proxy;
	const saved_images = saved_images_proxy?.toJs ? saved_images_proxy.toJs({dict_converter: it => Object.fromEntries(it)}) : saved_images_proxy;
	output_proxy?.destroy ? output_proxy.destroy() : 0;
	saved_images_proxy?.destroy ? saved_images_proxy.destroy() : 0;
	cache.pyodide.unregisterJsModule(js_module_name);
	if (saved_images && saved_images.length > 0)
		return Promise.all(saved_images.map(saveBase64Image));
	else
		return result;
};

const runJSScript = async (request, queue, function_name='run') => {
	const module = await import(request.script_uri);
	self.message = message => {
		self.postMessage(Object.assign(message, {request_id: request.request_id}));
	};
	self.increment_step = t => new Promise(resolve => {
		const handler = async e => {
			const step_request = e.data;
			if (step_request.request_id !== request.request_id || step_request.type !== 'step')
				return;
			resolve(step_request.step);
			self.removeEventListener('message', handler);
		};
		self.addEventListener('message', handler);
	});
	return module[function_name](request.params);
};

const processRequest = async (request, queue, cache) => {
	try {
		switch(request.framework) {
			case 'py':
				return await runPyScript(request, queue, request.function_name, cache);
			case 'js':
				return await runJSScript(request, queue, request.function_name);
		}
	} catch (e) {
		self.postMessage({request_id: request.request_id, type: 'error', error: e});
	}
};

const main = async (worker_queue = {}, cache = {}, job_queue = []) => {
	let is_processing = false;
	const processQueue = async () => {
		if (is_processing)
			return;
		is_processing = true;
		while (job_queue.length > 0) {
			const job = job_queue.shift();
			const result = await processRequest(job, worker_queue, cache);
			self.postMessage({request_id: job.request_id, type: 'result', data: result});
		}
		is_processing = false;
	};
	self.addEventListener('message', async e => {
		const request = e.data;
		if (request.type === 'request') {
			const result = await processRequest(request, worker_queue, cache);
			self.postMessage({request_id: request.request_id, type: 'result', data: result});
		} else if (request.type === 'sub_request') {
			job_queue.push(request);
			processQueue();
		}
	});
};

main();