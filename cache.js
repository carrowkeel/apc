
const getOptions = (update=[], defaults={}, key_name='site_options') => {
	const parseJSON = (json_string, defaults={}) => {
		try {
			if (json_string === null)
				throw 'Empty JSON string';
			return JSON.parse(json_string);
		} catch (e) {
			return defaults;
		}
	};
	const json_options = parseJSON(localStorage.getItem(key_name), defaults);
	for (const [key, value] of update)
		json_options[key] = value;
	localStorage.setItem(key_name, JSON.stringify(json_options));
	return json_options;
};

export const hashKey = async (params) => {
	const data = new TextEncoder().encode(JSON.stringify(params));
	const hashBuffer = await crypto.subtle.digest('SHA-1', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const cacheStream = async (key, stream) => {
	const reader = stream.getReader();
	const chunks = [];
	let result;
	while (!(result = await reader.read()).done) {
		chunks.push(result.value);
	}
	const json_string = JSON.stringify(chunks);
	const response = new Response(json_string, {
		headers: { 'Content-Type': 'application/json' }
	});
	const cache = await caches.open('apc_cache');
	await cache.put(key, response);
};

export const streamFromCache = async (uri) => {
	if (!(await caches.open('apc_cache').then(cache => cache.match(uri))))
		throw 'Cached object does not exist';
	const array = await fetch(uri).then(res => res.json());
	return new ReadableStream({
		start(controller) {
			for (const item of array)
				controller.enqueue(item);
			controller.close();
		}
	});
};

export const cacheString = async (key, string, content_type='text/plain') => {
	await caches.open('apc_cache').then(cache => cache.put(new Request(key), new Response(string, {headers: {'Content-Type': content_type}})));
	return key;
};

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

export const getIDBObject = (db_key, table, key, data) => new Promise(async (resolve, reject) => {
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

export const deleteIDBObject = (db_key, table, key) => new Promise(async (resolve, reject) => {
	const db = await openIDB(db_key, table);
	const transaction = db.transaction([table], 'readwrite');
	const store = transaction.objectStore(table);
	const request = store.delete([key]);
	request.onsuccess = (e) => resolve(0);
	request.onerror = (e) => reject(e.target.error);
});

export const listIDBTable = (db_key, table) => new Promise(async (resolve, reject) => {
	const db = await openIDB(db_key, table);
	const transaction = db.transaction([table], 'readonly');
	const store = transaction.objectStore(table);
	const request = store.openCursor();
	const keys = [];
	request.onsuccess = (e) => {
		const cursor = e.target.result;
		if (cursor) {
			keys.push(cursor.value.key);
			cursor.continue();
		}
		resolve(keys);
		db.close();
	};
	request.onerror = (e) => {
		reject('Error listing keys: ', e.target.error);
		db.close();
	};
});
