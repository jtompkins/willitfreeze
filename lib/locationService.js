import jsonp from 'jsonp';
import format from 'format';

import * as Constants from './constants';

class LocationService {
	constructor(bingKey) {
		this.bingKey = bingKey;
	}

	getGeolocation() {
		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition((location) => {
				let loc = { log: location.coords.longitude, lat: location.coords.latitude };

				resolve(loc);
			}, reject, null);
		});
	}

	getAddress(location) {
		return new Promise((resolve, reject) => {
			let url = format(Constants.BING_URL, location.lat, location.log, this.bingKey);

			jsonp(url, {param: 'jsonp'}, (err, data) => {
				if (err) reject(err);

				let set = data.resourceSets;

				if (!set || set.length < 1)
					resolve(null);

				let resources = set[0].resources;

				if (!resources || resources.length < 1)
					resolve(null);

				let address = resources[0].address;

				if (!address)
					resolve(null);

				resolve(address);
			});
		});
	}
}

export default LocationService;