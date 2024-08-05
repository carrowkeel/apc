import { getIDBObject, deleteIDBObject } from '/apc/cache.js';
import { addPopup, formError, formNotice } from '/apc/form.js';

const hooks = elem => [
	['[data-action="login"]', 'click', e => {
		const callback = async (form_data, form) => {
			if (form.querySelector('[data-action="submit"]').classList.contains('loading'))
				return;
			form.querySelector('[data-action="submit"]').classList.add('loading');
			try {
				const response = await fetch('https://d.modelrxiv.org/auth', {method: 'POST', body: JSON.stringify(form_data)});
				if (!response.ok)
					throw 'Authentication failed';
				if (form_data['action'] === 'register') {
					return formNotice(form, 'Successfully registered. You can now use the credentials you created to login.');
				}
				const {data: credentials} = await response.json();
				credentials.signed = Object.fromEntries(Object.entries(credentials.signed).map(([key, value]) => [key.replace('CloudFront-', ''), value]));
				await getIDBObject('apc', 'auth', 'credentials', credentials);
				elem.dataset.auth = 'auth';
				window.dispatchEvent(new Event('auth'));
				form.closest('.popup').remove();
			} catch (e) {
				form.querySelector('[data-action="submit"]').classList.remove('loading');
				if (form_data['action'] === 'register')
					formError(form, 'Failed to register');
				else
					formError(form, 'Failed to authenticate');
			}
		};
		addPopup(document.body, 'Login / Register', [
			{name: 'login', label: 'Login', form: [{type: 'hidden', name: 'action', value: 'login'}, {type: 'text', name: 'user_name', label: 'Nickname'}, {type: 'password', name: 'user_password', label: 'Password', value: 'current-password'}]},
			{name: 'register', label: 'Register', form: [{type: 'hidden', name: 'action', value: 'register'}, {type: 'text', name: 'user_name', label: 'Nickname'}, {type: 'password', name: 'user_password', label: 'Password', value: 'new-password'}, {type: 'password', name: 'validate_password', label: 'Repeat password', value: 'new-password'}]}
		], callback);
	}],
	['[data-action="logout"]', 'click', e => {
		deleteIDBObject('apc', 'auth', 'credentials');
		elem.dataset.auth = 'guest';
		window.location.href='/';
	}],
];

export const init = async (elem) => {
	addHooks(window, hooks(elem));
	const credentials = await getIDBObject('apc', 'auth', 'credentials');
	if (!credentials)
		return false;
	return fetch('https://d.modelrxiv.org/auth', {method: 'POST', body: JSON.stringify({action: 'verify', jwt: credentials.token})}).then(async res => {
		if (!res.ok)
			throw 'Authentication failed';
		elem.dataset.auth = 'auth';
	}).catch(e => {
		deleteIDBObject('apc', 'auth', 'credentials');
		elem.dataset.auth = 'guest';
	});
};