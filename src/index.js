require('dotenv').config()

/*jshint esversion: 8 */
const got = require('got');

const keepAliveAgent = new (require('https')).Agent({
	keepAlive: true
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

function extractDeviceIds(dailySum) {
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

async function getDevices(startDate, endDate) {
	let searchParams = {
		type: 'logID',
		id: 'SUM#DAILY',
		startTime: startDate,
		endTime: endDate
	};
	let resJson = await client.get('v1/test/dyndb', { searchParams }).json();

	let matchDev = {}
	resJson.forEach(dailySum => {
		matchDev[dailySum.amt] = extractDeviceIds(dailySum)
	});
	return matchDev;
}


async function getIDs(device, date) {
	let startTime = Date.UTC(date.substr(0, 4), date.substr(4, 2) - 1, date.substr(6));
	let endTime = startTime + 86400000 - 1;

	let searchParams = {
		type: 'logDEVICE',
		id: device,
		startTime,
		endTime,
	};

	const recomendationIdLogs = await client.get('v1/test/dyndb', { searchParams }).json();
	return recomendationIdLogs.map(({id}) => {
		return id;
		// const firstSplitIndex = id.indexOf('#') + 1
		// return id.substring(firstSplitIndex, id.indexOf('#', firstSplitIndex));
	})
}

async function getLog(recomendationId, date) {
	let startTime = Date.UTC(date.substr(0, 4), date.substr(4, 2) - 1, date.substr(6));
	let endTime = startTime + 86400000 - 1;

	let searchParams = {
		type: 'log',
		id: recomendationId,
		endTime,
		startTime,
	};
	// console.log(searchParams)
	return await client.get('v1/test/dyndb', { searchParams }).json();
}

(async () => {
	try {
		var matchingDevices = await getDevices('20200513', '20201120');
		console.log('result', matchingDevices);
		for (const date of Object.keys(matchingDevices).sort()) {
			let devices = matchingDevices[date];

			devices.forEach(async device => {
				const recomendationIds = await getIDs(device, date)
				recomendationIds.forEach(async recomendationId => {
					try {
						const logs = await getLog(recomendationId, date)
						console.log(logs)
					} catch (e) {
						console.error(e)
					}
				})
			})

		}
	} catch (err) {
		console.error(err);
	}
})();
