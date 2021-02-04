/*jshint esversion: 8 */

require('dotenv').config()

const got = require('got');
const fs = require('fs');
const path = require('path');

const keepAliveAgent = new (require('https')).Agent({
	keepAlive: true,
	maxSockets: 100,
	keepAliveMsecs: 5,
	proxy: 'https://localhost:8080',
});

const client = got.extend({
	prefixUrl: process.env.API_BASE_URL,
	searchParams: {
		tkn: process.env.API_TOKEN,
		key: process.env.API_KEY,
	},
	agent: {
		http: keepAliveAgent,
		https: keepAliveAgent,
	},
	responseType: 'json'
});

function extractDevices(dailySum) {
	const devices = [];

	for (const [key] of Object.entries(dailySum)) {
		if (!key.startsWith('md:')) {
				continue;
		}

		let device = key.substring(key.indexOf('#') + 1);
		devices.push(device)
	}

	return devices
}

function startOfDay(date) {
	return Date.UTC(date.substr(0, 4), date.substr(4, 2) - 1, date.substr(6));
}

function endOfDay(date) {
	const startTime = startOfDay(date);
	return startTime + 86400000 - 1;
}

async function getDevices(startDate, endDate) {
	let searchParams = {
		type: 'logID',
		id: 'SUM#DAILY',
		startTime: startDate,
		endTime: endDate
	};
	let dailySums = await client.get('v1/test/dyndb', { searchParams }).json();

	let devices = {}
	dailySums.forEach(dailySum => {
		devices[dailySum.amt] = extractDevices(dailySum)
	});
	return devices;
}

async function getRecomendationIds(device, date) {
	let searchParams = {
		type: 'logDEVICE',
		id: device,
		startTime: startOfDay(date),
		endTime: endOfDay(date),
	};

	const logs = await client.get('v1/test/dyndb', { searchParams }).json();
	const ids = logs.map(({id}) => id);
	return [...new Set(ids)];
}

async function getLogs(recomendationIds, date) {
	const requests = recomendationIds.map(async recomendationId => {
		let searchParams = {
			type: 'logID',
			id: recomendationId,
			startTime: startOfDay(date),
			endTime: endOfDay(date),
		};

		return await client.get('v1/test/dyndb', { searchParams }).json();
	})

	const logs = await Promise.all(requests)
	return logs.flat()
}

(async () => {
	let totalLogs = []

	try {
		const matchingDevices = await getDevices('20200513', '20201120');
		console.log('DEVICES', matchingDevices);

		for (const date of Object.keys(matchingDevices).sort()) {
			const devices = matchingDevices[date];

			for (const device of devices) {
				const recomendationIds = await getRecomendationIds(device, date)
				console.log(device, date, recomendationIds.length)

				const logs = await getLogs(recomendationIds, date)
				totalLogs = totalLogs.concat(logs)
				console.log(logs.length, totalLogs.lenght)
			}
		}

		fs.writeFileSync(path.resolve(__dirname, '../output.json'), JSON.stringify(totalLogs));
		console.log('Logs in total:', totalLogs.length)
	} catch (error) {
		console.error(error);
	}
})();
