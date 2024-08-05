'use strict';

const openIDB = (db_key, table) => new Promise((resolve, reject) => {
	const request = indexedDB.open(db_key, 1);
	request.onupgradeneeded = (e) => {
		const db = e.target.result;
		if (!db.objectStoreNames.contains(table)) {
			db.createObjectStore(table, { keyPath: ['key'] });
		}
	};
	request.onsuccess = (e) => resolve(e.target.result);
	request.onerror = (e) => reject('IndexedDB opening error: ', e.target.error);
});

const getIDBObject = (db_key, table, key, data) => new Promise(async (resolve, reject) => {
	const db = await openIDB(db_key, table);
	const transaction = db.transaction([table], data !== undefined ? 'readwrite' : 'readonly');
	const store = transaction.objectStore(table);
	const request = data !== undefined ? store.put({key, data}) : store.get([key]);
	request.onsuccess = (e) => {
		resolve(e.target.result?.data);
		db.close();
	};
	request.onerror = (e) => {
		reject(e.target.error);
		db.close();
	};
});

const signedURL = async (url) => {
	const signed_url = new URL(url);
	const credentials = await getIDBObject('apc', 'auth', 'credentials');
	signed_url.pathname = signed_url.pathname.replace('/user/', `/users/${credentials.user_id}/`);
	Object.entries(credentials.signed).forEach(credential_part => signed_url.searchParams.append(...credential_part));
	return signed_url.toString();
};

const cacheResponse = (request, response, cache_id) => {
	return caches.open(cache_id).then(async cache => {
		if (request.method !== 'POST' && request.method !== 'PUT' && ![206, 403, 416].includes(response.status))
			await cache.put(request, response.clone());
		return response;
	});
};

const routeRequest = async (request, cache_id, nocache_extensions=['js', 'py', 'css', 'txt', 'html', 'list', 'json'], valid_origins = ['https://modelrxiv.org', 'https://dora.modelrxiv.org', 'https://beta.modelrxiv.org', 'https://seqmash.com']) => {
	const url = new URL(request.url);
	const response = url.pathname.startsWith('/user/') ? await signedURL(url).then(signed_url => fetch(signed_url)) : await fetch(request);
	if (!valid_origins.includes(url.origin) || url.pathname === '/' || request.cache === 'no-cache')
		return response;
	if (!url.pathname.startsWith('/pyodide/') && nocache_extensions.includes(url.pathname.replace(/^.*?\.([^\.]+)$/, '$1')))
		return response;
	if (!response.ok && request.cache === 'reload')
		return response;
	return cacheResponse(request, response, cache_id);
};


self.addEventListener('fetch', async event => {
	const cache_id = 'apc_cache';
	if (event.request.cache === 'no-cache') {
		try {
			return await routeRequest(event.request);
		} catch (e) {
			return new Response('Internal Server Error', {status: 500});
		}
	}
	event.respondWith(caches.open(cache_id).then(cache => cache.match(event.request).then(async response => {
		try {
			return response || await routeRequest(event.request, cache_id);
		} catch (e) {
			return new Response('Internal Server Error', {status: 500});
		}
	})));
});

