let timeout;
function refreshContextMenus(evn, tabId) {
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
			chrome.contextMenus.removeAll(() => {
				chrome.contextMenus.create({
					id: 'CalendarGroupTop',
					title: 'Calendar Group',
					documentUrlPatterns: ['https://calendar.google.com/calendar/*']
				});
				chrome.storage.local.get('calendarGroup', (value) => {
					let calendarGroup = value.calendarGroup;
					(calendarGroup || []).forEach((group) => {
						chrome.contextMenus.create({
							id: 'CalendarGroup:' + group.ids,
							title: group.name,
							parentId: 'CalendarGroupTop',
							documentUrlPatterns: ['https://calendar.google.com/calendar/*']
						});
					});
					chrome.contextMenus.create({
						id: 'CalendarGroupCreate',
						title: 'add current group',
						parentId: 'CalendarGroupTop',
						documentUrlPatterns: ['https://calendar.google.com/calendar/*']
					});
				});
			});
		});
	}, 3000);
}

chrome.runtime.onInstalled.addListener(() => {
	chrome.identity.getAuthToken({ interactive: true }, (token) => {
		chrome.storage.local.set({'token': token});
	});
});
chrome.tabs.onUpdated.addListener((tab) => refreshContextMenus('onUpdated', tab));

chrome.contextMenus.onClicked.addListener((clickData) => {
	if (clickData.menuItemId === 'CalendarGroupCreate') {
		let name = prompt('hoge');
		chrome.storage.local.get('token', (value) => {
			fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&fields=items(id%2Cselected)', {
				headers: {
					'Authorization': 'Bearer ' + value.token
				}
			}).then((res) => res.json())
			.then((json) => {
				let ids = json.items
					.filter((item) => item.selected)
					.map((item) => item.id).join(':')
				;
				chrome.contextMenus.create({
					id: 'CalendarGroup:' + ids,
					title: name,
					parentId: 'CalendarGroupTop',
					documentUrlPatterns: ['https://calendar.google.com/calendar/*']
				});
				chrome.storage.local.get('calendarGroup', (value) => {
					chrome.storage.local.set({'calendarGroup': (value.calendarGroup || []).concat({
						name: name,
						ids: ids,
					})});
				});
			});
		});
		return;
	}
	if (clickData.menuItemId.match(/^CalendarGroup:/)) {
		let ids = clickData.menuItemId.replace(/^CalendarGroup:/, '').split(/:/);
		chrome.storage.local.get('token', (value) => {
			let promises = ids.map((id) => {
				return fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/'+id+'?fields=selected', {
					method: 'PUT',
					headers: {
						'Authorization': 'Bearer ' + value.token,
						'Accept': 'application/json',
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						'selected': true
					})
				});
			});
			Promise.all(promises).then(() => {
				chrome.tabs.reload();
			});
		});
		return;
	}
});