let setAuthToken = () => {
	chrome.identity.getAuthToken({ interactive: true }, (token) => {
		chrome.storage.local.set({'token': token});
	});
};

let createContextMenus = (param) => {
	chrome.contextMenus.create(Object.assign({
		parentId: 'CalendarGroupTop',
		documentUrlPatterns: ['https://calendar.google.com/calendar/*']
	}, param));
};

let timeout;
function refreshContextMenus(tabId) {
	clearInterval(timeout);
	timeout = setTimeout(() => {
		setAuthToken();
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
				});
			});
		});
	}, 3000);
}

chrome.runtime.onInstalled.addListener(setAuthToken);
chrome.tabs.onUpdated.addListener(refreshContextMenus);

let fetchApi = (url, param) => {
	let baseUrl = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
	param = param || {
		'headers': {}
	};
	return new Promise((resolve, reject) => {
		chrome.storage.local.get('token', (value) => {
			Object.assign(param.headers, {
				'Authorization': 'Bearer ' + value.token
			});
			fetch(baseUrl + url, param).then(resolve, reject);
		});
	});
};

let fetchSelectedCalendar = () => {
	return fetchApi('?maxResults=250&fields=items(id%2Cselected)').then((res) => res.json());
}

function createGroup (clickData) {
	let name = prompt('group name');
	fetchSelectedCalendar().then((json) => {
		let ids = json.items
			.filter((item) => item.selected)
			.map((item) => item.id).join(':')
		;
		createContextMenus({
			id: 'CalendarGroup:' + ids,
			title: name
		});
		chrome.storage.local.get('calendarGroup', (value) => {
			chrome.storage.local.set({'calendarGroup': (value.calendarGroup || []).concat({
				name: name,
				ids: ids,
			})});
		});
	});
}

function selectGroup (menuItemId) {
	let ids = menuItemId.replace(/^CalendarGroup:/, '').split(/:/);
	fetchSelectedCalendar().then((json) => {
		let param = {
			method: 'PUT',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				'selected': true
			})
		};
		let unselectPromises = json.items
			.filter((item) => !ids.includes(item.id) && item.selected)
			.map((item) => new Promise((resolve) => {
				resolve
				let id = encodeURIComponent(item.id);
				fetchApi(`/${id}?fields=selected`, param)
			}))
		;
		let selectPromises = ids
			.filter((id) => json.items.find((item) => item.id === id && !item.selected))
			.map(encodeURIComponent)
			.map((id) => fetchApi(`/${id}?fields=selected`, param))
		;
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
	if (clickData.menuItemId.match(/^CalendarGroup:/)) {
		selectGroup(clickData.menuItemId)
		return;
	}
});