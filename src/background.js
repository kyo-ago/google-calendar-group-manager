let createContextMenus = (param) => {
	chrome.contextMenus.create(Object.assign({
		parentId: 'CalendarGroupTop',
		documentUrlPatterns: ['https://calendar.google.com/calendar/*']
	}, param));
};

let createPromiseCallback = (result, reject) => {
	return (arg) => {
		chrome.runtime.lastError ? result(arg) : reject(chrome.runtime.lastError);
	};
}

let getAuthToken = (param) => {
	return new Promise((result, reject) => {
		chrome.identity.getAuthToken({ interactive: true }, createPromiseCallback(result, reject));
	}).catch((err) => console.log(err));
};

let setAllContextMenus = () => {
	chrome.contextMenus.removeAll(() => {
		createContextMenus({
			id: 'CalendarGroupTop',
			title: 'Calendar Group',
			parentId: undefined
		});
		chrome.storage.local.get('calendarGroup', (value) => {
			let calendarGroup = value.calendarGroup;
			(calendarGroup || []).forEach((group) => {
				createContextMenus({
					id: 'CalendarGroup:' + group.ids,
					title: group.name
				});
			});
			createContextMenus({
				id: 'CalendarGroupCreate',
				title: 'add current group'
			});
			createContextMenus({
				id: 'ClearCalendarGroup',
				title: 'clear all group'
			});
			createContextMenus({
				id: 'ClearAuthToken',
				title: 'clear auth token'
			});
		});
	});
};

let timeout;
function refreshContextMenus(tabId) {
	clearInterval(timeout);
	timeout = setTimeout(() => {
		chrome.tabs.get(tabId, (tab) => {
			if (!tab) {
				return;
			}
			if (!tab.url) {
				return;
			}
			if (!tab.url.match(/^https:\/\/calendar\.google\.com\//)) {
				return;
			}
			setAllContextMenus();
		});
	}, 3000);
}

let fetchApi = (url, param) => {
	let baseUrl = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
	param = param || {
		'headers': {}
	};
	return new Promise((resolve, reject) => {
		getAuthToken().then((token) => {
			Object.assign(param.headers, {
				'Authorization': 'Bearer ' + token
			});
			fetch(`${baseUrl}{url}`, param).then(resolve, reject);
		});
	});
};

let fetchSelectedCalendar = () => {
	let fields = [
		'summary',
		'backgroundColor',
		'colorId',
		'deleted',
		'foregroundColor',
		'id',
		'selected',
	].join('%2C');
	return fetchApi(`?maxResults=250&fields=items(${fields})`).then((res) => res.json());
}

function createGroup (clickData) {
	let name = prompt('group name');
	fetchSelectedCalendar().then((json) => {
		let ids = json.items
			.filter((item) => item.selected)
			.map((item) => item.id).join(':')
		;
		createContextMenus({
			id: `CalendarGroup:${ids}`,
			title: name
		});
		chrome.storage.local.get('calendarGroup', (value) => {
			chrome.storage.local.set({'calendarGroup': (value.calendarGroup || []).concat({
				name: name,
				ids: ids,
			})}, () => {
				setAllContextMenus();
			});
		});
	});
}

function getBodyParam (selected, item) {
	delete item['id'];
	return {
		body: JSON.stringify(Object.assign({}, item, {
			'selected': selected
		}))
	};
}

function selectGroup (menuItemId) {
	let ids = menuItemId.replace(/^CalendarGroup:/, '').split(/:/);
	fetchSelectedCalendar().then((json) => {
		let items = json.items.filter((item) => !item.deleted);
		let changeCalendarState = (state) => {
			return items
				.filter((item) => state === ids.includes(item.id))
				.filter((item) => state != item.selected)
				.map((item) => {
					let id = encodeURIComponent(item.id);
					let p = Object.assign({}, param, getBodyParam(state, item));
					return fetchApi(`/${id}`, p);
				})
			;
		}
		let param = {
			method: 'PUT',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			}
		};
		let unselectPromises = changeCalendarState(false);
		let selectPromises = changeCalendarState(true);
		Promise.all(selectPromises.concat(unselectPromises)).then(() => {
			chrome.tabs.reload();
		});
	});
}

chrome.contextMenus.onClicked.addListener((clickData) => {
	if (clickData.menuItemId === 'CalendarGroupCreate') {
		createGroup(clickData.menuItemId);
		return;
	}
	if (clickData.menuItemId === 'ClearCalendarGroup') {
		if (!confirm('clear all group?')) {
			return;
		}
		chrome.storage.local.clear(() => {
			chrome.contextMenus.removeAll(() => {
				chrome.tabs.reload();
			});
		});
		return;
	}
	if (clickData.menuItemId.match(/^ClearAuthToken/)) {
		getAuthToken().then((token) => {
			let promises = [
				(new Promise((resolve, reject) => {
					chrome.identity.removeCachedAuthToken({ token }, createPromiseCallback(resolve, reject));
				})),
				fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
			];
			return Promise.all(promises);
		}).then(getAuthToken);
		return;
	}
	if (clickData.menuItemId.match(/^CalendarGroup:/)) {
		selectGroup(clickData.menuItemId);
		return;
	}
});

chrome.runtime.onInstalled.addListener(getAuthToken);
chrome.tabs.onUpdated.addListener(refreshContextMenus);
