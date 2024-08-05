'use strict';

const addHooks = (elem, hooks) => {
	for (const type of Object.keys(hooks.reduce((a,v)=>Object.assign(a, {[v[1]]: 1}), {}))) {
		elem.addEventListener(type, e => {
			for (const hook of hooks.filter(v=>v[1]===type)) {
				if (e.target === window || e.target.matches(hook[0]))
					hook[2](e);
			}
		}, true);
	}
};

const addModule = (elem, name, options={}, replace_element=false) => new Promise((resolve, reject) => {
	const module = replace_element ? elem : elem.appendChild(document.createElement('div'));
	module.dataset.module = name;
	Object.keys(options).forEach(k => typeof options[k] !== 'object' ? module.dataset[k] = options[k] : 0);
	module.dispatchEvent(new CustomEvent('render', {detail: {options}}));
	module.addEventListener('done', e => {
		resolve({module, data: e.detail});
	});
});

const initServiceWorker = (uri) => new Promise((resolve, reject) => {
	if ('serviceWorker' in navigator) {
		return navigator.serviceWorker.register(uri, {scope: '/'}).then(reg => {
			if (!reg.waiting && !reg.active) {
				reg.addEventListener('updatefound', () => {
					reg.installing.addEventListener('statechange', e => {
						if (e.target.state === "activated") {
							resolve();
						}
					});
				});
			} else
				resolve();
		}).catch(e => {
			console.log('Failed to register sw.js: ' + e);
			reject();
		});
	} else
		return reject();
});

const main = async () => {
	try {
		await initServiceWorker('/sw.js');
	} catch (e) {
		console.log('Failed to load Service Worker');
	}
	await import('/apc/common.js').then(module => addHooks(window, module.hooks));
	document.querySelectorAll('[data-module]').forEach(module_elem => {
		const module_name = module_elem.dataset.module;
		import(`/${module_name}.js`).then(module => module.init(module_elem));
	});
};

window.addEventListener('load', () => {
	main();
});
